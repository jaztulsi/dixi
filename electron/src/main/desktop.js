// Desktop verbs: the Mac obeys with no AI. "volume up", "pause the music", "go to youtube.com", "snap it
// left", "set a timer for 10 minutes", "dark mode", "lock the screen", "battery", "take a screenshot",
// "turn wifi off", "quit Safari". Words are matched by regex in code; every command is a fixed script or
// program. What you said never becomes script text: it goes in as an argument (argv) or as JSON. No shell.
// Never here, on purpose: empty trash, shut down, restart, deleting anything.
// Needs Automation permission for System Events (windows, dark mode) and for Music / Spotify (media).

import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { unsafe } from './safesite.js';

/** The real exec: (cmd, args) → stdout. execFile, never a shell. The tests pass a fake. */
export const exec = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 8000 }, (err, out) => (err ? reject(err) : resolve(String(out).trim())));
});

// ---- what was said → which verb (pure) ----
const PRE = String.raw`(?:(?:hey |ok |okay )?dixi,? ?)?(?:please |can you |could you |will you )?`;
const POST = String.raw`(?:,? please)?[.!?]?`;
const WHAT = String.raw`what(?:['’]?s| is)`;
const SUBJ = String.raw`(?:it|this|that|the window|this window|window|the front window)`;
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60 };
const NUM = String.raw`(?:\d+(?:\.\d+)?|an?|half an?|${Object.keys(WORDS).join('|')})`;
const UNIT = String.raw`(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)`;
const DUR = String.raw`${NUM}[ -]?${UNIT}(?:(?: and)? ${NUM}[ -]?${UNIT})*`;
const APPNAME = String.raw`[a-z0-9][a-z0-9 .&+'’-]{0,38}?`;
// Names that look like files, not sites: "open notes.md" is not a website.
const NOT_TLD = /\.(md|js|ts|py|txt|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|zip|sh|app|exe|json|html?|css|csv|rtf|mov|mp[34]|dmg|pkg|log)$/i;
const MEDIA_NOUN = String.raw`(?:music|song|track|playback|spotify|apple music)`;

