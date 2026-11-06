// Endpointing: the second ⌥Space sends at once; an end of turn the speech service calls on its own waits
// until the words have been still for 700 ms, so a mid-sentence pause is not the end of the command.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceAgent } from '../../src/renderer/core/voice.js';

function rig() {
  const ran = [];
  const mic = { start: async () => {}, stop() {} };
  const deepgram = { open: async () => ({ ok: true }), close: async () => {}, sendAudio() {}, onMessage() {}, onClosed() {} };
  const v = new VoiceAgent({ deepgram, mic, tabs: { visibleTabs: [] }, llm: {}, tiers: {}, executor: {}, settings: { requireWakeWord: false } });
  v.handleText = (t) => ran.push(t);
  v.preconnect = () => {}; v.speculate = () => {}; v.refreshAffordances = () => {};
  return { v, ran };
}

test('endpointing: ⌥Space again commits the words heard so far at once (no waiting for a final that may never come)', async () => {
  const { v, ran } = rig();
  await v.startSession();
  v.handleTurn({ event: 'Update', transcript: "what's the weather in Paris", turn_index: 0 });
  const t0 = performance.now();
  await v.endSession();
  const ms = performance.now() - t0;
  assert.deepEqual(ran, ["what's the weather in Paris"]);
  assert.ok(ms <= 50, `press → commit ${ms.toFixed(1)} ms`);
});

test('endpointing: an end of turn 300 ms into a pause waits for 700 ms of stillness; more words in a new turn join it', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const { v, ran } = rig();
    v.handleTurn({ event: 'Update', transcript: "what's the weather", turn_index: 0 });
    mock.timers.tick(300);
    v.handleTurn({ event: 'EndOfTurn', transcript: "what's the weather", turn_index: 0 });
    assert.deepEqual(ran, [], 'held');
    mock.timers.tick(200);   // you go on talking, and the service starts a new turn
    v.handleTurn({ event: 'StartOfTurn', transcript: '', turn_index: 1 });
    v.handleTurn({ event: 'Update', transcript: 'in Paris', turn_index: 1 });
    mock.timers.tick(300);
    v.handleTurn({ event: 'EndOfTurn', transcript: 'in Paris', turn_index: 1 });
    mock.timers.tick(399);
    assert.deepEqual(ran, [], 'still 700 ms from the last words');
    mock.timers.tick(1);
    assert.deepEqual(ran, ["what's the weather in Paris"], 'one command, run once');
    mock.timers.tick(5000);
    assert.equal(ran.length, 1);

    // An end of turn after a long pause adds nothing.
    v.handleTurn({ event: 'Update', transcript: 'what time is it in Tokyo', turn_index: 2 });
    mock.timers.tick(800);
    v.handleTurn({ event: 'EndOfTurn', transcript: 'what time is it in Tokyo', turn_index: 2 });
    assert.equal(ran.at(-1), 'what time is it in Tokyo');
  } finally { mock.timers.reset(); }
});

test('endpointing: new words in the same turn cancel the wait; Esc during it runs nothing', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const { v, ran } = rig();
    v.handleTurn({ event: 'Update', transcript: "what's the weather", turn_index: 0 });
    mock.timers.tick(300);
    v.handleTurn({ event: 'EagerEndOfTurn', transcript: "what's the weather", turn_index: 0 });
    mock.timers.tick(200);
    v.handleTurn({ event: 'TurnResumed', transcript: "what's the weather", turn_index: 0 });
    v.handleTurn({ event: 'Update', transcript: "what's the weather in Paris", turn_index: 0 });
    mock.timers.tick(2000);
    assert.deepEqual(ran, [], 'no end of turn yet, and a question waits for it');
    v.handleTurn({ event: 'EndOfTurn', transcript: "what's the weather in Paris", turn_index: 0 });
    assert.deepEqual(ran, ["what's the weather in Paris"], 'still for 2 s: at once');

    v.handleTurn({ event: 'Update', transcript: 'what is on my calendar', turn_index: 1 });
    mock.timers.tick(100);
    v.handleTurn({ event: 'EndOfTurn', transcript: 'what is on my calendar', turn_index: 1 });
    await v.reset();   // Esc
    mock.timers.tick(5000);
    assert.equal(ran.length, 1, 'Esc during the wait: nothing ran');
  } finally { mock.timers.reset(); }
});
