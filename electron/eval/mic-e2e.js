// True end-to-end: a WAV file is the microphone (Chromium fake capture) → AudioWorklet → main process →
// the configured speech-to-text (ElevenLabs/Deepgram) → wake word → understand → act on the real site.
//   node eval/mic-e2e.js eval/audio-cache/e2e-amazon.wav
import path from 'node:path';
import { launchApp } from './harness.js';

const wav = path.resolve(process.argv[2]);
const { app, page } = await launchApp({ env: { DIXI_FAKE_AUDIO: wav } });
const t0 = Date.now();
await page.evaluate(() => { window.__dixi.settings.requireWakeWord = true; });
// launchApp stops the voice for injected-text tests; here we want the real mic, so start it again.
await page.evaluate(() => window.__dixi.voice.start());
let last = '';
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => ({ heard: window.__dixi.voice.liveTranscript, url: window.__dixi.tabs.getCurrentURL(), plan: window.__dixi.voice.plan.map((p) => `${p.label} [${p.state}]`).join(' · '), listening: window.__dixi.voice.isListening, status: window.__dixi.voice.statusLine }));
  const line = `${((Date.now() - t0) / 1000).toFixed(1)}s heard="${s.heard}" url=${s.url.slice(0, 70)} plan=${s.plan} ${s.listening ? '' : '(not listening)'} ${s.status}`;
  if (line.slice(6) !== last) console.log(line);
  last = line.slice(6);
}
const navs = await app.evaluate(() => globalThis.__navs.map((n) => `${new Date(n.t).toISOString().slice(17, 23)} ${n.url.slice(0, 60)}`));
console.log('page loads:', navs.join(' | '));
console.log('clauses:', JSON.stringify(await page.evaluate(() => window.__dixi.traces.filter((e) => e.stage === 'clause' || e.stage === 'interpret').map((e) => `${e.stage}:${e.clause ?? e.text}${e.intent ? ' → ' + JSON.stringify(e.intent.steps.map((x) => [x.act, x.said, x.query || x.item])) : ''}`))));
await app.close();
