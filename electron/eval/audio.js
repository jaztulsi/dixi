// Speech-recognition benchmark (attribution run C1 + the Phase 2C bake-off).
//   node eval/audio.js --seed 7 [--n 40] [--providers flux,nova3,groq-whisper,whisper-local] [--conc 6]
// Renders corpus commands with macOS voices (accents, rates) clean and with babble noise at a fixed SNR,
// streams each clip in real time to streaming providers (Deepgram Flux v2, Nova-3 v1, ElevenLabs if keyed)
// and sends whole clips to batch ones (Groq Whisper, local whisper.cpp). Measures word error rate, entity
// error rate (site/product names, queries, items, numbers), end-of-speech → final transcript latency, and
// wake-word false accepts/rejects. Writes eval/out/stt-<seed>.json and eval/audio-cache/*.wav.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generate } from './gen.js';
import { rng } from './world.js';
import { loadConfig } from '../src/main/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('seed', 7));
const N = Number(arg('n', 40));
const CONC = Number(arg('conc', 6));
const providers = arg('providers', 'flux,nova3,groq-whisper,whisper-local').split(',');
const config = loadConfig();
const dir = path.join(here, 'audio-cache');
fs.mkdirSync(dir, { recursive: true });

export const VOICES = [['Samantha', 'en-US'], ['Daniel', 'en-GB'], ['Rishi', 'en-IN'], ['Karen', 'en-AU'], ['Moira', 'en-IE'], ['Tessa', 'en-ZA']];
const SR = 16000;

// ---- WAV helpers (16 kHz mono 16-bit) ----
function readPCM(file) { const b = fs.readFileSync(file); return new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) / 2); }
function writeWAV(file, pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length * 2, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length * 2)]));
}
/** say → 16 kHz mono WAV with 0.3 s lead and 1.6 s tail of silence (room for end-of-turn detection). */
export function render(text, voice, rate, file) {
  if (fs.existsSync(file)) return file;
  const aiff = `${file}.aiff`;
  execFileSync('say', ['-v', voice, '-r', String(rate), '-o', aiff, text]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', aiff, '-af', 'adelay=300:all=1,apad=pad_dur=1.6', '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', file]);
  fs.rmSync(aiff, { force: true });
  return file;
}
const rms = (pcm) => Math.sqrt(pcm.reduce((a, v) => a + v * v, 0) / Math.max(1, pcm.length));
/** Mix babble (other speech) + a little hiss at `snr` dB below the speech. */
export function noisy(clean, babbleFiles, snr, file, r) {
  if (fs.existsSync(file)) return file;
  const s = readPCM(clean);
  const speechRMS = rms(s.filter((v) => Math.abs(v) > 300));
  const noise = new Float32Array(s.length);
  for (const f of babbleFiles) { const b = readPCM(f); const off = r.int(Math.max(1, b.length)); for (let i = 0; i < s.length; i++) noise[i] += b[(i + off) % b.length]; }
  for (let i = 0; i < s.length; i++) noise[i] += (r.next() - 0.5) * 400;
  const scale = speechRMS / (rms(noise) * Math.pow(10, snr / 20));
  const out = new Int16Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(s[i] + noise[i] * scale)));
  writeWAV(file, out);
  return file;
}
/** Where speech ends in a clean clip (last 20 ms frame with energy), in seconds. */
function speechEnd(file) {
  const p = readPCM(file); const F = 320;
  for (let i = p.length - F; i > 0; i -= F) if (rms(p.subarray(i, i + F)) > 400) return (i + F) / SR;
  return p.length / SR;
}

