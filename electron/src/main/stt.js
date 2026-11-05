// ElevenLabs Scribe v2 Realtime speech-to-text, in the main process (the key never reaches the UI).
// Its messages are turned into the same TurnInfo events Deepgram Flux sends, so the voice agent
// doesn't care which one is listening:
//   partial_transcript   → TurnInfo Update      (all words of this turn so far)
//   committed_transcript → TurnInfo EndOfTurn   (the turn is over: voice-activity detection heard a pause)
// Pick it with DIXI_STT=elevenlabs (the default when ELEVENLABS_API_KEY is set).
// With a fallback bridge (Deepgram, when its key is set), a refused connection or an out-of-credit
// message hands the mic to the fallback: for 6 h when the key is refused or out of credit (the shared dead
// registry, so a relaunch skips it too), for retryMs after a network error or 5xx, then ElevenLabs is tried again.

import WebSocket from 'ws';
import { ENDPOINTS, deadAnswer, DEAD_MS } from './providers.js';

// quota_exceeded / auth_error, not insufficient_audio_activity or chunk_size_exceeded (those aren't the key).
const OUT_OF_CREDIT = /quota|auth_error|unauthori[sz]ed|payment|credit/;

export class ElevenLabsBridge {
  constructor(apiKey, emit, { silenceSecs = '0.9', fallback = null, dead = null, retryMs = 60e3 } = {}) {
    this.retryMs = retryMs;
    this.retryAt = 0;   // skip ElevenLabs until then (this session) after a transient failure
    this.dead = dead;   // the shared dead-service registry (providers.js Dead)
    this.apiKey = apiKey;
    this.emit = emit;
    this.silenceSecs = silenceSecs;
    this.fallback = fallback;
    this.fallen = false;
    this.ws = null;
    this.turn = 1;
    this.closes = 0;
  }

  async open(opts = {}) {
    if (this.dead?.is('elevenlabs') || Date.now() < this.retryAt) {   // 0 round trips to ElevenLabs
      if (!this.fallback) return { ok: false, error: 'ElevenLabs is out of credit or refused the key' };
      this.fallen = true;
      return this.fallback.open(opts);
    }
    if (this.fallen) { this.fallen = false; this.fallback.close(); }   // retry time: back to ElevenLabs
    const pending = this.connect(opts);
    const closes = this.closes;   // connect() closes the old socket first; a close after this is the caller giving up
    const r = await pending;
    if (r.ok || !this.fallback) return r;
    if (this.closes !== closes) return { ok: false, error: 'closed while connecting' };   // never open the fallback after a cancel
    this.giveUp(r.error, deadAnswer(Number(/HTTP (\d+)/.exec(r.error)?.[1])));
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
          this.giveUp(m.message_type, true);
          ws.close();
        } else if (/error|invalid|exceeded|throttled|limited|overflow|exhausted|unauthori[sz]ed|quota/.test(m.message_type ?? '')) this.emit('deepgram:message', JSON.stringify({ type: 'Error', description: `${m.message_type}: ${m.error ?? ''}` }));
      });
      ws.on('close', (code) => { if (this.ws === ws) { this.ws = null; this.emit('deepgram:closed', code); } });
    });
  }

  // A refused key or no credit is dead for 6 h (registry, or this session without one); anything else retries soon.
  giveUp(why, dead) {
    if (dead && this.dead) this.dead.mark('elevenlabs', `STT ${why}`);
    else this.retryAt = Date.now() + (dead ? DEAD_MS : this.retryMs);
    console.warn(`[stt] ElevenLabs unavailable (${why}); using the fallback`);
  }

  sendAudio(chunk) {
    if (this.fallen) return this.fallback.sendAudio(chunk);
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: Buffer.from(chunk).toString('base64'), commit: false, sample_rate: 16000 }));
  }

  // Keyterms are fixed per connection here (Deepgram can change them live); they apply on the next connect.
  sendControl(message) { if (this.fallen) this.fallback.sendControl(message); }

  close() {
    this.closes++;
    if (this.fallen) this.fallback.close();
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try { ws.close(); } catch {}
  }
}
