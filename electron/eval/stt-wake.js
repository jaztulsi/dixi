// Quick A/B: does each speech provider hear "Hey Dixi, <command>" right, and how fast?
//   node eval/stt-wake.js
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { render, VOICES } from './audio.js';
import { loadConfig } from '../src/main/config.js';

const config = loadConfig();
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'audio-cache');
const PHRASES = ['Hey Dixi, go to Amazon and search for wireless headphones', 'Hey Dixi, search lo-fi beats on Apple Music', 'Hey Dixi, open up Google Classroom',
  'Dixi, buy me AirPods', 'Hey Dixi, can you get me a burger from Burger King', 'Hey Dixi, play the second video', 'Hey Dixi, add it to my cart'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const speechEnd = (file) => { const b = fs.readFileSync(file); const p = new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) / 2); for (let i = p.length - 320; i > 0; i -= 320) { let e = 0; for (let j = i; j < i + 320; j++) e += p[j] * p[j]; if (Math.sqrt(e / 320) > 400) return (i + 320) / 16; } return p.length / 16; };

async function eleven(file) {
  const q = new URLSearchParams({ model_id: 'scribe_v2_realtime', audio_format: 'pcm_16000', commit_strategy: 'vad', vad_silence_threshold_secs: '0.5', language_code: 'en' });
  for (const k of ['Dixi', 'Hey Dixi']) q.append('keyterms', k);
  const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${q}`, { headers: { 'xi-api-key': config.keys.elevenlabs } });
  const t0 = performance.now(); let partialAt = null, commitAt = null, text = '', lastPartial = '', err = null;
  ws.on('message', (d) => { const m = JSON.parse(d.toString());
    if (m.message_type === 'partial_transcript') { lastPartial = m.text; if (m.text && partialAt == null) partialAt = performance.now() - t0; }
    if (m.message_type === 'committed_transcript' && m.text) { text += `${m.text} `; commitAt = performance.now() - t0; }
    if (/error|exceeded|throttled|limited/.test(m.message_type)) err = `${m.message_type}: ${m.error}`; });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); ws.once('unexpected-response', (_q, r) => rej(new Error(`HTTP ${r.statusCode}`))); });
  const pcm = fs.readFileSync(file).subarray(44);
  for (let i = 0; i < pcm.length; i += 2560) { ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: pcm.subarray(i, i + 2560).toString('base64'), commit: false, sample_rate: 16000 })); await sleep(80); }
  for (let i = 0; i < 30 && commitAt == null; i++) await sleep(100);
  ws.close();
  return { text: (text || lastPartial).trim(), commitMs: commitAt, err };
}
async function flux(file) {
  const q = new URLSearchParams([['model', 'flux-general-en'], ['encoding', 'linear16'], ['sample_rate', '16000'], ['eot_threshold', '0.7'], ['eager_eot_threshold', '0.4'], ['eot_timeout_ms', '1500'], ['keyterm', 'Dixi'], ['keyterm', 'Hey Dixi']]);
  const ws = new WebSocket(`wss://api.deepgram.com/v2/listen?${q}`, { headers: { Authorization: `Token ${config.keys.deepgram}` } });
  const t0 = performance.now(); let eagerAt = null, endAt = null, text = '';
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type !== 'TurnInfo') return; if (m.transcript) text = m.transcript; if (m.event === 'EagerEndOfTurn' && eagerAt == null) eagerAt = performance.now() - t0; if (m.event === 'EndOfTurn' && endAt == null) endAt = performance.now() - t0; });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const pcm = fs.readFileSync(file).subarray(44);
  for (let i = 0; i < pcm.length; i += 2560) { ws.send(pcm.subarray(i, i + 2560)); await sleep(80); }
  for (let i = 0; i < 30 && endAt == null; i++) await sleep(100);
  ws.close();
  return { text, eagerMs: eagerAt, endMs: endAt };
}
for (const [i, p] of PHRASES.entries()) {
  const [voice] = VOICES[i % 3];
  const f = render(p, voice, 200, path.join(dir, `wake2-${i}-${voice}.wav`));
  const end = speechEnd(f);
  const [e, d] = await Promise.all([eleven(f).catch((x) => ({ err: x.message })), flux(f).catch((x) => ({ err: x.message }))]);
  console.log(`"${p}" (${voice})\n   elevenlabs: "${e.text ?? ''}" commit +${e.commitMs != null ? Math.round(e.commitMs - end) : '-'}ms ${e.err ?? ''}\n   deepgram:   "${d.text ?? ''}" eager +${d.eagerMs != null ? Math.round(d.eagerMs - end) : '-'}ms end +${d.endMs != null ? Math.round(d.endMs - end) : '-'}ms ${d.err ?? ''}`);
}
