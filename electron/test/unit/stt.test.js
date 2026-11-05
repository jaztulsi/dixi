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

test('stt: a close while ElevenLabs is still connecting (Esc, mic denied) never opens the fallback', async () => {
  const s = await server({ verifyClient: (_info, cb) => setTimeout(() => cb(true), 300) });
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${s.address().port}`;
  const dg = fakeDeepgram();
  const b = new ElevenLabsBridge('key', () => {}, { fallback: dg });
  const opening = b.open();
  await new Promise((r) => setTimeout(r, 50));
  b.close();
  assert.deepEqual(await opening, { ok: false, error: 'closed while connecting' });
  s.close();
  assert.equal(dg.opened, 0);
  assert.equal(b.fallen, false, 'ElevenLabs is still the first choice next time');
});

test('stt: a 402 marks ElevenLabs dead in the registry file; after a relaunch the mic goes straight to Deepgram (0 EL round trips)', async () => {
  const { Dead } = await import('../../src/main/providers.js');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-dead-')), 'dead-services.json');
  let tries = 0;
  const s = await server({ verifyClient: (_info, cb) => { tries++; cb(false, 402); } });
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${s.address().port}`;
  const dg = fakeDeepgram();
  assert.deepEqual(await new ElevenLabsBridge('key', () => {}, { fallback: dg, dead: new Dead(file) }).open(), { ok: true });
  assert.equal(tries, 1);
  const relaunch = new ElevenLabsBridge('key', () => {}, { fallback: dg, dead: new Dead(file) });   // a new process reads the file
  assert.deepEqual(await relaunch.open(), { ok: true });
  assert.deepEqual(await relaunch.open(), { ok: true });
  assert.equal(tries, 1, 'a dead ElevenLabs is never dialed again');
  assert.equal(dg.opened, 3);
  s.close();
});

test('stt: a network error or 5xx is not dead: Deepgram until retryMs, then ElevenLabs is dialed again (fallen no longer sticks)', async () => {
  const { Dead } = await import('../../src/main/providers.js');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dead = new Dead(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-dead-')), 'dead.json'));
  let tries = 0;
  const s = await server({ verifyClient: (_info, cb) => { tries++; cb(false, 503); } });
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${s.address().port}`;
  const dg = fakeDeepgram();
  const b = new ElevenLabsBridge('key', () => {}, { fallback: dg, dead, retryMs: 100 });
  assert.deepEqual(await b.open(), { ok: true });
  assert.deepEqual(await b.open(), { ok: true });
  assert.equal(tries, 1, 'inside the retry window: no EL dial');
  assert.equal(dead.is('elevenlabs'), false, 'a 503 is not dead');
  await new Promise((r) => setTimeout(r, 120));
  await b.open();
  assert.equal(tries, 2, 'after the window ElevenLabs is tried again');
  assert.equal(dg.opened, 3);
  s.close();
});

test('stt: a close during the fallback\'s own connect (Esc after EL refused) cancels Deepgram too: no socket, no reconnect', async () => {
  const { DeepgramBridge } = await import('../../src/main/deepgram.js');
  const el = await server({ verifyClient: (_info, cb) => cb(false, 402) });
  let dialed;
  const dialing = new Promise((r) => { dialed = r; });
  const dgs = await server({ verifyClient: (_info, cb) => { dialed(); setTimeout(() => cb(true), 300); } });
  ENDPOINTS.elevenlabs.stt = `ws://127.0.0.1:${el.address().port}`;
  ENDPOINTS.deepgram.url = `ws://127.0.0.1:${dgs.address().port}`;
  const events = [];
  const b = new ElevenLabsBridge('key', (ch) => events.push(ch), { fallback: new DeepgramBridge('key', (ch) => events.push(ch)) });
  const opening = b.open();
  await dialing;
  b.close();
  assert.equal((await opening).ok, false);
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(dgs.clients.size, 0, 'no Deepgram socket left open');
  assert.equal(events.includes('deepgram:closed'), false, 'the renderer is not told to reconnect');
  el.close(); dgs.close();
});
