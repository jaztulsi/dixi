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

/**
 * The Fn key, Wispr-style, as a pure machine over what the native helper reports:
 * {type: 'fn_down' | 'fn_up' | 'space' | 'esc' | 'other_key' | 'ctrl' | 'reset', t: ms, ctrl?: bool}.
 *   hold Fn                 → open on key-DOWN, send on release (one utterance, however long the pauses)
 *   double-tap Fn (≤ 500ms) → hands-free: stays open with no key held; Fn again sends
 *   Fn + Space              → hands-free toggle (start / send)
 *   Esc                     → cancel
 *   Fn + any other key      → you're using Fn normally: cancel silently
 *   a lone tap under 200 ms → nothing
 *   Fn + Control            → dictation: the words are pasted, not run
 * onOpen(mode) opens the mic at once; onShow() is the island, `showMs` later, so Fn+arrow never flashes it;
 * onSend(mode) and onCancel(why, {silent}) end it. Exactly one of onSend/onCancel follows every onOpen.
 */
export function fnGestures({ onOpen, onShow = () => {}, onSend, onCancel, onMode = () => {}, tapMs = 200, doubleMs = 500, showMs = 90, maxMs = 300000,
  setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t) }) {
  let st = 'idle';        // idle | held | tapped | locked
  let mode = 'command', downAt = 0, fnDown = false, shown = false;
  let skipUp = false;     // this press already did its job: its release (and a Space under it) means nothing
  let tapTimer = null, showTimer = null, maxTimer = null;
  const stopTimers = () => { for (const t of [tapTimer, showTimer, maxTimer]) clearTimer(t); tapTimer = showTimer = maxTimer = null; };
  const show = () => { if (!shown && st !== 'idle') { shown = true; onShow(mode); } };
  const open = (ev) => {
    st = 'held'; mode = ev.ctrl ? 'dictate' : 'command'; downAt = ev.t; shown = false;
    onOpen(mode);
    showTimer = setTimer(() => { showTimer = null; show(); }, showMs);
    maxTimer = setTimer(() => { maxTimer = null; send(); }, maxMs);
  };
  const send = () => { if (st === 'idle') return; stopTimers(); st = 'idle'; onSend(mode); };
  const cancel = (why, silent = false) => { if (st === 'idle') return; stopTimers(); const quiet = silent || !shown; st = 'idle'; onCancel(why, { silent: quiet }); };
  const lock = () => { clearTimer(tapTimer); tapTimer = null; st = 'locked'; show(); };

  return (ev) => {
    switch (ev.type) {
      case 'fn_down':
        if (fnDown) return;                       // key repeat / a re-seeded tap
        fnDown = true; skipUp = false;
        if (st === 'idle') open(ev);
        else if (st === 'tapped') { lock(); skipUp = true; }          // second tap: hands-free
        else if (st === 'locked') { send(); skipUp = true; }          // Fn again: send
        return;
      case 'fn_up':
        if (!fnDown) return;
        fnDown = false;
        if (skipUp) { skipUp = false; return; }
        if (st !== 'held') return;
        if (ev.t - downAt >= tapMs) return send();
        st = 'tapped';                            // maybe the first half of a double-tap: keep the mic, decide at doubleMs
        clearTimer(showTimer); showTimer = null;  // a tap never shows the island
        tapTimer = setTimer(() => { tapTimer = null; cancel('tap', true); }, Math.max(0, doubleMs - (ev.t - downAt)));
        return;
      case 'space':
        if (!fnDown || skipUp) return;
        if (st === 'held') { lock(); skipUp = true; }                 // Fn+Space: hands-free on
        return;
      case 'ctrl':
        if (st === 'held' && mode !== 'dictate') { mode = 'dictate'; onMode(mode); }
        return;
      case 'esc':
        if (fnDown) skipUp = true;
        return cancel('esc');
      case 'other_key':
        if (st === 'held' || st === 'tapped') { skipUp = fnDown; cancel('fn-combo', true); }
        return;
      case 'reset':                               // the helper died or lost the tap: never leave the mic stuck open
        fnDown = false; skipUp = false;
        return cancel('reset', true);
    }
  };
}
