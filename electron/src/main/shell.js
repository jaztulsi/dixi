// Terminal commands Dixi may run by itself: the agent's Bash tool and the planner's `shell` steps both go
// through bashRefusal. A planner shell step is stricter (shellStepRefusal): it may look things up, open things
// and run your Shortcuts, never change a file. Writes go through Dixi's file and script steps, which check names.
import os from 'node:os';
import { execFile } from 'node:child_process';

export const OK_CMDS = new Set(['open', 'mdfind', 'mdls', 'ls', 'cat', 'head', 'tail', 'wc', 'date', 'cal', 'pmset', 'sw_vers', 'system_profiler', 'df', 'du', 'uptime', 'whoami', 'pwd', 'echo', 'grep', 'find', 'file', 'stat', 'defaults', 'shortcuts', 'sips', 'mv', 'mkdir', 'cp', 'zip', 'bc', 'sort', 'uniq', 'basename', 'dirname', 'pbcopy', 'say', 'top', 'ps', 'vm_stat', 'sysctl', 'ioreg', 'scutil', 'ipconfig', 'ifconfig', 'pgrep', 'osascript']);
const PLACES = ['/Applications', '/System/Applications', '/tmp', '/private/tmp', '/Volumes'];
/** null when the command may run, else why not (said to the model). */
export function bashRefusal(cmd, home = os.homedir(), { allowDelete = false } = {}) {
  const c = String(cmd ?? '').trim();
  if (!c) return 'Empty command.';
  if (/[`]|\$\(|<\(|>\(/.test(c)) return 'No command substitution.';
  if (/(^|\s)(?:sudo|su)\s/.test(c)) return 'No sudo.';
  if (!allowDelete && /_to_delete/.test(c)) return 'Deleting is off in Dixi\'s settings (Allow deleting). Tell the user that, and do nothing else.';
  if (/[<>]/.test(c.replace(/\d?>&\d|&?\d?>\s*\/dev\/null/g, ''))) return 'No redirection into files.';
  for (const seg of c.split(/&&|\|\||;|\|/)) {
    const words = seg.trim().split(/\s+/).filter((w) => !/^[A-Z_]+=/.test(w));
    const w0 = words[0] ?? '';
    if (!w0) continue;
    if (!OK_CMDS.has(w0)) return w0 === 'rm' || w0 === 'rmdir' || w0 === 'trash' ? 'Deleting isn\'t allowed: move it into ~/_to_delete instead.' : `${w0} isn't on Dixi's allowed list.`;
    if (w0 === 'defaults' && !/^(?:read|domains)$/.test(words[1] ?? '')) return 'defaults: read only.';
    if (w0 === 'pmset' && words[1] !== '-g') return 'pmset: read only (-g).';
    if (w0 === 'shortcuts' && !/^(?:run|list)$/.test(words[1] ?? '')) return 'shortcuts: run or list only.';
    if (w0 === 'osascript') return 'Use the applescript tool instead.';
    if (w0 === 'find' && words.some((x) => /^-(?:delete|exec|execdir|ok)$/.test(x))) return 'find: no -delete or -exec.';
    if (w0 === 'find' && /^['"]?(?:~|\$HOME|\/)\/?['"]?$|^['"]?\/Users\/[^/]+\/?['"]?$/.test(words[1] ?? '')) return 'find over the whole home folder takes minutes: use mdfind, or find in one folder such as ~/Desktop.';
    for (const x of words.slice(1)) {
      const p = x.replace(/^['"]|['"]$/g, '').replace(/^~(?=\/|$)/, home);
      if (p.includes('..')) return 'No ".." in paths.';
      if (p.startsWith('/') && ![home, ...PLACES].some((d) => p === d || p.startsWith(`${d}/`))) return `${x} is outside the folders Dixi may touch.`;
    }
  }
  return null;
}


// What a planned step may run: reads, `open`, Shortcuts, `say`, the clipboard. No mv/cp/mkdir/zip/sips writes.
const STEP_CMDS = new Set(['open', 'mdfind', 'mdls', 'ls', 'cat', 'head', 'tail', 'wc', 'date', 'cal', 'pmset', 'sw_vers', 'df', 'du', 'uptime', 'whoami', 'echo', 'grep', 'find', 'file', 'stat', 'defaults', 'shortcuts', 'bc', 'sort', 'uniq', 'basename', 'dirname', 'pbcopy', 'say', 'pgrep', 'vm_stat', 'sysctl', 'ipconfig', 'scutil']);
export function shellStepRefusal(cmd, home = os.homedir()) {
  const why = bashRefusal(cmd, home);
  if (why) return why;
  for (const seg of String(cmd).split(/&&|\|\||;|\|/)) {
    const w0 = seg.trim().split(/\s+/).filter((w) => !/^[A-Z_]+=/.test(w))[0] ?? '';
    if (w0 && !STEP_CMDS.has(w0)) return `${w0} changes files: not as a planned step.`;
  }
  return null;
}

/** Runs one allowed command (checked again here): { ok, out, error, ms }. 8 s at most; non-zero exit = not ok. */
export function runShell(cmd, { home = os.homedir(), timeout = 8000, check = shellStepRefusal, run = execFile } = {}) {
  const why = check(cmd, home);
  const t0 = Date.now();
  if (why) return Promise.resolve({ ok: false, refused: true, error: why, ms: 0 });
  return new Promise((resolve) => run('/bin/zsh', ['-f', '-c', cmd], { cwd: home, timeout, maxBuffer: 4e6, env: { ...process.env, HOME: home } }, (err, stdout, stderr) =>
    resolve(err ? { ok: false, error: String(stderr || err.message).trim().slice(0, 300) || `exit ${err.code}`, out: String(stdout ?? '').trim(), ms: Date.now() - t0 }
      : { ok: true, out: String(stdout).trim().slice(0, 4000), ms: Date.now() - t0 })));
}
