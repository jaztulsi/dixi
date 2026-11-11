// The Fn key gestures (Wispr Flow's table), as a pure machine over the helper's raw key events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnGestures } from '../../src/main/ptt.js';

function rig(opts = {}) {
  const log = [], timers = new Map(); let now = 0, id = 0;
  const g = fnGestures({
    onOpen: (m) => log.push(`open:${m}`), onShow: () => log.push('show'), onSend: (m) => log.push(`send:${m}`),
    onCancel: (why, { silent }) => log.push(`cancel:${why}${silent ? ':silent' : ''}`), onMode: (m) => log.push(`mode:${m}`),
    setTimer: (f, ms) => { timers.set(++id, { f, at: now + ms }); return id; }, clearTimer: (t) => timers.delete(t), ...opts,
  });
  const to = (t) => { for (;;) { const due = [...timers].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; now = due[1].at; timers.delete(due[0]); due[1].f(); } now = t; };
  const ev = (type, t, more = {}) => { to(t); g({ type, t, ...more }); };
  return { log, ev, to };
}

test('hold Fn: the mic opens on key-down, the island 90 ms later, and release sends once', () => {
  const { log, ev } = rig();
  ev('fn_down', 0);
  assert.deepEqual(log, ['open:command'], 'open at t=0, before any hold threshold: the first word is never clipped');
  ev('fn_up', 1200);
  assert.deepEqual(log, ['open:command', 'show', 'send:command']);
});

test('a 1.5 s (or 20 s) pause mid-sentence while Fn is held is still ONE command', () => {
  const { log, ev } = rig();
  ev('fn_down', 0); ev('fn_up', 21500);
  assert.equal(log.filter((l) => l.startsWith('send')).length, 1);
  assert.equal(log.filter((l) => l.startsWith('open')).length, 1);
});

test('double-tap Fn within 500 ms locks hands-free; no key is held; Fn again sends', () => {
  const { log, ev, to } = rig();
  ev('fn_down', 0); ev('fn_up', 80); ev('fn_down', 300); ev('fn_up', 380);
  to(30000);
  assert.deepEqual(log, ['open:command', 'show'], 'one session, still open, mic never closed between the taps');
  ev('fn_down', 30000);
  assert.deepEqual(log.at(-1), 'send:command');
  ev('fn_up', 30100);
  assert.equal(log.length, 3, 'the release after the sending press does nothing');
});

test('a lone tap under 200 ms is discarded silently; a second press after 500 ms is a new hold', () => {
  const { log, ev, to } = rig();
  ev('fn_down', 0); ev('fn_up', 70); to(500);
  assert.deepEqual(log, ['open:command', 'cancel:tap:silent'], 'no island, no sound, nothing run');
  ev('fn_down', 700); ev('fn_up', 1500);
  assert.deepEqual(log.slice(2), ['open:command', 'show', 'send:command']);
});

test('Fn+Space toggles hands-free: start, then send; the Fn releases in between mean nothing', () => {
  const { log, ev } = rig();
  ev('fn_down', 0); ev('space', 150); ev('fn_up', 300);
  assert.deepEqual(log, ['open:command', 'show']);
  ev('fn_down', 9000); ev('space', 9100); ev('fn_up', 9200);
  assert.deepEqual(log, ['open:command', 'show', 'send:command']);
  ev('space', 9300);
  assert.equal(log.length, 3, 'a bare Space is never Dixi\'s');
});

test('Esc cancels a hold and a hands-free lock; nothing is sent', () => {
  const a = rig(); a.ev('fn_down', 0); a.ev('esc', 900); a.ev('fn_up', 1000);
  assert.deepEqual(a.log, ['open:command', 'show', 'cancel:esc']);
  const b = rig(); b.ev('fn_down', 0); b.ev('fn_up', 80); b.ev('fn_down', 200); b.ev('fn_up', 260); b.ev('esc', 5000);
  assert.deepEqual(b.log, ['open:command', 'show', 'cancel:esc']);
});

test('Fn + arrow / F-key / Delete is normal Fn use: cancelled silently, and before the island ever shows', () => {
  const { log, ev } = rig();
  ev('fn_down', 0); ev('other_key', 60); ev('other_key', 400); ev('fn_up', 800);
  assert.deepEqual(log, ['open:command', 'cancel:fn-combo:silent']);
  ev('fn_down', 2000); ev('other_key', 2600); ev('fn_up', 2700);
  assert.deepEqual(log.slice(2), ['open:command', 'show', 'cancel:fn-combo:silent'], 'after the island showed it just goes away, no sound');
});

test('Fn + Control is dictation, whichever key went down first', () => {
  const a = rig(); a.ev('fn_down', 0, { ctrl: true }); a.ev('fn_up', 900);
  assert.deepEqual(a.log, ['open:dictate', 'show', 'send:dictate']);
  const b = rig(); b.ev('fn_down', 0); b.ev('ctrl', 200); b.ev('fn_up', 900);
  assert.deepEqual(b.log, ['open:command', 'show', 'mode:dictate', 'send:dictate']);
});

test('typing while hands-free is locked does not cancel; the helper dying does, so the mic is never stuck open', () => {
  const { log, ev } = rig();
  ev('fn_down', 0); ev('space', 100); ev('fn_up', 200); ev('other_key', 3000);
  assert.deepEqual(log, ['open:command', 'show']);
  ev('reset', 4000);
  assert.deepEqual(log.at(-1), 'cancel:reset:silent');
  ev('fn_down', 5000); ev('fn_up', 6000);
  assert.deepEqual(log.slice(-3), ['open:command', 'show', 'send:command']);
});

test('every open is closed by exactly one send or cancel, and a forgotten lock sends itself at the cap', () => {
  const { log, ev, to } = rig({ maxMs: 60000 });
  ev('fn_down', 0); ev('space', 100); ev('fn_up', 200); to(61000);
  assert.deepEqual(log, ['open:command', 'show', 'send:command']);
  for (const [type, t] of [['fn_down', 70000], ['fn_up', 70050], ['fn_down', 70300], ['esc', 70400], ['fn_up', 70500], ['fn_down', 71000], ['other_key', 71010], ['fn_up', 71100]]) ev(type, t);
  to(80000);
  const opens = log.filter((l) => l.startsWith('open')).length, ends = log.filter((l) => /^(send|cancel)/.test(l)).length;
  assert.equal(opens, ends);
});
