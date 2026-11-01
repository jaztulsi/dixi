import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mark, timings, setSink } from '../../src/main/timing.js';

test('mark(): one line per stage, ms since heard and since the last stage; repeats ignored', () => {
  const lines = [];
  const was = setSink((l) => lines.push(l));
  mark('r1', 'heard', 1000);
  mark('r1', 'stt_final', 1300);
  mark('r1', 'routed', 1302);
  mark('r1', 'routed', 1900);   // only the first counts
  mark('r1', 'done', 1800);
  mark('r1', 'first_audio', 2100);   // may arrive after done
  mark(null, 'heard');   // no run, no line
  setSink(was);
  assert.deepEqual(timings('r1'), { heard: 0, stt_final: 300, routed: 302, done: 800, first_audio: 1100 });
  assert.equal(lines.length, 5);
  assert.deepEqual(JSON.parse(lines[4].replace('[timing] ', '')), { run: 'r1', stage: 'first_audio', ms: 1100, step: 300 });
  assert.equal(timings('nope'), null);
});

test('mark(): a sink that throws never breaks the request', () => {
  const was = setSink(() => { throw new Error('disk full'); });
  assert.doesNotThrow(() => mark('r2', 'heard'));
  setSink(was);
});
