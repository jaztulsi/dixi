// Speed budget, end to end: a WAV plays as the microphone (real Deepgram, real YouTube) and the
// search results must be on screen within 2 s of the last spoken word.
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wav = path.join(root, 'test/e2e/fixtures/voice-open-youtube-search.wav');  // "Runic, open YouTube and search lofi beats"
const speechSeconds = (fs.statSync(wav).size - 44) / 32000;  // 16 kHz mono 16-bit, 44-byte header
const BUDGET_S = 2;

test('"open YouTube and search lofi beats": results on screen within 2 s of the last word', async () => {
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, RUNIC_FAKE_AUDIO: wav } });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__runic?.voice.isListening, null, { timeout: 20_000 });
    const log = await page.evaluate(async (speechS) => {
      const { voice, tabs } = window.__runic;
      const out = [];
      let t0 = 0;
      const now = () => (performance.now() - t0) / 1000;
      const mark = (k, m) => out.push(`${now().toFixed(2).padStart(6)}s  ${k.padEnd(8)} ${m}`);
      const set = voice.set.bind(voice);
      let heard = '';
      voice.set = (f) => { if (f.liveTranscript && f.liveTranscript !== heard) mark('heard', heard = f.liveTranscript); set(f); };
      let plan = '';
      const onChange = voice.onChange;
      voice.onChange = () => { const s = voice.plan.map((p) => `${p.label} [${p.state}]`).join(' | '); if (s !== plan) mark('screen', plan = s); onChange(); };
      // Restart the mic so the WAV plays from its first word now: t = 0 is capture start.
      await voice.stop();
      t0 = performance.now();
      await voice.start();
      mark('speech', `ends at ${speechS.toFixed(2)}s`);
      for (;;) {
        if (/search_query=lo/i.test(tabs.getCurrentURL())
          && Number(await tabs.executeJS("document.querySelectorAll('ytd-video-renderer a#video-title').length")) > 0) {
          mark('VISIBLE', tabs.getCurrentURL());
          return { out, visible: now() };
        }
        if (now() > 20) return { out, visible: Infinity };
        await new Promise((r) => setTimeout(r, 50));
      }
    }, speechSeconds);
    console.log(log.out.join('\n'));
    console.log(`results ${(log.visible - speechSeconds).toFixed(2)}s after the last word (budget ${BUDGET_S}s)`);
    expect(log.visible - speechSeconds).toBeLessThanOrEqual(BUDGET_S);
  } finally {
    await app.close();
  }
});
