import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchIntent, startWatch, stopWatch, isWatching, checkPrompt, CHECK_SCHEMA, WATCH } from '../../src/main/watch.js';

// Fake clock: sleep moves time forward and yields.
function rig({ frames, met = () => false, ...opts }) {
  let t = 0, i = 0;
  const calls = [], done = [], states = [];
  const o = {
    condition: 'x', every: 4000, now: () => t,
    sleep: async (ms) => { t += ms; await Promise.resolve(); },
    frame: async () => { const p = frames(i++, t); return { shot: `s${i}`, pixels: p }; },
    check: async (shot) => { calls.push(shot); return { met: met(calls.length), why: 'ok\nok' }; },
    onDone: (r) => done.push(r), onState: (s) => states.push(s), ...opts,
  };
  return { o, calls, done, states, clock: () => t };
}
const flat = (v) => new Uint8Array(64 * 40).fill(v);

test('watchIntent parses', () => {
  assert.deepEqual(watchIntent('Dixi, tell me when this download finishes.'), { verb: 'start', condition: 'this download finishes' });
  assert.equal(watchIntent('let me know when the build passes').condition, 'the build passes');
  assert.equal(watchIntent('watch for a reply from Sam').condition, 'a reply from sam');
  assert.deepEqual(watchIntent('stop watching'), { verb: 'stop' });
  assert.deepEqual(watchIntent('are you watching?'), { verb: 'status' });
  assert.equal(watchIntent('what is this'), null);
  assert.equal(watchIntent('tell me about this page'), null);
  assert.ok(WATCH.test('tell me when it ends') && !WATCH.test('what is this'));
});

test('prompt and schema', () => {
  assert.match(checkPrompt('a'), /information only/);
  assert.match(checkPrompt('a'), /fewer than 12 words/);
  assert.deepEqual(CHECK_SCHEMA.required, ['met', 'why']);
});

test('unchanged screen: one baseline check, then only the 60 s recheck', async () => {
  const r = rig({ frames: () => flat(10), maxMs: 50000 });
  await startWatch(r.o).done;
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.done, [{ met: false, why: 'timed out' }]);
});

test('unchanged screen is rechecked after 60 s', async () => {
  const r = rig({ frames: () => flat(10), maxMs: 130000 });
  await startWatch(r.o).done;
  assert.equal(r.calls.length, 3);
});

test('a change calls check; stops when met; why is cleaned', async () => {
  const r = rig({ frames: (i) => flat(i < 2 ? 10 : 200), met: (n) => n === 2 });
  await startWatch(r.o).done;
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.done, [{ met: true, why: 'ok ok' }]);
  assert.deepEqual(r.states, ['watching', 'idle']);
  assert.equal(isWatching(), false);
});

test('why is capped at 80 characters', async () => {
  const r = rig({ frames: () => flat(1), check: async () => ({ met: true, why: 'a'.repeat(300) }) });
  await startWatch(r.o).done;
  assert.equal(r.done[0].why.length, 80);
});

test('times out at maxMs', async () => {
  const r = rig({ frames: (i) => flat(i % 2 ? 0 : 255), maxMs: 20000 });
  await startWatch(r.o).done;
  assert.deepEqual(r.done, [{ met: false, why: 'timed out' }]);
  assert.ok(r.clock() <= 24000);
});

test('stop and abort end it once', async () => {
  const a = rig({ frames: () => flat(1) });
  const h = startWatch(a.o); stopWatch(); await h.done;
  assert.equal(a.done.length, 1); assert.equal(a.done[0].met, false);
  const ac = new AbortController(), b = rig({ frames: () => flat(1), signal: ac.signal });
  const h2 = startWatch(b.o); ac.abort(); await h2.done;
  assert.equal(b.done.length, 1);
  assert.deepEqual(b.states, ['watching', 'idle']);
});

test('a second watch replaces the first', async () => {
  const a = rig({ frames: () => flat(1) }), b = rig({ frames: () => flat(1), met: () => true });
  const h1 = startWatch(a.o);
  const h2 = startWatch(b.o);
  await Promise.all([h1.done, h2.done]);
  assert.deepEqual(a.done, [{ met: false, why: 'replaced' }]);
  assert.equal(b.done[0].met, true);
});