const rule = (verb, body, args = () => ({})) => ({ verb, re: new RegExp(`^${PRE}(?:${body})${POST}$`, 'i'), args });
const RULES = [
  rule('volume', String.raw`(?:set |turn |put )?(?:the )?(?:volume|sound)(?: level)?(?: to| at)? (\d{1,3})(?: ?%| percent)?`, (m) => ({ op: 'set', pct: Math.min(100, Number(m[1])) })),
  rule('volume', String.raw`(?:(?:turn|make|bring|put) )?(?:the )?(?:volume|sound)(?: level)? (?:up|down)|volume (?:up|down)|(?:make it |turn it )?(?:louder|quieter)`, (m) => ({ op: /\b(up|louder)\b/i.test(m[0]) ? 'up' : 'down' })),
  rule('volume', String.raw`(un)?mute(?: the)?(?: sound| volume| audio| mac| computer)?`, (m) => ({ op: m[1] ? 'unmute' : 'mute' })),
  rule('media', String.raw`play ?/ ?pause|play pause|toggle (?:the )?(?:music|playback)`, () => ({ op: 'playpause' })),
  rule('media', String.raw`(?:pause|stop)(?: the| my)? ${MEDIA_NOUN}`, (m) => ({ op: 'pause', app: mediaApp(m[0]) })),
  rule('media', String.raw`(?:play|resume|unpause)(?: the| my)? ${MEDIA_NOUN}`, (m) => ({ op: 'play', app: mediaApp(m[0]) })),
  rule('media', String.raw`skip(?: the| this)? (?:song|track)|(?:play )?(?:the )?next (?:song|track)`, () => ({ op: 'next' })),
  rule('media', String.raw`(?:play )?(?:the )?(?:previous|last) (?:song|track)|go back (?:a|one) (?:song|track)`, () => ({ op: 'previous' })),
  rule('media', String.raw`${WHAT}(?: song| track)? (?:now )?playing(?: right now)?|what (?:song|track) is (?:this|playing)(?: right now)?|${WHAT} this (?:song|track)`, () => ({ op: 'now' })),
  rule('site', String.raw`(?:go to|open|visit|browse to) (?:https?://)?((?:[a-z0-9-]+(?:\.| dot ))+[a-z]{2,})(/[\w\-./%?=&#~+]*)?`, (m) => siteArgs(m[1], m[2])),
  rule('window', String.raw`(?:(?:move|snap|put|send|tile) ${SUBJ} (?:to |on )?(?:the )?left(?: half| side)?|(?:snap|tile) left|left half)`, () => ({ op: 'left' })),
  rule('window', String.raw`(?:(?:move|snap|put|send|tile) ${SUBJ} (?:to |on )?(?:the )?right(?: half| side)?|(?:snap|tile) right|right half)`, () => ({ op: 'right' })),
  rule('window', String.raw`maximi[sz]e(?: ${SUBJ})?|(?:make|snap|put) ${SUBJ} (?:full ?screen|full|fill the screen|maximi[sz]ed)`, () => ({ op: 'full' })),
  rule('window', String.raw`(?:center|centre) (?:the |this |my )?(?:front )?window|(?:move|put) ${SUBJ} (?:to )?(?:the )?(?:center|centre|middle)`, () => ({ op: 'center' })),
  rule('window', String.raw`(?:move|send|put|throw) ${SUBJ} to (?:the )?(?:other|next|second) (?:screen|display|monitor)`, () => ({ op: 'other' })),
  rule('timer', String.raw`(?:set |start |create )?(?:a |an )?(?:timer|alarm) (?:for |of )?(${DUR})`, (m) => ({ ms: parseDuration(m[1]) })),
  rule('timer', String.raw`(?:set |start )(?:a |an )?(${DUR}) timer`, (m) => ({ ms: parseDuration(m[1]) })),
  rule('timer', String.raw`remind me in (${DUR}) to (.{1,100})`, (m) => ({ ms: parseDuration(m[1]), label: m[2].trim() })),
  rule('timer', String.raw`remind me to (.{1,100}?) in (${DUR})`, (m) => ({ ms: parseDuration(m[2]), label: m[1].trim() })),
  rule('timers', String.raw`what timers (?:do i have|are (?:running|set))|(?:list|show)(?: my)?(?: the)? timers|how (?:much time(?: is)?|long(?: is)?) left(?: on (?:the|my) timer)?|do i have any timers`),
  rule('cancel', String.raw`(?:cancel|stop|clear|delete|remove) (?:the |my |all |all my |every )?(?:timers?|reminders?)`, (m) => ({ all: /\b(all|every)\b|timers\b|reminders\b/i.test(m[0]) })),
  rule('dark', String.raw`(?:toggle|flip|switch)(?: the)? (?:dark mode|appearance)`, () => ({ mode: 'toggle' })),
  rule('dark', String.raw`(?:(?:turn|switch|set) off|disable)(?: the)? dark mode|(?:turn|switch|set) (?:the )?dark mode off|(?:(?:turn on|switch to|go to|enable|use|set) )?(?:the )?light mode|dark mode off`, () => ({ mode: 'off' })),
  rule('dark', String.raw`(?:(?:turn on|switch to|go to|enable|use|set) )?(?:the )?dark mode(?: on)?|(?:turn|switch|set) (?:the )?dark mode on`, () => ({ mode: 'on' })),
  rule('lock', String.raw`lock (?:the |my )?(?:screen|mac|macbook|computer|laptop)`),
  rule('battery', String.raw`how much battery(?: do i have| is left| life)?(?: left)?|(?:${WHAT}|how(?:['’]?s| is)) (?:my |the )?battery(?: level| life| percentage)?(?: at| doing)?|(?:check |show |tell me )?(?:my |the )?battery(?: level| life| status| percentage)?|am i charging|is it charging`),
  rule('screenshot', String.raw`(?:take |grab |capture )(?:a |the |me a )?(?:screen ?shot|screen capture)(?: of (?:my|the) (?:screen|desktop))?|screen ?shot(?: (?:my|the) screen)?|capture (?:my |the )?screen`),
  rule('wifi', String.raw`(?:turn|switch|set) (?:on|off) (?:the |my )?wi[- ]?fi|(?:turn|switch|set) (?:the |my )?wi[- ]?fi (?:on|off)|(?:enable|disable) (?:the |my )?wi[- ]?fi|wi[- ]?fi (?:on|off)`, (m) => ({ on: /\b(on|enable)\b/i.test(m[0]) })),
  rule('quit', String.raw`(?:force )?quit (?:the )?(${APPNAME})(?: app| application)?`, (m) => ({ app: m[1].trim() })),
];
const mediaApp = (s) => (/spotify/i.test(s) ? 'Spotify' : /apple music/i.test(s) ? 'Music' : undefined);
const NOT_APPS = /^(this|that|it|everything|all|dixi|app|the app|here)$/i;

