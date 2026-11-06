// A speech-socket drop mid-session: main reconnects at once and replays, in order, the audio Flux hadn't
// finished a turn on; the mic never stops. A finished turn's audio is never replayed or run again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { WebSocketServer } from 'ws';
import { ENDPOINTS } from '../../src/main/providers.js';
import { DeepgramBridge } from '../../src/main/deepgram.js';
import { VoiceAgent } from '../../src/renderer/core/voice.js';

const FRAME = 2560;   // 80 ms of 16 kHz Int16 (fake audio: each frame filled with its number)
const frame = (n) => new Uint8Array(FRAME).fill(n);
const info = (event, transcript, extra = {}) => JSON.stringify({ type: 'TurnInfo', event, turn_index: 0, transcript, ...extra });
const until = (f, ms = 4000) => new Promise((ok, fail) => {
  const end = Date.now() + ms, t = setInterval(() => { if (f()) { clearInterval(t); ok(); } else if (Date.now() > end) { clearInterval(t); fail(new Error('timed out')); } }, 5);
});
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

async function rig() {
  const s = await new Promise((r) => { const x = new WebSocketServer({ port: 0 }, () => r(x)); });
  const conns = [];
  s.on('connection', (ws) => { const c = { ws, got: [], text: [] }; conns.push(c); ws.on('message', (d, bin) => (bin ? c.got.push(d[0]) : c.text.push(String(d)))); });
  ENDPOINTS.deepgram.url = `ws://127.0.0.1:${s.address().port}`;
  const msgs = [], closed = [];
  const b = new DeepgramBridge('key', (ch, data) => (ch === 'deepgram:message' ? msgs.push(data) : closed.push(data)));
  const types = () => msgs.map((m) => JSON.parse(m).type);
  const last = () => JSON.parse(msgs.at(-1));
  return { s, b, conns, msgs, closed, types, last };
}

test('reconnect: a drop mid-sentence: the mic keeps going, the new socket gets every frame in order, the turn goes on', async () => {
  const r = await rig();
  assert.equal((await r.b.open()).ok, true);
  let n = 0;
  const mic = setInterval(() => r.b.sendAudio(frame(++n)), 10);
  await until(() => r.conns[0]?.got.length >= 5);
  r.conns[0].ws.send(info('Update', 'search lo-fi'));
  await until(() => r.msgs.length === 1);
  r.conns[0].ws.terminate();   // the network drops
  await until(() => r.conns[1]?.got.length >= 30);
  clearInterval(mic);
  await until(() => r.conns[1].got.length === n);
  assert.deepEqual(r.conns[1].got, range(1, n), 'replayed then live: every frame, in order, none twice');
  r.conns[1].ws.send(info('Update', 'search lo-fi beats on Apple Music'));
  await until(() => r.types().at(-1) === 'TurnInfo');
  assert.equal(r.last().turn_index, 0, 'the same turn goes on');
  assert.deepEqual(r.types(), ['TurnInfo', 'Reconnecting', 'Reconnected', 'TurnInfo']);
  assert.deepEqual(r.closed, [], 'no close reaches the renderer: its mic never stops');
  r.b.close(); r.s.close();
});

test('reconnect: a finished turn is not replayed, and a turn Dixi already ran is not run again', async () => {
  const r = await rig();
  const v = new VoiceAgent({ deepgram: null, tabs: { visibleTabs: [] }, llm: {}, tiers: {}, executor: {}, settings: { requireWakeWord: false }, holdMS: 0 });
  const ran = [];
  v.handleText = (t) => ran.push(t); v.preconnect = () => {}; v.speculate = () => {}; v.refreshAffordances = () => {};
  const deliver = async (c, msg) => { const k = r.msgs.length; c.ws.send(msg); await until(() => r.msgs.length > k); v.handleMessage(r.msgs.at(-1)); };

  assert.equal((await r.b.open()).ok, true);
  for (let i = 1; i <= 10; i++) r.b.sendAudio(frame(i));
  await until(() => r.conns[0]?.got.length === 10);
  await deliver(r.conns[0], info('EndOfTurn', 'open the news', { audio_window_end: (6 * FRAME) / 32000 }));   // frames 1-6
  assert.deepEqual(ran, ['open the news']);

  r.conns[0].ws.terminate();
  r.b.sendAudio(frame(11)); r.b.sendAudio(frame(12));   // said during the drop
  await until(() => r.conns[1]?.got.length === 6);
  assert.deepEqual(r.conns[1].got, range(7, 12), 'only the audio after the finished turn');
  await deliver(r.conns[1], info('Update', 'go back'));
  assert.equal(r.last().turn_index, 1, 'the new socket\'s first turn is a new turn for Dixi');
  v.handleTurn({ event: 'EndOfTurn', transcript: 'go back', turn_index: 1, now: true });   // ⌥Space sent it before Flux finished
  assert.deepEqual(ran, ['open the news', 'go back']);

  r.conns[1].ws.terminate();   // a drop before Flux's own EndOfTurn: its audio is replayed…
  await until(() => r.conns[2]?.got.length === 6);
  await deliver(r.conns[2], info('EndOfTurn', 'go back'));
  assert.equal(r.last().turn_index, 1, '…onto the same turn…');
  assert.deepEqual(ran, ['open the news', 'go back'], '…which Dixi already ran: not run again');
  r.b.close(); r.s.close();
});

test('reconnect: the replay buffer is capped (6 s), and the close after CloseStream is the end, not a drop', async () => {
  const b = new DeepgramBridge('key', () => {});
  for (let i = 1; i <= 200; i++) b.sendAudio(frame(i));   // a long outage: no socket
  assert.ok(b.ringBytes <= 6 * 32000, `${b.ringBytes} bytes held`);
  assert.deepEqual(b.ring.map((f) => f.chunk[0]), range(126, 200), 'the newest 75 frames, in order');

  const r = await rig();
  assert.equal((await r.b.open()).ok, true);
  r.conns[0] ?? await until(() => r.conns[0]);
  r.conns[0].ws.on('message', (d, bin) => { if (!bin && JSON.parse(String(d)).type === 'CloseStream') r.conns[0].ws.close(1000); });
  r.b.sendControl({ type: 'CloseStream' });
  await until(() => r.closed.length === 1);
  await new Promise((ok) => setTimeout(ok, 100));
  assert.equal(r.conns.length, 1, 'no reconnect');
  assert.deepEqual(r.types(), []);
  r.s.close();
});

test('reconnect: a black-holed network gives up after 3 tries and the renderer is told (no "Reconnecting…" forever)', async () => {
  const r = await rig();
  r.b.handshakeMS = 100;   // 2.5 s in the app
  assert.equal((await r.b.open()).ok, true);
  await until(() => r.conns[0]);
  const hole = net.createServer(() => {});   // takes the connection, never answers
  await new Promise((ok) => hole.listen(0, '127.0.0.1', ok));
  ENDPOINTS.deepgram.url = `ws://127.0.0.1:${hole.address().port}`;
  r.conns[0].ws.terminate();
  await until(() => r.closed.length === 1);
  await new Promise((ok) => setTimeout(ok, 150));
  assert.equal(r.closed.length, 1, 'told once');
  assert.deepEqual(r.types(), ['Reconnecting']);
  hole.close(); r.s.close();
});
