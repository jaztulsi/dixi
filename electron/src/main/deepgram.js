// Deepgram live transcription, connected from the main process so the API key never reaches the
// renderer (a browser WebSocket can't set an Authorization header). The renderer streams 16 kHz
// Int16 mic audio over IPC; transcripts come back as 'deepgram:message' events.

import WebSocket from 'ws';
import { ENDPOINTS } from './providers.js';

// Flux (v2): the whole turn so far ~4x a second and its own end-of-turn detection. Measured on the same
// audio: the last word lands 0.17 s after you stop talking (nova-2 v1: 1.8 s, updates only once a second).
export const DEEPGRAM_PARAMS = {
  model: 'flux-general-en',
  encoding: 'linear16',
  sample_rate: '16000',
  eot_threshold: '0.7',        // how sure Flux must be the turn is over before EndOfTurn
  eager_eot_threshold: '0.4',  // and a much earlier "probably done" (EagerEndOfTurn): Dixi acts on that
  eot_timeout_ms: '1500',      // in a noisy room Flux may never be sure: end the turn after 1.5 s of no words (default 5 s)
  keyterm: 'Dixi',             // wake word boost; Flux still often writes "Dixie" (WAKE_PATTERN accepts both)
};

const BPS = 32000;              // bytes per second of 16 kHz Int16 mono audio
const RING_BYTES = 6 * BPS;     // ponytail: replay ≤ 6 s (192 KB, like A1's 50-frame cap); a longer turn loses its start on a drop

export class DeepgramBridge {
  constructor(apiKey, emit) {
    this.apiKey = apiKey;
    this.emit = emit;
    this.ws = null;
    this.next = 0;   // Flux numbers each connection's turns from 0; Dixi's turn numbers keep rising (each ⌥Space is a new connection)
    this.ring = []; this.ringBytes = 0; this.gen = 0;   // audio Flux hasn't finished a turn on yet: replayed after a drop
    this.done = -1;   // the newest turn the renderer ended itself, before Flux did
    this.handshakeMS = 2500;   // a black-holed network (half-dead Wi-Fi) fails in 2.5 s, not never: the 3 tries end and the renderer is told
  }

  open({ keyterms = [] } = {}) {
    if (!this.apiKey) return Promise.resolve({ ok: false, error: 'DEEPGRAM_API_KEY is not set in .env' });
    this.close();
    this.keyterms = keyterms; this.openTurn = null;
    return this.connect(this.next);
  }

  connect(base) {
    const q = new URLSearchParams(DEEPGRAM_PARAMS);
    for (const k of this.keyterms.slice(0, 50)) if (k !== 'Dixi') q.append('keyterm', k);
    const url = `${ENDPOINTS.deepgram.url}?${q}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${this.apiKey}` }, handshakeTimeout: this.handshakeMS });
    this.ws = ws; this.sent = 0;
    return new Promise((resolve) => {
      ws.once('open', () => { ws.opened = true; for (const f of this.ring) this.send(f); resolve({ ok: true }); });   // in order, before live audio
      ws.once('error', (err) => resolve({ ok: false, error: err.message }));
      ws.on('message', (data) => this.emit('deepgram:message', this.renumber(data.toString(), base)));
      ws.on('close', (code) => {
        if (this.ws !== ws) return;
        this.ws = null;
        // A drop mid-session (not your CloseStream): the mic stays open, and the audio is replayed on a new socket.
        if (ws.opened && !ws.flushing) this.reconnect(code);
        else if (!this.retrying) this.emit('deepgram:closed', code);
      });
    });
  }

  async reconnect(code) {
    const gen = this.gen;
    this.retrying = true;
    this.emit('deepgram:message', JSON.stringify({ type: 'Reconnecting' }));
    const base = this.openTurn ?? this.next;   // the turn you were in the middle of goes on: it is heard again, whole
    try {
      for (const wait of [0, 300, 1000]) {
        await new Promise((r) => setTimeout(r, wait));
        if (gen !== this.gen) return;   // closed or reopened meanwhile
        if ((await this.connect(base)).ok) { if (gen === this.gen) this.emit('deepgram:message', JSON.stringify({ type: 'Reconnected' })); return; }
      }
    } finally { this.retrying = false; }
    if (gen === this.gen) this.emit('deepgram:closed', code);   // gave up: the renderer restarts (and stt.js may fall back)
  }

  /** A turn_index from this connection, moved past every turn an earlier connection used. */
  renumber(raw, base) {
    let m;
    try { m = JSON.parse(raw); } catch { return raw; }
    if (!Number.isInteger(m?.turn_index)) return raw;
    m.turn_index += base;
    this.next = Math.max(this.next, m.turn_index + 1);
    // A finished turn's audio is never replayed (it would run again as a new turn). Without Flux's
    // audio_window_end, everything sent so far counts as finished.
    if (m.event === 'EndOfTurn') { this.openTurn = null; this.trim(Number.isFinite(m.audio_window_end) ? m.audio_window_end * BPS : this.sent); }
    else if (m.turn_index > this.done) this.openTurn = m.turn_index;
    return JSON.stringify(m);
  }

  // The renderer ended a turn before Flux's EndOfTurn (EagerEndOfTurn + the 700 ms hold): its audio is
  // finished too, so a drop now replays only what came after, as a new turn, not under the done one.
  turnDone(turn) {
    this.done = Math.max(this.done, turn);
    if (this.openTurn != null && this.openTurn <= turn) { this.openTurn = null; this.trim(this.sent); }
  }

  trim(done) {
    while (this.ring.length && this.ring[0].end && this.ring[0].end <= done) this.ringBytes -= this.ring.shift().chunk.length;
  }

  send(f) { this.sent += f.chunk.length; f.end = this.sent; this.ws.send(f.chunk); }

  sendAudio(chunk) {
    const f = { chunk: Buffer.from(chunk), end: 0 };
    this.ring.push(f); this.ringBytes += f.chunk.length;
    while (this.ringBytes > RING_BYTES) this.ringBytes -= this.ring.shift().chunk.length;
    if (this.ws?.readyState === WebSocket.OPEN) this.send(f);
  }

  sendControl(message) {
    if (message?.type === 'TurnDone') return this.turnDone(message.turn);   // local only: Flux has no such message
    if (message?.type === 'CloseStream' && this.ws) this.ws.flushing = true;   // its close is the end, not a drop
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.gen++; this.ring = []; this.ringBytes = 0;
    if (!ws) return;
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
    ws.close();
  }
}
