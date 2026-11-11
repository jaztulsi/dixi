// ear.js against a fake helper: the island and run() see ONE final per utterance, whatever the helper does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startEar, stripName, findEar } from '../../src/main/ear.js';

function rig(opts = {}, apiMore = {}) {
  const log = [], sent = [], timers = new Map(); let now = 0, id = 0, kids = 0, child;
  const spawn = () => {
    kids++;
    child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { write: (s) => sent.push(JSON.parse(s)) }; child.kill = () => child.emit('exit', 0);
    return child;
  };
  const api = {
    open: (m) => log.push(`open:${m}`), show: (m) => log.push(`show:${m}`), mode: (m) => log.push(`mode:${m}`), partial: (t) => log.push(`partial:${t}`),
    level: () => {}, context: (c) => log.push(`ctx:${c.app}`), cancel: (w) => log.push(`cancel:${w}`), final: (t, m) => { log.push(`final:${m}:${t}`); },
    unavailable: (w) => log.push(`unavailable:${w}`), vocab: async () => ['Safari', 'Dixi'], ...apiMore,
  };
  const ear = startEar({ bin: '/x/dixi-ear', api, spawn, now: () => now,
    setTimer: (f, ms) => { timers.set(++id, { f, at: now + ms }); return id; }, clearTimer: (t) => timers.delete(t), ...opts });
  const to = (t) => { for (;;) { const due = [...timers].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; now = due[1].at; timers.delete(due[0]); due[1].f(); } now = t; };
  const say = (m, t) => { if (t != null) to(t); child.stdout.emit('data', `${JSON.stringify(m)}\n`); };
  const key = (type, t, more = {}) => say({ ev: 'key', type, t, ...more }, t);
  return { ear, log, sent, say, key, to, kids: () => kids, child: () => child };
}

test('hold Fn, speak with a 1.5 s pause, release: partials go to the island, run() gets ONE final', () => {
  const { log, sent, say, key } = rig();
  key('fn_down', 0);
  say({ ev: 'context', app: 'Safari' }, 20);
  say({ ev: 'partial', text: 'open Safari' }, 600);
  say({ ev: 'partial', text: 'open Safari and then go to' }, 2400);   // after a long pause: still the same utterance
  say({ ev: 'partial', text: 'open Safari and then go to youtube.com' }, 3000);
  key('fn_up', 3200);
  assert.deepEqual(sent.at(-1), { cmd: 'stop' });
  say({ ev: 'final', text: 'Open Safari and then go to youtube.com', ms: 140 }, 3340);
  assert.equal(log.filter((l) => l.startsWith('final')).length, 1);
  assert.equal(log.at(-1), 'final:command:Open Safari and then go to youtube.com');
  assert.ok(!log.some((l) => /^final/.test(l) && l !== log.at(-1)), 'nothing ran on a partial');
});

test('the helper never answers: the last words shown become the command after 1 s; a late final is ignored', () => {
  const { log, say, key, to, ear } = rig();
  key('fn_down', 0); say({ ev: 'partial', text: 'Dixie, quit Spotify' }, 700); key('fn_up', 900);
  to(1899); assert.ok(!log.some((l) => l.startsWith('final')));
  to(1900); assert.equal(log.at(-1), 'final:command:quit Spotify');
  say({ ev: 'final', text: 'quit Spotify now', ms: 2000 }, 2500);
  assert.equal(log.filter((l) => l.startsWith('final')).length, 1);
  assert.equal(ear.state().stats.timeouts, 1);
});

test('Esc and Fn+arrow tell the helper to drop the audio; nothing runs', () => {
  const { log, sent, say, key } = rig();
  key('fn_down', 0); say({ ev: 'partial', text: 'delete all my' }, 500); key('esc', 700); key('fn_up', 800);
  assert.deepEqual(sent.at(-1), { cmd: 'cancel' });
  key('fn_down', 2000); key('other_key', 2050); key('fn_up', 2300);
  assert.deepEqual(sent.at(-1), { cmd: 'cancel' });
  assert.ok(!log.some((l) => l.startsWith('final')));
});

test('Fn+Control: the words are pasted by the helper, not run as a command', () => {
  const { log, sent, say, key } = rig();
  key('fn_down', 0, { ctrl: true }); key('fn_up', 1500);
  say({ ev: 'final', text: 'See you at five.', ms: 120 }, 1620);
  assert.deepEqual(sent.at(-1), { cmd: 'paste', text: 'See you at five.' });
  assert.equal(log.at(-1), 'final:dictate:See you at five.');
});

test('the helper dies mid-hold: the hold is dropped (nothing half-heard runs), it restarts in 2 s, and the next hold works', () => {
  const { log, say, key, to, kids, child } = rig();
  key('fn_down', 0); say({ ev: 'partial', text: 'open Notes' }, 500);
  to(600); child().emit('exit', 1);
  assert.equal(log.at(-1), 'cancel:reset');
  to(2700); assert.equal(kids(), 2);
  key('fn_down', 3000); key('fn_up', 3900); say({ ev: 'final', text: 'open Notes', ms: 90 }, 3990);
  assert.equal(log.at(-1), 'final:command:open Notes');
});

