// The user's own phrases, said the way ElevenLabs delivers speech (live words, commit ~0.9 s after),
// wake word required, on the real sites. Reports what happened and WHEN relative to the end of speech
// (negative = done before the sentence ended).
//   node eval/demo.js
import { launchApp, say, media } from './harness.js';

const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const SCRIPT = [
  ['Hey Dixi, go to Amazon and search for wireless headphones', (r) => /amazon\.com\/s/.test(r.url) && /wireless/.test(decodeURIComponent(r.url))],
  ['add the first one to my cart', (r) => /added|cart/i.test(r.plan.join(' ')) && !/couldn/i.test(r.plan.join(' '))],
  ['Hey Dixi, search lo-fi beats on Apple Music', (r) => /music\.apple\.com/.test(r.url) && /lo-?fi/i.test(decodeURIComponent(r.url))],
  ['play the first one', (r) => /\/(album|song|playlist|station)\//.test(r.url)],
  ['Hey Dixi, can you get me a burger from Burger King', (r) => /bk\.com|burgerking/.test(r.url)],
  ['Headaches, open up Google Classroom', (r) => /classroom|accounts\.google|edu\.google/.test(r.url)],
  ['So anyway yeah, I am gonna let you down. Hey Dixi.', () => true],
  ['open YouTube and search for lofi beats', (r) => /youtube\.com\/results/.test(r.url)],
  ['play the second video', (r) => /youtube\.com\/watch/.test(r.url)],
  ['pause it', (r) => r.m?.paused],
  ['Dixi, buy me AirPods', (r) => /apple\.com/.test(r.url)],
];

const { app, page } = await launchApp();
await page.evaluate(() => { window.__dixi.settings.requireWakeWord = true; window.__reset(); });
for (const [text, ok] of SCRIPT.filter(([t]) => !only || only.test(t))) {
  await page.evaluate(() => { window.__dixi.voice.awakeUntil = window.__dixi.voice.awakeUntil; });
  const r = await say(app, page, text, { style: 'elevenlabs', timeoutMs: 30000 });
  const m = await media(page).catch(() => null);
  const s = { url: r.state.url, plan: r.state.plan, m: m && typeof m === 'object' ? m : null };
  const pass = ok(s);
  const firstAct = r.navs[0] ? r.navs[0].t - r.end : null;
  const stepEnds = r.state.trace.filter((e) => e.stage === 'step_end');
  const doneAt = stepEnds.length ? stepEnds.at(-1).t - r.end : null;
  console.log(`${pass ? 'PASS' : 'FAIL'} "${text}"\n      first page load ${firstAct ?? '-'}ms after you stopped talking · all done ${doneAt ?? '-'}ms · AI calls ${r.state.llm.calls}\n      ${r.state.plan.join(' · ') || '(nothing shown)'}\n      ${r.state.url.slice(0, 110)}${pass ? '' : `\n      trace: ${r.state.trace.map((e) => `${e.stage}${e.intent ? `:${e.intent.join(',')}` : ''}${e.source ? `(${e.source} ${e.ms}ms)` : ''}${e.errors?.length ? `!${e.errors.join(';')}` : ''}${e.status ? `:${e.status}/${e.host ?? ''}` : ''}${e.message ? `:${e.message.slice(0, 60)}` : ''}`).join(' → ').slice(0, 900)}`}`);
}
await app.close();
