// ElevenLabs Scribe v2 Realtime speech-to-text, in the main process (the key never reaches the UI).
// Its messages are turned into the same TurnInfo events Deepgram Flux sends, so the voice agent
// doesn't care which one is listening:
//   partial_transcript   → TurnInfo Update      (all words of this turn so far)
//   committed_transcript → TurnInfo EndOfTurn   (the turn is over: voice-activity detection heard a pause)
// Pick it with DIXI_STT=elevenlabs (the default when ELEVENLABS_API_KEY is set).
// With a fallback bridge (Deepgram, when its key is set), a refused connection or an out-of-credit
// message hands the mic to the fallback for the rest of the session.

import WebSocket from 'ws';
import { ENDPOINTS } from './providers.js';

// quota_exceeded / auth_error, not insufficient_audio_activity or chunk_size_exceeded (those aren't the key).
const OUT_OF_CREDIT = /quota|auth_error|unauthori[sz]ed|payment|credit/;

export class ElevenLabsBridge {
  constructor(apiKey, emit, { silenceSecs = '0.9', fallback = null } = {}) {
    this.apiKey = apiKey;
    this.emit = emit;
    this.silenceSecs = silenceSecs;
    this.fallback = fallback;
    this.fallen = false;
    this.ws = null;
    this.turn = 1;
  }

  async open(opts = {}) {
    if (this.fallen) return this.fallback.open(opts);
    const r = await this.connect(opts);
    if (r.ok || !this.fallback) return r;
    console.warn(`[stt] ElevenLabs unavailable (${r.error}); using the fallback`);
    this.fallen = true;
    return this.fallback.open(opts);
  }

  connect({ keyterms = [] } = {}) {
    if (!this.apiKey) return Promise.resolve({ ok: false, error: 'ELEVENLABS_API_KEY is not set in .env' });
    this.close();
    const q = new URLSearchParams({ model_id: 'scribe_v2_realtime', audio_format: 'pcm_16000', commit_strategy: 'vad', vad_silence_threshold_secs: this.silenceSecs, language_code: 'en' });
    // ElevenLabs refuses the whole connection over one bad keyterm (at most 20 characters each).
    for (const k of keyterms.map((x) => String(x).trim()).filter((x) => x && x.length <= 20).slice(0, 50)) q.append('keyterms', k);
    const ws = new WebSocket(`${ENDPOINTS.elevenlabs.stt}?${q}`, { headers: { 'xi-api-key': this.apiKey } });
    this.ws = ws;
    const send = (event, transcript) => this.emit('deepgram:message', JSON.stringify({ type: 'TurnInfo', event, turn_index: this.turn, transcript }));
    return new Promise((resolve) => {
      ws.once('open', () => resolve({ ok: true }));
      ws.once('error', (err) => resolve({ ok: false, error: err.message }));
      ws.once('unexpected-response', (_req, res) => resolve({ ok: false, error: `ElevenLabs refused the connection (HTTP ${res.statusCode})` }));
      ws.on('message', (data) => {
        let m;
        try { m = JSON.parse(data.toString()); } catch { return; }
        if (m.message_type === 'partial_transcript' && m.text?.trim()) send('Update', m.text);
        else if (m.message_type === 'committed_transcript') { if (m.text?.trim()) { send('EndOfTurn', m.text); this.turn++; } }
        else if (this.fallback && OUT_OF_CREDIT.test(`${m.message_type} ${m.error ?? ''}`)) {
          // Closing emits 'deepgram:closed'; the renderer reconnects, and open() goes to the fallback.
          console.warn(`[stt] ElevenLabs: ${m.message_type}; switching to the fallback`);
          this.fallen = true;
          ws.close();
        } else if (/error|invalid|exceeded|throttled|limited|overflow|exhausted|unauthori[sz]ed|quota/.test(m.message_type ?? '')) this.emit('deepgram:message', JSON.stringify({ type: 'Error', description: `${m.message_type}: ${m.error ?? ''}` }));
      });
      ws.on('close', (code) => { if (this.ws === ws) { this.ws = null; this.emit('deepgram:closed', code); } });
    });
  }

  sendAudio(chunk) {
    if (this.fallen) return this.fallback.sendAudio(chunk);
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: Buffer.from(chunk).toString('base64'), commit: false, sample_rate: 16000 }));
  }

  // Keyterms are fixed per connection here (Deepgram can change them live); they apply on the next connect.
  sendControl(message) { if (this.fallen) this.fallback.sendControl(message); }

  close() {
    if (this.fallen) this.fallback.close();
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try { ws.close(); } catch {}
  }
}