test('five quick exits in a row: it stops trying and says so (the old hotkey takes over)', () => {
  const { log, to, kids, child } = rig();
  for (let i = 0; i < 5; i++) { child().emit('exit', 1); to((i + 1) * 2000); }
  assert.equal(kids(), 5);
  assert.ok(log.at(-1).startsWith('unavailable:'));
});

test('ready sends the vocabulary (installed apps, your commands, Dixi) to bias the speech model', async () => {
  const { sent, say } = rig();
  say({ ev: 'ready', stt: 'dictation', perms: { mic: true } }, 10);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent.at(-1), { cmd: 'vocab', words: ['Safari', 'Dixi'] });
});

test('a leading name is dropped; no name is needed; names inside the sentence stay', () => {
  for (const [a, b] of [['Dixi, open Safari', 'open Safari'], ['hey Dixie open Safari', 'open Safari'], ['Dixy. Quit Spotify', 'Quit Spotify'], ['open Safari', 'open Safari'], ['search for dixie chicks on YouTube', 'search for dixie chicks on YouTube'], ['Dixi', '']]) assert.equal(stripName(a), b);
});

test('findEar: the packaged helper first, then the release build, else null', () => {
  assert.equal(findEar('/app', { exists: (p) => p.endsWith('release/dixi-ear'), resources: '/res' }), '/app/native/dixi-ear/.build/release/dixi-ear');
  assert.equal(findEar('/app', { exists: () => true, resources: '/res' }), '/res/dixi-ear');
  assert.equal(findEar('/app', { exists: () => false, resources: '/res' }), null);
});

import { learnedWords } from '../../src/main/ear.js';
test('learning from corrections: the new names in a quick retry, not a whole new sentence', () => {
  assert.deepEqual(learnedWords('open discored', 'open Discord'), ['Discord']);
  assert.deepEqual(learnedWords('text john about lunch', 'text Jon Smyth about lunch'), ['Jon', 'Smyth']);
  assert.deepEqual(learnedWords('open discored', 'open Discord', ['discord']), [], 'already known');
  assert.deepEqual(learnedWords('open Safari', 'what is the weather like in Tokyo tomorrow morning'), [], 'a different command');
  assert.deepEqual(learnedWords('open notes', 'open the notes'), [], 'only common words changed');
});

import { endPause } from '../../src/main/ear.js';
test('hands-free: a finished sentence ends at 0.8 s, a hanging one waits 2.6 s, otherwise 1.2 s', () => {
  assert.equal(endPause('Add this to my cart.'), 800);
  assert.equal(endPause('add this to my cart'), 1200);
  assert.equal(endPause('search for the best ramen near me on Google maps and'), 2600);
  assert.equal(endPause('put two oat milks in my'), 2600);
  assert.equal(endPause('remove that'), 1200, '"that" ends a command ("remove that")');
  assert.equal(endPause(''), Infinity);
});

test('hands-free shopping: double-tap, then each command is sent at its pause with the mic left open; Fn ends it', async () => {
  const { log, sent, say, key, to } = rig();
  const finals = [];
  log.push = new Proxy(log.push, { apply: (f, that, args) => { if (String(args[0]).startsWith('final')) finals.push(args[0]); return f.apply(that, args); } });
  key('fn_down', 0); key('fn_up', 80); key('fn_down', 250); key('fn_up', 320);   // double-tap: locked
  say({ ev: 'partial', text: 'add this to my cart', seg: 1 }, 1000);
  to(2100); assert.ok(!sent.some((m) => m.cmd === 'next'), 'not yet: 1.1 s of quiet');
  to(2300); assert.deepEqual(sent.at(-1), { cmd: 'next' }, '1.2 s of quiet: this command is done');
  say({ ev: 'partial', text: 'add this to my cart', seg: 1 }, 2350);   // a late word from the sent segment: ignored
  say({ ev: 'final', text: 'Add this to my cart.', ms: 90, seg: 1 }, 2400);
  say({ ev: 'partial', text: 'remove the milk from my', seg: 2 }, 3000);
  to(4500); assert.equal(sent.filter((m) => m.cmd === 'next').length, 1, 'hanging on "my": still waiting at 1.5 s');
  say({ ev: 'partial', text: 'remove the milk from my cart', seg: 2 }, 4600);
  to(5900); assert.equal(sent.filter((m) => m.cmd === 'next').length, 2);
  say({ ev: 'final', text: 'Remove the milk from my cart.', ms: 80, seg: 2 }, 5950);
  key('fn_down', 9000); key('fn_up', 9100);   // Fn: the end; nothing more was said
  say({ ev: 'final', text: '', ms: 10, seg: 3 }, 9150);
  assert.deepEqual(finals, ['final:command:Add this to my cart.', 'final:command:Remove the milk from my cart.']);
});

test('Esc while Dixi is working (no talk session) stops the work', () => {
  const stops = [];
  const { say } = rig({}, { busy: () => true, stop: () => stops.push(1) });
  say({ ev: 'key', type: 'esc', t: 100 }, 100);
  assert.equal(stops.length, 1);
});
