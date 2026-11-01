// Direct control of the Mac for the planner's steps (plan.js), with no app knowledge in here: names, aliases
// and URL schemes come from the apps' own bundles; per-app scripts come from the planner. Every call says
// how long it took and fails with an error the planner can act on ("no Automation permission for Music",
// "the app has no such command", "script error -1728"), never a raw stack.
//   installedApps()          display names of every app, plus "Apple X" for Apple's own (cached)
//   findApp(name)            → { name, path, id, schemes } or null
//   openTarget({ app, url }) open, then check it really opened (the app, or the app that handles the URL)
//   runScript({ lang, code }) AppleScript or JXA through osascript (execFile, never a shell string)
//   check({ lang, code })     a script that answers true/false: did the step work?
import { execFile } from 'node:child_process';
import os from 'node:os';

const HOME = os.homedir();
const APP_DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities', `${HOME}/Applications`];

/** (cmd, args, { timeout }) → { stdout, stderr }; rejects with { stderr, killed } like execFile. Tests pass a fake. */
export const exec = (cmd, args, { timeout = 8000 } = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout, maxBuffer: 16e6 }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })) : resolve({ stdout: String(stdout), stderr: String(stderr) }))));
const now = () => performance.now();
const result = (t0, o) => ({ ...o, ms: Math.round(now() - t0) });

