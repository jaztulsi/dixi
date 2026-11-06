// Flux numbers each connection's turns from 0, and every ⌥Space session is a new connection: Dixi's turn
// numbers must keep rising, or a later session's words land on a turn already done and are dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { ENDPOINTS } from '../../src/main/providers.js';
import { DeepgramBridge } from '../../src/main/deepgram.js';
import { ElevenLabsBridge } from '../../src/main/stt.js';
import { VoiceAgent } from '../../src/renderer/core/voice.js';

const server = (opts = {}) => new Promise((r) => { const s = new WebSocketServer({ port: 0, ...opts }, () => r(s)); });
const turn = (transcript) => JSON.stringify({ type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript });
const until = (f) => new Promise((r) => { const t = setInterval(() => f() && (clearInterval(t), r()), 5); });

test('turns: 3 ⌥Space sessions in a row, each Flux turn 0, are all heard', async () => {
  const said = ['open the news', 'scroll down', 'go back'];
  let n = 0;
  const s = await server();
  s.on('connection', (ws) => ws.send(turn(said[n++])));
  ENDPOINTS.deepgram.url = `ws://127.0.0.1:${s.address().port}`;
  const msgs = [];
  const b = new DeepgramBridge('key', (ch, data) => ch === 'deepgram:message' && msgs.push(data));
  const v = new VoiceAgent({ deepgram: null, tabs: { visibleTabs: [] }, llm: {}, tiers: {}, executor: {}, settings: { requireWakeWord: false }, holdMS: 0 });
  const ran = [];
  v.handleText = (t) => ran.push(t); v.preconnect = () => {}; v.speculate = () => {};
  for (let i = 0; i < 3; i++) {
    assert.equal((await b.open()).ok, true);
    await until(() => msgs.length > i);
    v.handleMessage(msgs[i]);
    b.close();
  }
  assert.deepEqual(msgs.map((m) => JSON.parse(m).turn_index), [0, 1, 2]);
  assert.deepEqual(ran, said);
  s.close();
});

test('turns: the Scribe → Flux switch (and back) never reuses a turn number', async () => {
  const dgs = await server();
  dgs.on('connection', (ws) => ws.send(turn('hello')));
  const el = await server({ verifyClient: (_info, cb) => cb(false, 402) });   // ElevenLabs refuses: back to Flux
  ENDPOINTS.deepgram.url = `ws://127.0.0.1:${dgs.address().port}`;
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${el.address().port}`;
  const msgs = [];
  const b = new ElevenLabsBridge('key', (ch, data) => ch === 'deepgram:message' && msgs.push(data), { fallback: new DeepgramBridge('key', (ch, data) => ch === 'deepgram:message' && msgs.push(data)) });
  b.turn = 4;   // Scribe heard turns 1-3
  b.retryAt = Date.now() + 60000;
  assert.equal((await b.open()).ok, true);
  await until(() => msgs.length === 1);
  assert.equal(JSON.parse(msgs[0]).turn_index, 4, 'Flux starts after Scribe');
  b.retryAt = 0;   // retry time: try ElevenLabs again (refused, so Flux again)
  assert.equal((await b.open()).ok, true);
  assert.ok(b.turn >= 5, `Scribe would go on from ${b.turn}`);
  await until(() => msgs.length === 2);
  assert.equal(JSON.parse(msgs[1]).turn_index, 5);
  b.close(); dgs.close(); el.close();
});