/** One regex for every desktop line, for everywhere-words.js: these go to Everywhere. */
export const DESKTOP = new RegExp(RULES.map((r) => r.re.source).join('|'), 'i');

function siteArgs(host, path = '') {
  host = host.replace(/ dot /gi, '.').toLowerCase();
  return { host, path };
}
/** "10 minutes", "an hour and 30 minutes", "half an hour", "ninety seconds" → milliseconds (1 s to 24 h), or 0. */
export function parseDuration(s) {
  let ms = 0;
  for (const [, n, u] of String(s).toLowerCase().matchAll(new RegExp(`(${NUM})[ -]?(${UNIT})`, 'g'))) {
    const k = /^(half)/.test(n) ? 0.5 : /^an?$/.test(n) ? 1 : WORDS[n] ?? Number(n);
    ms += k * (u.startsWith('h') ? 3600000 : u.startsWith('m') ? 60000 : 1000);
  }
  return ms >= 1000 && ms <= 86400000 ? Math.round(ms) : 0;
}
/** "go to youtube.com" → { verb: 'site', url }; "snap it left" → { verb: 'window', op: 'left' }; or null. */
export function desktopIntent(text) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 200) return null;
  for (const { verb, re, args } of RULES) {
    const m = t.match(re);
    if (!m) continue;
    const a = args(m);
    if (verb === 'site') {
      const url = validSite(a.host, a.path);
      return url ? { verb, url } : null;
    }
    if (verb === 'timer' && !a.ms) return null;
    if (verb === 'quit' && NOT_APPS.test(a.app)) return null;
    return { verb, ...a };
  }
  return null;
}
/** https:// plus a real-looking host, or null. Files ("notes.md") and bare words are not sites. */
export function validSite(host, p = '') {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host) || NOT_TLD.test(host)) return null;
  try { const u = new URL(`https://${host}${p}`); return u.protocol === 'https:' && u.hostname === host ? u.href : null; } catch { return null; }
}

