// Speed, end to end: a WAV plays as the microphone (real Deepgram, real YouTube). Runic must act while
// you're still talking, and pages must be on screen within 2 s of the last spoken word.
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = (name) => path.join(root, 'test/e2e/fixtures', name);
const speechSeconds = (wav) => (fs.statSync(wav).size - 44) / 32000;  // 16 kHz mono 16-bit, 44-byte header
const BUDGET_S = 2;

/** Plays `wav` as the mic; logs what Runic heard and showed, with times. Resolves when `doneJS` is true. */
async function listen(wav, doneJS) {
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, RUNIC_FAKE_AUDIO: wav } });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => window.__runic?.voice.isListening, null, { timeout: 20_000 });
    const result = await page.evaluate(async ({ speechS, doneJS }) => {
      const { voice, tabs } = window.__runic;
      const out = [], at = {};
      let t0 = 0;
      const now = () => (performance.now() - t0) / 1000;
      const mark = (k, m) => out.push(`${now().toFixed(2).padStart(6)}s  ${k.padEnd(8)} ${m}`);
      const set = voice.set.bind(voice);
      let heard = '';
      voice.set = (f) => { if (f.liveTranscript && f.liveTranscript !== heard) mark('heard', heard = f.liveTranscript); set(f); };
      let plan = '';
      const onChange = voice.onChange;
      voice.onChange = () => {
        const s = voice.plan.map((p) => `${p.label} [${p.state}]`).join(' | ');
        if (s !== plan) mark('screen', plan = s);
        for (const p of voice.plan) at[p.label.split(' ')[0]] ??= now();  // first time each command showed
        onChange();
      };
      const done = new Function('tabs', `return (async () => ${doneJS})()`);
      // Restart the mic so the WAV plays from its first word now: t = 0 is capture start.
      await voice.stop();
      t0 = performance.now();
      await voice.start();
      mark('speech', `ends at ${speechS.toFixed(2)}s`);
      let lastURL = '';
      for (;;) {
        const u = tabs.getCurrentURL();
        if (u !== lastURL) { mark('url', lastURL = u); at[`url:${new URL(u).pathname}`] ??= now(); }
        if (await done(tabs)) { mark('DONE', u); return { out, at, done: now() }; }
        if (now() > 25) return { out, at, done: Infinity };
        await new Promise((r) => setTimeout(r, 50));
      }
    }, { speechS: speechSeconds(wav), doneJS });
    console.log(result.out.join('\n'));
    return result;
  } finally {
    await app.close();
  }
}

const RESULTS_SHOWN = `/search_query=lo/i.test(tabs.getCurrentURL())
  && Number(await tabs.executeJS("document.querySelectorAll('ytd-video-renderer a#video-title').length")) > 0`;

test('"open YouTube and search lofi beats": results on screen within 2 s of the last word', async () => {
  const wav = fixture('voice-open-youtube-search.wav');  // "Runic, open YouTube and search lofi beats"
  const r = await listen(wav, RESULTS_SHOWN);
  console.log(`results ${(r.done - speechSeconds(wav)).toFixed(2)}s after the last word (budget ${BUDGET_S}s)`);
  expect(r.done - speechSeconds(wav)).toBeLessThanOrEqual(BUDGET_S);
});

test('acts while you speak: with no "and", the search starts before the last word', async () => {
  const wav = fixture('voice-no-and.wav');  // "Runic, open YouTube, search lofi beats, play the first video"
  const r = await listen(wav, `/\\/watch/.test(tabs.getCurrentURL())`);
  const end = speechSeconds(wav);
  console.log(`search on screen at ${r.at.Searching?.toFixed(2)}s, results URL at ${r.at['url:/results']?.toFixed(2)}s, speech ends ${end.toFixed(2)}s, video at ${r.done.toFixed(2)}s`);
  expect(r.at.Searching, 'search shown before you finish talking').toBeLessThan(end);
  expect(r.at['url:/results'], 'search page loading before you finish talking').toBeLessThan(end);
  expect(r.done, 'first video playing').toBeLessThan(end + 4);
});
