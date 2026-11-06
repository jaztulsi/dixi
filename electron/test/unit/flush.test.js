// Press-flush: the second ⌥Space sends CloseStream so Flux transcribes the audio it still holds. The words
// so far start being understood at once; Flux's next words (or its close, or 250 ms) send them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceAgent } from '../../src/renderer/core/voice.js';
import { normName } from '../../src/renderer/core/interpret.js';

// Fake audio (DIXI_FAKE_AUDIO-style): an 80 ms frame every 80 ms; a fake Flux that answers CloseStream
// with `reply` after `afterMS` (null: says nothing), then closes `closeMS` later (null: never).
function rig({ reply, afterMS = 200, closeMS = null }) {
  const log = { ran: [], specs: [], controls: [], frames: 0, committedAt: 0 };
  let timer = null, onMessage = () => {}, onClosed = () => {};
  const mic = { start: async (cb) => { timer = setInterval(() => cb(new Uint8Array(2560)), 80); }, stop: () => clearInterval(timer) };
  const deepgram = {
    open: async () => ({ ok: true }), close: async () => {}, sendAudio: () => { log.frames++; },
    onMessage: (cb) => { onMessage = cb; }, onClosed: (cb) => { onClosed = cb; },
    control: (m) => {
      log.controls.push(m.type);
      if (m.type !== 'CloseStream') return;
      if (reply != null && afterMS != null) setTimeout(() => onMessage(JSON.stringify({ type: 'TurnInfo', event: 'Update', transcript: reply, turn_index: 0 })), afterMS);
      if (closeMS != null) setTimeout(() => onClosed(), closeMS);
    },
  };
  const v = new VoiceAgent({ deepgram, mic, tabs: { visibleTabs: [], getCurrentURL: () => '' }, llm: {}, tiers: {}, executor: {}, settings: { requireWakeWord: false } });
  v.handleText = (t) => { log.committedAt = performance.now(); log.ran.push(t); };
  v.preconnect = () => {}; v.refreshAffordances = () => {};
  v.speculate = (t) => { const ctrl = new AbortController(); v.spec.set(normName(t), { ctrl, url: '', at: Date.now(), parsing: Promise.resolve(null) }); log.specs.push({ t, at: performance.now(), ctrl }); };
  const say = (event, transcript) => onMessage(JSON.stringify({ type: 'TurnInfo', event, transcript, turn_index: 0 }));
  return { v, log, say };
}

async function press({ reply, afterMS, closeMS, sofar = 'search lo-fi beats on Apple' }) {
  const r = rig({ reply, afterMS, closeMS });
  await r.v.startSession();
  await new Promise((ok) => setTimeout(ok, 170));   // two frames of fake audio
  r.say('Update', sofar);
  const t0 = performance.now();
  await r.v.endSession();
  return { ...r, t0, ms: r.log.committedAt - t0 };
}

test('flush: the last word arrives 200 ms after the press and is kept; the early start on the old words is dropped', async () => {
  const { v, log, t0, ms } = await press({ reply: 'search lo-fi beats on Apple Music', afterMS: 200 });
  assert.deepEqual(log.controls, ['CloseStream']);
  assert.ok(log.frames > 0, 'fake audio was streaming');
  assert.deepEqual(log.ran, ['search lo-fi beats on Apple Music'], 'the last word is kept');
  assert.equal(log.specs[0].t, 'search lo-fi beats on Apple', 'understanding started on the words so far');
  assert.ok(log.specs[0].at - t0 < 20, `at once: ${(log.specs[0].at - t0).toFixed(1)} ms after the press`);
  assert.equal(log.specs[0].ctrl.signal.aborted, true, 'the words changed: that early start is dropped');
  assert.equal(v.spec.has(normName('search lo-fi beats on Apple')), false);
  assert.ok(ms >= 190 && ms < 245, `press → commit ${ms.toFixed(1)} ms: on the flushed words, not the 250 ms cap`);
  assert.equal(v.session, null);
});

test('flush: the same words back (or the socket closing) send at once and keep the early start; silence sends at 250 ms', async () => {
  const same = await press({ reply: 'search lo-fi beats on Apple Music', sofar: 'search lo-fi beats on Apple Music', afterMS: 60 });
  assert.deepEqual(same.log.ran, ['search lo-fi beats on Apple Music']);
  assert.equal(same.log.specs[0].ctrl.signal.aborted, false, 'unchanged: the early start is what runs');
  assert.ok(same.ms < 120, `same words: ${same.ms.toFixed(1)} ms`);

  const closed = await press({ reply: null, closeMS: 30 });
  assert.deepEqual(closed.log.ran, ['search lo-fi beats on Apple']);
  assert.ok(closed.ms < 100, `closed: ${closed.ms.toFixed(1)} ms`);
  assert.equal(closed.v.isListening, false, 'the flush close is not a drop: no reconnect');

  const silent = await press({ reply: null });
  assert.deepEqual(silent.log.ran, ['search lo-fi beats on Apple']);
  assert.ok(silent.ms >= 240 && silent.ms < 320, `silent: ${silent.ms.toFixed(1)} ms`);
});

test('flush: Esc (cancel) sends no CloseStream and runs nothing', async () => {
  const r = rig({ reply: 'search lo-fi beats on Apple Music' });
  await r.v.startSession();
  r.say('Update', 'search lo-fi beats on Apple');
  await r.v.reset();
  assert.deepEqual([r.log.controls, r.log.ran], [[], []]);
});
