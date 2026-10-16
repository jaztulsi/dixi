// Deepgram live transcription, connected from the main process so the API key never reaches the
// renderer (a browser WebSocket can't set an Authorization header). The renderer streams 16 kHz
// Int16 mic audio over IPC; transcripts come back as 'deepgram:message' events.

import WebSocket from 'ws';

export const DEEPGRAM_PARAMS = {
  model: 'nova-2',
  language: 'en',
  smart_format: 'true',
  encoding: 'linear16',
  sample_rate: '16000',
  channels: '1',
  interim_results: 'true',
  endpointing: '500',          // ms of silence before speech_final; lower = snappier, higher = fewer split phrases
  utterance_end_ms: '1500',
  keywords: 'Runic:3',         // wake word; unboosted it often comes back as "Runek"
};

export class DeepgramBridge {
  constructor(apiKey, emit) {
    this.apiKey = apiKey;
    this.emit = emit;
    this.ws = null;
  }

  open() {
    if (!this.apiKey) return Promise.resolve({ ok: false, error: 'DEEPGRAM_API_KEY is not set in .env' });
    this.close();
    const url = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams(DEEPGRAM_PARAMS);
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
