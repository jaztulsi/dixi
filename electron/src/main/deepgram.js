// Deepgram live transcription, connected from the main process so the API key never reaches the
// renderer (a browser WebSocket can't set an Authorization header). The renderer streams 16 kHz
// Int16 mic audio over IPC; transcripts come back as 'deepgram:message' events.

import WebSocket from 'ws';

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

export class DeepgramBridge {
  constructor(apiKey, emit) {
    this.apiKey = apiKey;
    this.emit = emit;
    this.ws = null;
  }

  open({ keyterms = [] } = {}) {
    if (!this.apiKey) return Promise.resolve({ ok: false, error: 'DEEPGRAM_API_KEY is not set in .env' });
    this.close();
    const q = new URLSearchParams(DEEPGRAM_PARAMS);
    for (const k of keyterms.slice(0, 50)) if (k !== 'Dixi') q.append('keyterm', k);
    const url = 'wss://api.deepgram.com/v2/listen?' + q;
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${this.apiKey}` } });
    this.ws = ws;
    return new Promise((resolve) => {
      ws.once('open', () => resolve({ ok: true }));
      ws.once('error', (err) => resolve({ ok: false, error: err.message }));
      ws.on('message', (data) => this.emit('deepgram:message', data.toString()));
      ws.on('close', (code) => { if (this.ws === ws) { this.ws = null; this.emit('deepgram:closed', code); } });
    });
  }

  sendAudio(chunk) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(Buffer.from(chunk));
  }

  sendControl(message) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
    ws.close();
  }
}
