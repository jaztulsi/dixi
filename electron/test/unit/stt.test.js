import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { ENDPOINTS } from '../../src/main/providers.js';
import { ElevenLabsBridge } from '../../src/main/stt.js';

const fakeDeepgram = () => ({ opened: 0, audio: 0, open() { this.opened++; return { ok: true }; }, sendAudio() { this.audio++; }, sendControl() {}, close() {} });
const server = (opts) => new Promise((r) => { const s = new WebSocketServer({ port: 0, ...opts }, () => r(s)); });

test('stt: ElevenLabs refusing the key (out of credit) hands the mic to Deepgram', async () => {
  const s = await server({ verifyClient: (_info, cb) => cb(false, 402) });
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${s.address().port}`;
  const dg = fakeDeepgram();
  const b = new ElevenLabsBridge('key', () => {}, { fallback: dg });
  assert.deepEqual(await b.open(), { ok: true });
  b.sendAudio(new Uint8Array(4));
  assert.equal(dg.opened, 1);
  assert.equal(dg.audio, 1);
  s.close();
});

test('stt: quota_exceeded mid-session closes ElevenLabs; the reconnect goes to Deepgram', async () => {
  const s = await server({});
  s.on('connection', (ws) => ws.send(JSON.stringify({ message_type: 'quota_exceeded', error: 'out of credits' })));
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${s.address().port}`;
  const dg = fakeDeepgram();
  const events = [];
  const b = new ElevenLabsBridge('key', (ch) => events.push(ch), { fallback: dg });
  assert.equal((await b.open()).ok, true);
  await new Promise((r) => { const t = setInterval(() => events.includes('deepgram:closed') && (clearInterval(t), r()), 10); });
  await b.open();
  assert.equal(dg.opened, 1);
  s.close();
});

test('stt: insufficient_audio_activity is not a credit problem (stays on ElevenLabs)', async () => {
  const s = await server({});
  s.on('connection', (ws) => ws.send(JSON.stringify({ message_type: 'insufficient_audio_activity' })));
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${s.address().port}`;
  const dg = fakeDeepgram();
  const b = new ElevenLabsBridge('key', () => {}, { fallback: dg });
  await b.open();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.fallen, false);
  b.close();
  s.close();
});
