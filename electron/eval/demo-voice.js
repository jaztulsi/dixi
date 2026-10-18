// The DEMO.md lines, spoken to the real app one after another. Each line is spoken by macOS `say` and
// fed in as the microphone feeds it (80 ms chunks of 16 kHz audio, silence in between, like an open
// mic) → speech-to-text → wake word → Dixi. The window stays on screen; nothing is typed.
// After each line: what speech-to-text heard, whether it was a hard-coded demo line (no AI), what Dixi
// did, how long after the words ended, and what the page really shows (bag lines, the video's state).
//   node eval/demo-voice.js [--only apple,youtube,amazon]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchApp, inPage } from './harness.js';

const CHAINS = {
  apple: ['Dixi, buy me an iPhone 18 and AirPods, then open my bag.', "Dixi, what's the total in my bag?", 'Dixi, how much is the iPhone by itself?',
    'Dixi, remove the AirPods.', 'Dixi, check out.'],
  youtube: ['Dixi, play lofi beats on YouTube.', 'Dixi, how many subscribers does this channel have?', 'Dixi, pause it and turn it up.', 'Dixi, what is this video about?'],
  amazon: ['Dixi, search for wireless earbuds on Amazon and add the first one to my cart.', 'Dixi, go to my cart.', "Dixi, what's in my cart and how much is it?",
    'Dixi, make it two.', 'Dixi, check out.'],
};
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only', Object.keys(CHAINS).join(',')).split(',');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-voice-'));
const wav = path.join(dir, 'line.wav');
/** The line as 16 kHz 16-bit mono samples (the WAV's data chunk), base64. */
function speak(text) {
  execFileSync('say', ['-v', 'Samantha', '-r', '175', '-o', wav, '--data-format=LEI16@16000', `[[slnc 300]] ${text}`]);
  const b = fs.readFileSync(wav);
  for (let p = 12; p + 8 <= b.length; p += 8 + b.readUInt32LE(p + 4)) if (b.toString('ascii', p, p + 4) === 'data') return b.subarray(p + 8, p + 8 + b.readUInt32LE(p + 4)).toString('base64');
  throw new Error('no audio in the WAV');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bag = (page) => inPage(page, `(() => ({ lines: [...document.querySelectorAll('select')].map((s) => { const l = s.id && document.querySelector('label[for="' + CSS.escape(s.id) + '"]'); return l ? (l.innerText || '').replace(/^quantity for /i, '').trim() + ' ×' + s.value : ''; }).filter(Boolean),
  total: (document.body.innerText.match(/total is \\$[\\d,.]+/i) || [''])[0] }))()`).catch(() => null);
const amazonCart = (page) => inPage(page, `(() => ({ count: document.querySelector('#nav-cart-count')?.innerText, lines: [...document.querySelectorAll('.sc-list-item[data-asin]')].filter((e) => e.getAttribute('data-asin') && e.offsetHeight).map((e) => {
  const shown = e.querySelector('[data-a-selector="value"], .sc-quantity-textfield, input[name="quantityBox"], select[name="quantity"]');
  return (e.querySelector('.sc-product-title, .a-truncate-full')?.innerText || '').trim().slice(0, 40) + ' ×' + (shown?.value || shown?.innerText || e.getAttribute('data-quantity')); }) }))()`).catch(() => null);
const video = (page) => inPage(page, `(() => { const v = document.querySelector('video'); return v ? { paused: v.paused, muted: v.muted, volume: Math.round(v.volume * 100) / 100, time: Math.round(v.currentTime) } : null; })()`).catch(() => null);

// A plain launch (not Playwright's): Apple refuses bag adds from an automated browser.
// Never on the ElevenLabs key: it's a free-tier key kept for live demos (a few runs used up a whole
// month on 2026-10-18). Listening goes to Deepgram and Dixi's voice is off.
const { app, page, profile } = await launchApp({ env: { DIXI_DEBUG: '', DIXI_STT: 'deepgram' }, real: true });
await page.evaluate(async () => {
  const v = window.__dixi.voice;
  v.speaker.say = () => {};
  window.__dixi.settings.requireWakeWord = true;
  // The microphone: every 80 ms the next chunk of the line being spoken, else silence.
  window.__speech = [];
  const silence = new Int16Array(1280).buffer;
  v.mic = { start: async (onChunk) => { clearInterval(window.__micTimer); window.__micTimer = setInterval(() => onChunk((window.__speech.shift() ?? silence).slice(0)), 80); }, stop: () => clearInterval(window.__micTimer) };
  // What speech-to-text sent back (the finished turns).
  const handle = v.handleMessage.bind(v);
  window.__raw = [];
  v.handleMessage = (raw) => { try { const j = JSON.parse(raw); if (j.event === 'EndOfTurn' || j.type === 'Error') window.__raw.push(j.transcript ?? j.description); } catch {} return handle(raw); };
  await v.start();
});
let n = 0;
const total = only.reduce((a, c) => a + CHAINS[c].length, 0);
try {
  for (const c of only) {
    console.log(`\n=== ${c}`);
    for (const line of CHAINS[c]) {
      n++;
      const audio = speak(line);
      const { mark, calls0 } = await page.evaluate(() => { window.__raw.length = 0; return { mark: window.__dixi.traces.length, calls0: window.__dixi.llm.calls.length }; });
      const ms = await page.evaluate((b64) => {
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        for (let p = 0; p < bytes.length; p += 2560) { const chunk = new Uint8Array(2560); chunk.set(bytes.subarray(p, p + 2560)); window.__speech.push(chunk.buffer); }
        return Math.ceil(bytes.length / 2560) * 80;
      }, audio);
      const spokenEnd = Date.now() + ms;
      let quietSince = null;
      for (;;) {
        await sleep(250);
        const s = await page.evaluate(() => ({ heard: window.__raw.length > 0, playing: window.__speech.length > 0, busy: window.__busy(), asking: Boolean(window.__dixi.voice.clarify), running: window.__dixi.voice.plan.some((p) => p.state === 'running' || p.state === 'queued') }));
        // Speech-to-text sends the finished sentence ~1 s after the words, sometimes a few seconds.
        if (s.playing || Date.now() < spokenEnd + 1500 || (!s.heard && Date.now() < spokenEnd + 10000)) { quietSince = null; continue; }
        quietSince = !s.busy && !s.running ? quietSince ?? Date.now() : null;
        if ((quietSince && Date.now() - quietSince > 1800) || s.asking || Date.now() - spokenEnd > 70000) break;
      }
      const r = await page.evaluate(({ mark, calls0 }) => {
        const d = window.__dixi;
        const tr = d.traces.slice(mark);
        return {
          heard: [...window.__raw],
          clauses: tr.filter((e) => e.stage === 'clause').map((e) => e.clause),
          understood: tr.filter((e) => e.stage === 'interpret').map((e) => `${e.source === 'fast' ? 'hard-coded/no AI' : `AI (${e.source})`}: ${(e.intent?.steps ?? []).map((x) => `${x.act}${x.item ? ` ${x.item}` : x.query ? ` ${x.query}` : x.value && x.act !== 'ask_page' ? ` ${x.value}` : ''}${x.qty ? ` ×${x.qty}` : ''}`).join(', ')}`),
          did: tr.filter((e) => e.stage === 'step_end').map((e) => `${e.ok ? '✓' : '✗'} ${e.message}`),
          lastStep: tr.filter((e) => e.stage === 'step_end').at(-1)?.t ?? null,
          asking: d.voice.clarify?.question ?? null,
          url: d.tabs.getCurrentURL(),
          ai: d.llm.calls.slice(calls0).map((x) => x.model.replace(/^.*\//, '')),
          lookahead: tr.filter((e) => e.stage === 'speculate').map((e) => e.text),
        };
      }, { mark, calls0 });
      console.log(`\n[${n}/${total}] said: “${line}”`);
      console.log(`  heard:      ${r.heard.map((h) => `“${h}”`).join(' ') || '(nothing)'}`);
      for (const u of r.understood) console.log(`  understood: ${u}`);
      for (const x of r.did) console.log(`  did:        ${x}`);
      if (r.asking) console.log(`  asks:       ${r.asking}`);
      if (r.ai.length && r.lookahead.length) console.log(`  looked ahead at: ${r.lookahead.map((x) => `“${x}”`).join(' ')}`);
      console.log(`  done ${r.lastStep ? ((r.lastStep - spokenEnd) / 1000).toFixed(1) : '-'} s after the words ended · AI calls: ${r.ai.length ? r.ai.join(', ') : 'none'}`);
      console.log(`  page:       ${r.url.slice(0, 110)}`);
      if (/apple\.com\/shop\/bag/.test(r.url)) { const b = await bag(page); if (b) console.log(`  bag:        ${b.lines.join(', ') || 'empty'} ${b.total ? `(${b.total})` : ''}`); }
      if (/amazon\.com/.test(r.url)) { const a = await amazonCart(page); if (a) console.log(`  cart:       ${a.count ?? '?'} in the header${a.lines.length ? `; ${a.lines.join(', ')}` : ''}`); }
      if (/youtube\.com\/(watch|shorts)/.test(r.url)) { const v = await video(page); if (v) console.log(`  video:      ${JSON.stringify(v)}`); }
    }
  }
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}