// ---- the apps on this Mac ----
const APPS_JXA = `ObjC.import('Foundation');
function run(argv) {
  const fm = $.NSFileManager.defaultManager, out = [];
  const str = (info, k) => { const v = info.objectForKey(k); return v.isNil() ? '' : ObjC.unwrap(v); };
  const scan = (dir, depth) => {
    const items = fm.contentsOfDirectoryAtPathError(dir, null);
    if (items.isNil()) return;
    for (let i = 0; i < items.count; i++) {
      const n = ObjC.unwrap(items.objectAtIndex(i)), p = dir + '/' + n;
      if (n.endsWith('.app')) {
        const b = $.NSBundle.bundleWithPath(p);
        if (b.isNil()) continue;
        const info = b.infoDictionary, schemes = [], types = info.objectForKey('CFBundleURLTypes');
        if (!types.isNil()) for (let j = 0; j < types.count; j++) { const s = types.objectAtIndex(j).objectForKey('CFBundleURLSchemes'); if (!s.isNil()) for (let k = 0; k < s.count; k++) schemes.push(ObjC.unwrap(s.objectAtIndex(k))); }
        out.push({ path: p, file: n.slice(0, -4), id: str(info, 'CFBundleIdentifier'), display: str(info, 'CFBundleDisplayName'), bundle: str(info, 'CFBundleName'), schemes });
      } else if (depth > 0 && !n.startsWith('.')) scan(p, depth - 1);
    }
  };
  JSON.parse(argv[0]).forEach((d) => scan(d, 1));
  return JSON.stringify(out);
}`;
let apps = null;   // ponytail: read once per run of Dixi; refresh() after installing an app
const norm = (s) => String(s ?? '').toLowerCase().replace(/\.app$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
async function load(run) {
  const raw = JSON.parse((await run('osascript', ['-l', 'JavaScript', '-e', APPS_JXA, JSON.stringify(APP_DIRS)], { timeout: 20000 })).stdout);
  return raw.map((a) => {
    const names = [...new Set([a.file, a.display, a.bundle].filter(Boolean))];
    // Apple's own apps are often called "Apple Music", "Apple Maps": the bundle id says which those are.
    if (/^com\.apple\./.test(a.id)) for (const n of [...names]) if (!/^apple\b/i.test(n)) names.push(`Apple ${n}`);
    return { name: a.display || a.file, names, keys: names.map(norm), path: a.path, id: a.id, schemes: a.schemes };
  });
}
export async function installedApps({ run = exec, refresh = false } = {}) {
  if (!apps || refresh) apps = load(run).catch((err) => { apps = null; throw err; });
  return [...new Set((await apps).flatMap((a) => a.names))].sort();
}
/** The app a name means: exact (any of its names, any case), else the only app whose name contains every word. */
export async function findApp(name, { run = exec } = {}) {
  await installedApps({ run });
  const list = await apps, k = norm(name);
  if (!k) return null;
  const exact = list.find((a) => a.keys.includes(k));
  if (exact) return pick(exact);
  const words = k.split(' ');
  const partial = list.filter((a) => a.keys.some((x) => words.every((w) => x.split(' ').includes(w))));
  return partial.length === 1 ? pick(partial[0]) : null;
}
const pick = ({ name, path, id, schemes }) => ({ name, path, id, schemes });

// ---- open, then check it opened ----
// Polls (inside one osascript, no permission needed) until the app is in front, or at least running.
const WAIT_JXA = `ObjC.import('AppKit');
function run(argv) {
  const id = argv[0], until = Date.now() + Number(argv[1]), ws = $.NSWorkspace.sharedWorkspace;
  let running = false;
  while (Date.now() < until) {
    const f = ws.frontmostApplication;
    if (!f.isNil() && ObjC.unwrap(f.bundleIdentifier) === id) return 'front';
    running = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(id).count > 0;
    delay(0.05);
  }
  return running ? 'running' : 'no';
}`;
const HANDLER_JXA = `ObjC.import('AppKit');
function run(argv) { const u = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString(argv[0])); if (u.isNil()) return ''; const b = $.NSBundle.bundleWithURL(u); return b.isNil() ? '' : ObjC.unwrap(b.bundleIdentifier); }`;

/** { app } or { url } (web pages and app links like music://…). → { ok, out: 'front' | 'running', app, error?, ms } */
export async function openTarget({ app, url } = {}, { run = exec, waitMs = 4000 } = {}) {
  const t0 = now();
  try {
    if (url) {
      let u;
      try { u = new URL(String(url)); } catch { return result(t0, { ok: false, error: `"${url}" isn't a link` }); }
      if (u.protocol === 'file:' && !decodeURIComponent(u.pathname).startsWith(HOME + '/')) return result(t0, { ok: false, error: 'Only files in your home folder can be opened by link' });
      if (/^(?:javascript|data|vbscript):$/i.test(u.protocol)) return result(t0, { ok: false, error: `${u.protocol} links aren't opened` });
      const handler = (await run('osascript', ['-l', 'JavaScript', '-e', HANDLER_JXA, u.href])).stdout.trim();
      if (!handler) return result(t0, { ok: false, error: `No app on this Mac opens ${u.protocol.replace(':', '')}: links` });
      await run('open', [u.href]);
      const seen = (await run('osascript', ['-l', 'JavaScript', '-e', WAIT_JXA, handler, String(waitMs)], { timeout: waitMs + 3000 })).stdout.trim();
      return result(t0, seen === 'no' ? { ok: false, error: `The link didn't open (${handler} didn't start)` } : { ok: true, out: seen, app: handler });
    }
    const a = await findApp(app, { run });
    if (!a) return result(t0, { ok: false, error: `There's no app called "${app}" on this Mac`, missing: true });
    await run('open', ['-a', a.path]);
    const seen = (await run('osascript', ['-l', 'JavaScript', '-e', WAIT_JXA, a.id, String(waitMs)], { timeout: waitMs + 3000 })).stdout.trim();
    return result(t0, seen === 'no' ? { ok: false, error: `${a.name} didn't start` } : { ok: true, out: seen, app: a.name });
  } catch (err) { return result(t0, { ok: false, error: scriptError(err).error }); }
}

// ---- scripts ----
// What a script may never do, checked before it runs. Shell commands inside a script are where the damage
// is: deleting (use the Trash), admin rights, erasing disks, power, system folders.
// ponytail: a deny-list over the script text, not a sandbox: a determined script can hide a command (string
// building, base64). The planner's scripts are model-written, not hostile; the kill key stops a runaway.
const SHELL = /do shell script|doShellScript|NSTask|NSAppleScript|NSUserUnixTask|\bspawn\b/i;
const DENY = [
  [/\brm\s+-|\brm\s+\S|\bunlink\b|\bshred\b|removeItemAtPath|removeItemAtURL|trashItemAtURL[^;]*\/(?:System|Library|usr|bin|etc|private)/i, 'deletes files (move them to the Trash instead)'],
  [/\bsudo\b|with administrator privileges|\bsu\s|AuthorizationExecute/i, 'needs administrator rights'],
  [/\bdiskutil\s+(?:erase|zero|secureErase|partition|reformat|unmount)|\bmkfs|\bdd\s+if=|\bnewfs/i, 'erases or changes a disk'],
  [/\b(?:shutdown|reboot|halt)\b|\bpmset\b|\bkillall\s+(?:Finder|Dock|SystemUIServer|loginwindow|WindowServer)/i, 'restarts or shuts down the Mac'],
  [/\bcsrutil\b|\bspctl\b|\blaunchctl\b|\bcrontab\b|\bchmod\s+-R|\bchown\b|\bdefaults\s+write\s+\/Library/i, 'changes system security or startup settings'],
  [/curl[^\n]*\|\s*(?:ba|z)?sh|wget[^\n]*\|\s*(?:ba|z)?sh|\|\s*(?:ba|z)?sh\b/i, 'runs code downloaded from the internet'],
];
// Paths a shell command may touch: only under your home folder (and the temp folder).
const SYS_PATH = /(?:^|[\s"'=(])\/(?!Users\/|tmp\/|private\/tmp\/|private\/var\/folders\/|var\/folders\/|Applications\/[^"'\s]*\.app\b)[A-Za-z]/;

/** Why a script may not run, or null. */
export function refuse(code) {
  const c = String(code ?? '');
  for (const [re, why] of DENY) if (re.test(c)) return `The script ${why}, so it wasn't run`;
  if (SHELL.test(c)) {
    // Each shell command's text (the string after "do shell script"), checked for paths outside home.
    const cmds = [...c.matchAll(/(?:do shell script|doShellScript)\s*\(?\s*(["'`])((?:\\.|(?!\1).)*)\1/gi)].map((m) => m[2]);
    if (/NSTask|NSAppleScript|NSUserUnixTask|\bspawn\b/i.test(c)) return "The script starts other programs directly, so it wasn't run";
    const outside = cmds.find((x) => SYS_PATH.test(` ${x.replace(/~\//g, `${HOME}/`)}`) && !x.includes(HOME));
    if (outside) return `The script touches files outside your home folder ("${outside.slice(0, 60)}"), so it wasn't run`;
  }
  return null;
}

// AppleScript error numbers the planner can act on.
const ERR = {
  '-1743': (app) => `Dixi isn't allowed to control ${app || 'that app'}. Allow it in System Settings → Privacy & Security → Automation`,
  '-1744': (app) => `Dixi isn't allowed to control ${app || 'that app'}. Allow it in System Settings → Privacy & Security → Automation`,
  '-1728': () => "That item wasn't found in the app (wrong name, or it isn't there)",
  '-1708': (app) => `${app || 'The app'} doesn't understand that command`,
  '-1712': (app) => `${app || 'The app'} took too long to answer`,
  '-600': (app) => `${app || 'The app'} isn't running`,
  '-10810': (app) => `${app || 'The app'} couldn't be started`,
  '-2741': () => 'The script has a syntax error',
  '-2753': () => 'The script uses a variable it never set',
  '-128': () => 'It was cancelled',
  '-1719': () => 'Dixi needs the Accessibility permission for that (System Settings → Privacy & Security → Accessibility)',
  '-25211': () => 'Dixi needs the Accessibility permission for that (System Settings → Privacy & Security → Accessibility)',
};
/** osascript's failure → { error (plain words), code (the AppleScript error number), app, detail }. */
export function scriptError(err) {
  if (err?.killed || err?.signal === 'SIGTERM') return { error: 'The script took too long and was stopped', code: 'timeout' };
  const msg = String(err?.stderr || err?.message || err || '').trim();
  const num = /\((-?\d+)\)\s*$/.exec(msg)?.[1] ?? /\berror\s+(-?\d+)/i.exec(msg)?.[1] ?? null;
  const app = /send Apple events to ([^.]+?)\./i.exec(msg)?.[1] ?? /^(?:[\d:]+\s*)?execution error:\s*(.+?) got an error/i.exec(msg)?.[1] ?? /Application(?: named)? ['"]?([^'"]+?)['"]? (?:isn't|is not) running/i.exec(msg)?.[1] ?? '';
  const detail = msg.replace(/^[\d:]+\s*/, '').replace(/^execution error:\s*/i, '').replace(/\s*\(-?\d+\)\s*$/, '').slice(0, 200);
  const known = num && ERR[num];
  return { error: known ? known(app) : `Script error${num ? ` ${num}` : ''}: ${detail || 'it failed'}`, code: num ? Number(num) : null, app, detail };
}

/** → { ok, out?, error?, code?, app?, ms }. Never throws. */
export async function runScript({ lang = 'applescript', code, timeoutMs = 8000 } = {}, { run = exec } = {}) {
  const t0 = now();
  if (!String(code ?? '').trim()) return result(t0, { ok: false, error: 'The script is empty' });
  if (!['applescript', 'jxa'].includes(lang)) return result(t0, { ok: false, error: `Unknown script language ${lang}` });
  const no = refuse(code);
  if (no) return result(t0, { ok: false, error: no, refused: true });
  try {
    const { stdout } = await run('osascript', [...(lang === 'jxa' ? ['-l', 'JavaScript'] : []), '-e', String(code)], { timeout: timeoutMs });
    return result(t0, { ok: true, out: stdout.replace(/\n$/, '') });
  } catch (err) { return result(t0, { ok: false, ...scriptError(err) }); }
}

/** A check script answers true or false (AppleScript true/false, JXA true/false, or 1/0). */
export async function check({ lang = 'applescript', code, timeoutMs = 5000 } = {}, deps) {
  const r = await runScript({ lang, code, timeoutMs }, deps);
  return r.ok && /^(?:true|yes|1)$/i.test(String(r.out).trim());
}