// ---- scoring ----
const words = (s) => String(s).toLowerCase().replace(/[’']s\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
function wer(ref, hyp) {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { errors: d[r.length][h.length], n: r.length };
}
/** An entity is heard right if its words appear in the transcript (spacing-insensitive). */
const heard = (entity, hyp) => words(hyp).join('').includes(words(entity).join(''));

// ---- providers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function streamDeepgram(file, url, kind, keyterms) {
  const pcm = fs.readFileSync(file).subarray(44);
  const ws = new WebSocket(url, { headers: { Authorization: `Token ${config.keys.deepgram}` } });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const t0 = performance.now();
  let final = '', eagerAt = null, endAt = null, lastText = '';
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (kind === 'flux' && m.type === 'TurnInfo') {
      if (m.transcript) lastText = m.transcript;
      if (m.event === 'EagerEndOfTurn' && eagerAt == null) eagerAt = performance.now() - t0;
      if (m.event === 'EndOfTurn' && endAt == null) { endAt = performance.now() - t0; final = m.transcript; }
    }
    if (kind === 'nova3' && m.type === 'Results') {
      const t = m.channel?.alternatives?.[0]?.transcript ?? '';
      if (m.is_final && t) final += `${t} `;
      if (m.speech_final && endAt == null && final.trim()) endAt = performance.now() - t0;
    }
  });
  if (kind === 'flux' && keyterms?.length) ws.send(JSON.stringify({ type: 'Configure', keyterms }));
  const CH = 2560;  // 80 ms
  for (let i = 0; i < pcm.length; i += CH) { ws.send(pcm.subarray(i, i + CH)); await sleep(80); }
  const deadline = performance.now() + 4000;
  while (endAt == null && performance.now() < deadline) await sleep(50);
  ws.send(JSON.stringify(kind === 'flux' ? { type: 'CloseStream' } : { type: 'CloseStream' }));
  await sleep(200);
  ws.close();
  return { text: (final || lastText).trim(), endMs: endAt, eagerMs: eagerAt };
}
const fluxURL = (kt) => `wss://api.deepgram.com/v2/listen?${new URLSearchParams([['model', 'flux-general-en'], ['encoding', 'linear16'], ['sample_rate', '16000'], ['eot_threshold', '0.7'], ['eager_eot_threshold', '0.4'], ['eot_timeout_ms', '1500'], ...kt.map((k) => ['keyterm', k])])}`;
const novaURL = (kt) => `wss://api.deepgram.com/v1/listen?${new URLSearchParams([['model', 'nova-3'], ['encoding', 'linear16'], ['sample_rate', '16000'], ['interim_results', 'true'], ['endpointing', '300'], ['smart_format', 'true'], ...kt.map((k) => ['keyterm', k])])}`;