// ---- the window layout: where the front window goes, for the screens you have (pure) ----
/** screens: [{ x, y, width, height }] (usable areas, top-left origin). win: { pos: [x, y], size: [w, h] }. */
export function layoutRect(op, screens, win) {
  const cx = win.pos[0] + win.size[0] / 2, cy = win.pos[1] + win.size[1] / 2;
  const here = Math.max(0, screens.findIndex((s) => cx >= s.x && cx < s.x + s.width && cy >= s.y && cy < s.y + s.height));
  if (op === 'other' && screens.length < 2) return null;
  const s = screens[op === 'other' ? (here + 1) % screens.length : here];
  const hw = Math.floor(s.width / 2);
  const w = Math.min(win.size[0], s.width), h = Math.min(win.size[1], s.height);
  const r = op === 'left' ? [s.x, s.y, hw, s.height]
    : op === 'right' ? [s.x + hw, s.y, s.width - hw, s.height]
    : op === 'full' ? [s.x, s.y, s.width, s.height]
    : [s.x + (s.width - w) / 2, s.y + (s.height - h) / 2, w, h];   // center, and the other screen: centred, same size
  return r.map(Math.round);
}
/** `pmset -g batt` → "84 percent, charging"; null on a Mac with no battery. */
export function parseBattery(out) {
  const m = String(out).match(/(\d{1,3})%;\s*([^;\n]+)/);
  if (!m) return null;
  const state = { charging: 'charging', discharging: 'on battery', charged: 'fully charged', 'finishing charge': 'almost full', 'not charging': 'plugged in, not charging' }[m[2].trim().toLowerCase()] ?? m[2].trim();
  return `${m[1]} percent, ${state}`;
}
const spoken = (ms) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = [[h, 'hour'], [m, 'minute'], [h || m ? 0 : r, 'second']].filter(([n]) => n).map(([n, u]) => `${n} ${u}${n > 1 ? 's' : ''}`);
  return p.join(' ') || 'under a minute';
};
const stamp = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`; };

// ---- doing it ----
// In memory only: gone when Dixi quits. ponytail: no persistence; a reminder you need across restarts belongs in Reminders.
const live = [];
let seq = 0;
const MEDIA_APPS = ['Spotify', 'Music'];   // ponytail: the first one running wins; "Spotify"/"Apple Music" in your words picks one
const MEDIA_CMD = { playpause: 'playpause', play: 'play', pause: 'pause', next: 'next track', previous: 'previous track' };
const out = (say, title = 'Dixi') => ({ say, title, text: say });

/** Run one intent from desktopIntent(). Returns { say, title, text }; never throws.
 *  deps: exec(cmd, args) → stdout, say(text) (for timers that fire later), approve(question) → boolean,
 *  now() → Date, setTimer(ms, fn) → cancel function, screens() → [{ x, y, width, height }], home. */
export async function runDesktop(intent, deps) {
  const d = { now: () => new Date(), setTimer: (ms, fn) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); }, home: homedir(), screens: () => [], live, ...deps };
  try {
    const fn = DO[intent?.verb];
    return fn ? await fn(intent, d) : out("I don't know that one.");
  } catch (err) {
    if (/-1743|not authori[sz]ed|assistive/i.test(String(err?.message ?? err))) return out('Dixi needs permission to control that app. Allow it in System Settings, Privacy and Security, Automation, then ask again.', 'Permission needed');
    return out("That didn't work.", 'Dixi');
  }
}
const osa = (d, script, ...argv) => d.exec('osascript', ['-e', script, ...argv]);
const jxa = (d, body, args = {}) => d.exec('osascript', ['-l', 'JavaScript', '-e', `const A = ${JSON.stringify(args)}; ${body}`]);   // args as JSON, never as text
const running = (d, app) => osa(d, 'application "' + app + '" is running').then((r) => r === 'true', () => false);   // app is one of MEDIA_APPS: fixed words

const DO = {
  async volume(i, d) {
    if (i.op === 'mute' || i.op === 'unmute') {
      await osa(d, `set volume ${i.op === 'mute' ? 'with' : 'without'} output muted`);
      return out(i.op === 'mute' ? 'Muted.' : 'Unmuted.', 'Volume');
    }
    let n = i.pct;
    if (i.op !== 'set') {
      const cur = parseInt(await osa(d, 'output volume of (get volume settings)'), 10);
      n = (Number.isNaN(cur) ? 50 : cur) + (i.op === 'up' ? 10 : -10);
    }
    n = Math.max(0, Math.min(100, Math.round(n)));   // a clamped integer is the only thing in the script
    await osa(d, `set volume output volume ${n} without output muted`);
    return out(`Volume ${n} percent.`, 'Volume');
  },
  async media(i, d) {
    for (const app of i.app ? [i.app] : MEDIA_APPS) {
      if (!MEDIA_APPS.includes(app) || !(await running(d, app))) continue;
      if (i.op === 'now') {
        const r = await osa(d, `tell application "${app}" to (name of current track) & " by " & (artist of current track)`).catch(() => '');
        return out(r ? `Playing ${r}.` : 'Nothing is playing.', app);
      }
      await osa(d, `tell application "${app}" to ${MEDIA_CMD[i.op]}`);
      return out({ playpause: 'Done.', play: 'Playing.', pause: 'Paused.', next: 'Next song.', previous: 'Previous song.' }[i.op], app);
    }
    return out(`${i.app ?? 'Music and Spotify'} ${i.app ? "isn't" : "aren't"} open. Open it first and I'll control it.`, 'Media');
  },
  async site(i, d) {
    const u = new URL(i.url);   // checked again: only https and a real host ever reach `open`
    const url = validSite(u.hostname, u.pathname + u.search + u.hash);
    if (!url) return out("That doesn't look like a website.");
    const why = unsafe(url);   // a caller reading out "chase-secure-login.com" is exactly this case
    if (why) return out(`${why} I didn't open it.`, 'Dixi Guardian');
    await d.exec('open', [url]);
    return out(`Opening ${u.hostname.replace(/^www\./, '')}.`, 'Opening');
  },
  async window(i, d) {
    const win = JSON.parse(await jxa(d, `const p = Application('System Events').applicationProcesses.whose({frontmost: true})[0]; const w = p.windows[0];
      JSON.stringify({ pos: w.position(), size: w.size() });`));
    const r = layoutRect(i.op, await d.screens(), win);
    if (!r) return out('You only have one screen.', 'Window');
    await jxa(d, `const p = Application('System Events').applicationProcesses.whose({frontmost: true})[0]; const w = p.windows[0];
      w.position = [A.r[0], A.r[1]]; w.size = [A.r[2], A.r[3]]; w.position = [A.r[0], A.r[1]];`, { r });
    return out({ left: 'Left half.', right: 'Right half.', full: 'Maximized.', center: 'Centered.', other: 'Moved to the other screen.' }[i.op], 'Window');
  },
  async timer(i, d) {
    const id = ++seq;
    const cancel = d.setTimer(i.ms, () => {
      d.live.splice(0, d.live.length, ...d.live.filter((t) => t.id !== id));
      d.say(i.label ? `Reminder: ${i.label}.` : 'Your timer is done.');
    });
    d.live.push({ id, at: Number(d.now()) + i.ms, label: i.label, cancel });
    return out(i.label ? `Okay, I'll remind you in ${spoken(i.ms)}.` : `Timer set for ${spoken(i.ms)}.`, 'Timer');
  },
  async timers(i, d) {
    if (!d.live.length) return out("You don't have any timers.", 'Timers');
    const items = d.live.map((t) => `${spoken(t.at - Number(d.now()))} left${t.label ? ` to ${t.label}` : ''}`);
    return out(`You have ${items.length} ${items.length > 1 ? 'timers' : 'timer'}: ${items.join(', and ')}.`, 'Timers');
  },
  async cancel(i, d) {
    if (!d.live.length) return out("You don't have any timers.", 'Timers');
    const gone = i.all ? d.live.splice(0) : d.live.splice(d.live.indexOf(d.live.reduce((a, b) => (b.at < a.at ? b : a))), 1);   // "the timer" = the soonest
    gone.forEach((t) => t.cancel?.());
    return out(gone.length > 1 ? `Cancelled ${gone.length} timers.` : 'Cancelled.', 'Timers');
  },
  async dark(i, d) {
    const r = await jxa(d, `const p = Application('System Events').appearancePreferences;
      p.darkMode = A.mode === 'toggle' ? !p.darkMode() : A.mode === 'on'; p.darkMode();`, { mode: i.mode });
    return out(r === 'true' ? 'Dark mode on.' : 'Dark mode off.', 'Appearance');
  },
  async lock(i, d) {
    // ⌃⌘Q really locks; pmset only turns the screen off (it locks only with "require password immediately").
    if (d.key) { await d.key('ctrl+cmd+q'); return out('Locking.', 'Lock'); }
    await d.exec('pmset', ['displaysleepnow']);
    return out('Screen off.', 'Lock');
  },
  async battery(i, d) {
    const b = parseBattery(await d.exec('pmset', ['-g', 'batt']));
    return out(b ? `${b}.` : 'This Mac has no battery.', 'Battery');
  },
  async screenshot(i, d) {
    await d.exec('screencapture', ['-x', path.join(d.home, 'Desktop', `Screenshot ${stamp(d.now())}.png`)]);
    return out('Saved a screenshot to your Desktop.', 'Screenshot');
  },
  async wifi(i, d) {
    if (!i.on && !(await d.approve('Turn Wi-Fi off? You will lose your internet connection.'))) return out('Okay, I left Wi-Fi on.', 'Wi-Fi');
    const ports = await d.exec('networksetup', ['-listallhardwareports']).catch(() => '');
    const dev = ports.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\w+)/)?.[1] ?? 'en0';
    await d.exec('networksetup', ['-setairportpower', dev, i.on ? 'on' : 'off']);
    return out(i.on ? 'Wi-Fi on.' : 'Wi-Fi off.', 'Wi-Fi');
  },
  async quit(i, d) {
    const name = String(i.app ?? '');
    if (!/^[a-z0-9][a-z0-9 .&+'’-]{0,39}$/i.test(name)) return out("I couldn't tell which app to quit.", 'Quit');
    // Only an app that is running (telling a closed one to quit would open it first). The name is an argument, never script text.
    const on = await osa(d, 'on run argv\nreturn application (item 1 of argv) is running\nend run', name).catch(() => 'false');
    if (on !== 'true') return out(`${name} isn't open.`, 'Quit');
    if (!(await d.approve(`Quit ${name}? Unsaved work may be lost.`))) return out(`Okay, I didn't quit ${name}.`, 'Quit');
    await osa(d, 'on run argv\ntell application (item 1 of argv) to quit\nend run', name);
    return out(`Quit ${name}.`, 'Quit');
  },
};
