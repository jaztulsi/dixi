// Push-to-talk, the main-process side: hold Control (alone) to talk, let go to send (Nov 5: the user's key;
// ⌥Space is now the instant stop). Esc is a global key only while a session is open, and is released on
// every way out; and who probably holds a taken hotkey.
import { spawn as nodeSpawn } from 'node:child_process';

export function pttSession({ register, unregister, onEsc }) {
  let open = false;
  return {
    get open() { return open; },
    start() { if (!open) { open = true; register('Escape', onEsc); } },
    end() { if (open) { open = false; unregister('Escape'); } },
  };
}

// macOS has no global shortcut for a bare modifier, so a tiny JXA loop reads the keyboard's state ~30 times a
// second (CGEventSourceFlagsState and the event counters: no permission needed, nothing is intercepted) and
// prints only changes: c1 = Control went down alone, c0 = it came up, k = it became a shortcut (another key,
// another modifier, a click or a scroll while it's down: ⌃C, ⌃-click, ⌃⌘Q). Never the keys themselves.
const CTRL_JXA = `ObjC.import('CoreGraphics'); ObjC.import('Foundation');
const S = 1, CTRL = 0x40000, OTHER = 0x100000 | 0x80000 | 0x20000 | 0x800000;
const n = () => [10, 1, 3, 22].reduce((a, t) => a + $.CGEventSourceCounterForEventType(S, t), 0);
const out = $.NSFileHandle.fileHandleWithStandardOutput;
const emit = (s) => out.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));
let st = 0, base = 0;
for (;;) {
  const f = $.CGEventSourceFlagsState(S), ctrl = (f & CTRL) !== 0, alone = ctrl && (f & OTHER) === 0;
  if (!ctrl) { if (st === 1) emit('c0'); st = 0; }
  else if (st === 0) { if (alone) { st = 1; base = n(); emit('c1'); } else st = 2; }
  else if (st === 1 && (!alone || n() !== base)) { st = 2; emit('k'); }
  delay(0.03);
}`;

/** c1 c0 k → talk / send / drop. A tap shorter than `holdMs` is nothing; so is a shortcut started before it. */
export function holdToTalk({ onStart, onEnd, onCancel, holdMs = 200, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t) }) {
  let timer = null, talking = false;
  return (ev) => {
    clearTimer(timer); timer = null;
    if (ev === 'c1') { timer = setTimer(() => { timer = null; talking = true; onStart(); }, holdMs); return; }
    if (!talking) return;
    talking = false;
    (ev === 'c0' ? onEnd : onCancel)();
  };
}

/** Runs the watcher for the app's life; a crash restarts it after 2 s. Returns stop(). */
export function watchControl(onEvent, { spawn = nodeSpawn } = {}) {
  let child = null, stopped = false;
  const go = () => {
    if (stopped) return;
    child = spawn('osascript', ['-l', 'JavaScript', '-e', CTRL_JXA], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) if (/^(c0|c1|k)$/.test(l)) onEvent(l); });
    child.on('exit', () => { child = null; onEvent('k'); setTimeout(go, 2000).unref?.(); });   // a hold in progress is dropped, never stuck open
  };
  go();
  return () => { stopped = true; child?.kill(); };
}

// Launchers that commonly take a key Dixi wants. Read-only `ps -axco comm=` output shows which one is running.
const LAUNCHERS = ['Raycast', 'Alfred', 'ChatGPT', 'Claude'];
export const hotkeyOwner = (ps) => LAUNCHERS.find((n) => String(ps).split('\n').some((l) => l.trim() === n)) ?? null;