async function groqWhisper(file, prompt) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/wav' }), 'a.wav');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'en');
  form.append('response_format', 'json');
  if (prompt) form.append('prompt', prompt);
  const t0 = performance.now();
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${config.keys.groq}` }, body: form });
  const j = await r.json();
  return { text: j.text ?? `ERROR ${r.status} ${j.error?.message ?? ''}`, reqMs: performance.now() - t0 };
}
function whisperLocal(file) {
  const t0 = performance.now();
  const out = execFileSync('whisper-cli', ['-m', path.join(process.env.HOME, 'whisper.cpp/models/ggml-base.en.bin'), '-f', file, '-nt', '-np', '-t', '4'], { encoding: 'utf8' });
  return { text: out.trim(), reqMs: performance.now() - t0 };
}

// ---- main ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const { cases, world } = generate(seed);
  const r = rng(seed + 99);
  const usable = cases.filter((c) => c.text.length > 4);
  const by = {};
  for (const c of usable) (by[c.cat] ??= []).push(c);
  const pick = Object.values(by).flatMap((l) => l.slice(0, Math.max(1, Math.ceil(N / Object.keys(by).length)))).slice(0, N);
  // Each case: one accent, two conditions (clean at normal rate; babble 10 dB at fast rate).
  const clips = [];
  for (const [i, c] of pick.entries()) {
    const [voice, accent] = VOICES[i % VOICES.length];
    const base = path.join(dir, `${c.id}-${voice}`);
    const clean = render(c.text, voice, 185, `${base}-185.wav`);
    const fast = render(c.text, voice, 245, `${base}-245.wav`);
    clips.push({ c, voice, accent, cond: 'clean', file: clean, end: speechEnd(clean) });
    clips.push({ c, voice, accent, cond: 'babble10-fast', file: fast, end: speechEnd(fast) });
  }
  // Babble from other clips.
  for (const cl of clips.filter((x) => x.cond !== 'clean')) {
    const others = clips.filter((x) => x.cond === 'clean' && x.c.id !== cl.c.id).slice(0, 30);
    cl.file = noisy(cl.file, [r.pick(others).file, r.pick(others).file], 10, cl.file.replace('.wav', '-babble10.wav'), r);
  }
  // Wake word: said first (should trigger) vs mentioned in passing / not at all (should not).
  const wake = [];
  for (const [i, c] of pick.slice(0, 12).entries()) {
    const [voice] = VOICES[i % VOICES.length];
    wake.push({ text: `Dixi, ${c.text}`, voice, should: true });
    wake.push({ text: `I was telling Dixie about ${c.entities?.length ? world.brands.find((b) => b.id === c.entities[0])?.name ?? 'it' : 'it'} yesterday`, voice, should: false });
  }
  for (const w of wake) w.file = render(w.text, w.voice, 190, path.join(dir, `wake-${words(w.text).join('-').slice(0, 60)}-${w.voice}.wav`));

  const entitiesOf = (c) => [...new Set(c.gold.steps.flatMap((s) => [s.said, s.query, s.item]).filter(Boolean))];
  const keyterms = [];  // no biasing for the baseline bake-off; --keyterms adds world names
  if (process.argv.includes('--keyterms')) keyterms.push(...world.brands.map((b) => b.name).slice(0, 40));
  const results = [];
  const run = async (p, cl) => {
    try {
      if (p === 'flux') return streamDeepgram(cl.file, fluxURL(['Dixi']), 'flux', keyterms);
      if (p === 'nova3') return streamDeepgram(cl.file, novaURL(['Dixi', ...keyterms]), 'nova3');
      if (p === 'groq-whisper') return groqWhisper(cl.file, keyterms.length ? keyterms.join(', ') : 'Dixi');
      if (p === 'whisper-local') return whisperLocal(cl.file);
    } catch (err) { return { text: `ERROR ${err.message}` }; }
    return { text: 'ERROR unknown provider' };
  };
  for (const p of providers) {
    const queue = [...clips.map((cl) => ({ ...cl, kind: 'cmd' })), ...wake.map((w) => ({ ...w, kind: 'wake', c: null, end: speechEnd(w.file) }))];
    const t0 = Date.now();
    await Promise.all(Array.from({ length: p.startsWith('whisper-local') ? 1 : CONC }, async () => {
      for (let cl = queue.shift(); cl; cl = queue.shift()) {
        const out = await run(p, cl);
        const row = { provider: p, kind: cl.kind, voice: cl.voice, cond: cl.cond ?? 'clean', ref: cl.c?.text ?? cl.text, hyp: out.text };
        if (cl.kind === 'cmd') {
          Object.assign(row, wer(cl.c.text, out.text), { id: cl.c.id, entities: entitiesOf(cl.c).map((e) => ({ e, ok: heard(e, out.text) })) });
          if (out.endMs != null) row.endpointMs = Math.round(out.endMs - cl.end * 1000);
          if (out.eagerMs != null) row.eagerMs = Math.round(out.eagerMs - cl.end * 1000);
          if (out.reqMs != null) row.reqMs = Math.round(out.reqMs);
        } else {
          row.should = cl.should;
          row.triggered = /^\s*(?:hey\s+|ok(?:ay)?\s+)?(dixi|dixie|dixy|dixey|dixee|dicksy|dicksie)\b/i.test(out.text);
        }
        results.push(row);
      }
    }));
    const mine = results.filter((x) => x.provider === p);
    const cmd = mine.filter((x) => x.kind === 'cmd');
    const sum = (k) => cmd.reduce((a, x) => a + (x[k] ?? 0), 0);
    const ents = cmd.flatMap((x) => x.entities);
    const q = (arr, f) => { const s = arr.filter((v) => v != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
    const w = mine.filter((x) => x.kind === 'wake');
    const fa = w.filter((x) => !x.should && x.triggered).length, fr = w.filter((x) => x.should && !x.triggered).length;
    const byCond = (cond) => { const s = cmd.filter((x) => x.cond === cond); const e = s.reduce((a, x) => a + x.errors, 0), n = s.reduce((a, x) => a + x.n, 0); const en = s.flatMap((x) => x.entities); return `WER=${((100 * e) / Math.max(1, n)).toFixed(1)}% EntityErr=${((100 * en.filter((x) => !x.ok).length) / Math.max(1, en.length)).toFixed(1)}%`; };
    console.log(`${p.padEnd(14)} clips=${cmd.length} WER=${((100 * sum('errors')) / Math.max(1, sum('n'))).toFixed(1)}% EntityErr=${((100 * ents.filter((x) => !x.ok).length) / Math.max(1, ents.length)).toFixed(1)}% | clean ${byCond('clean')} | babble ${byCond('babble10-fast')} | endpoint p50=${q(cmd.map((x) => x.endpointMs), 0.5)}ms p95=${q(cmd.map((x) => x.endpointMs), 0.95)}ms eager p50=${q(cmd.map((x) => x.eagerMs), 0.5)}ms req p50=${q(cmd.map((x) => x.reqMs), 0.5)}ms | wake FA=${fa}/${w.filter((x) => !x.should).length} FR=${fr}/${w.filter((x) => x.should).length} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  fs.writeFileSync(path.join(here, 'out', `stt-${seed}${keyterms.length ? '-keyterms' : ''}.json`), JSON.stringify(results, null, 1));
}
