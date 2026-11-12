// A real screen recording of Dixi shopping hands-free, with random shopping lists, on real stores and the offline
// fixture stores. Run under a virtual display:
//   xvfb-run -a -s "-screen 0 1440x900x24" node eval/shop-video.mjs --out <dir> [--seed 7] [--real target,amazon,…]
// What's on screen: a normal Chromium window (address bar, real pages, real mouse cursor) and Dixi's island (the
// real overlay.html with the eye) along the bottom, driven with the same messages everywhere.js sends. Each command
// is spoken aloud (espeak-ng, standing in for your voice) and goes through the same code as the app: filler and
// remarks ignored (everywhere-words), quick answers in code (quick.js), page commands through browse.js + realtabs.js
// + the shopping executor. The only stand-in: the page bridge is CDP here, Apple Events on your Mac. No models.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';
import { makeBrowse, forPage } from '../src/main/browse.js';
import { chatter, remark } from '../src/renderer/core/everywhere-words.js';
import { quickIntent, quickAnswer } from '../src/main/quick.js';
import { DX, PAGE_LIB } from '../src/renderer/ui/pagekit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'dixi-video')));
const SEED = Number(arg('seed', Date.now() % 100000));
const REAL = arg('real', 'target,amazon,walmart,safeway,automation exercise').split(',').filter(Boolean);
const W = 1440, H = 900, BH = 720;   // the browser on top, Dixi's island strip below
fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });

// ---- seeded randomness: the lists and the phrasing ----
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => a.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const SAY = {
  search: (x) => pick([`search for ${x}`, `look for ${x}`, `search ${x}`]),
  addFirst: () => pick(['add the first one to my cart', 'put the first one in my cart', 'add the first one']),
  addThis: () => pick(['add this to my cart', 'add this one', 'put this in my cart', 'add it to my cart']),
  open2: () => pick(['open the second one', 'open the third one', 'show me the second one']),
  back: () => pick(['go back', 'go back', 'take me back']),
  cart: () => pick(['go to my cart', 'open my cart', 'show me my cart']),
  remark: () => pick(['hmm, what else do I need', 'that looks good', "wow, that's cheap", 'uh, let me think', 'okay, interesting']),
  filler: () => pick(['okay', 'oh nice', 'um']),
};
const POOLS = {
  target: ['oat milk', 'paper towels', 'dish soap', 'granola', 'coffee pods', 'toothpaste', 'trail mix', 'almond butter'],
  amazon: ['paper towels', 'phone charger', 'water bottle', 'notebook', 'dish sponges', 'aa batteries'],
  walmart: ['bagels', 'cereal', 'peanut butter', 'paper plates'],
  safeway: ['bagels', 'eggs', 'avocados', 'orange juice'],
  'automation exercise': ['blue top', 'jeans', 'dress', 'tshirt'],
};
const SITES = {
  target: { url: 'https://www.target.com/', tpl: 'https://www.target.com/s?searchTerm={q}' },
  amazon: { url: 'https://www.amazon.com/', tpl: 'https://www.amazon.com/s?k={q}' },
  walmart: { url: 'https://www.walmart.com/', tpl: 'https://www.walmart.com/search?q={q}' },
  safeway: { url: 'https://www.safeway.com/', tpl: 'https://www.safeway.com/shop/search-results.html?q={q}' },
  'automation exercise': { url: 'https://automationexercise.com/', tpl: 'https://automationexercise.com/products?search={q}' },
};

// ---- the offline fixture stores (always reachable) ----
const fixture = await startServer({ seed: 3 });
const SHOPS = fixture.world.brands.filter((b) => ['shop', 'grocery', 'store'].includes(b.kind) && !b.quirks.login && !b.quirks.cookie);
const offline = shuffle(SHOPS).slice(0, 2);
const fixtureHosts = fixture.world.brands.map((b) => b.host);

// ---- the island page (src/renderer), served locally; its strict CSP is relaxed only to color its strip ----
const renderer = path.resolve(here, '../src/renderer');
const islandServer = http.createServer((req, res) => {
  const p = path.join(renderer, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(renderer) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(p);
  if (p.endsWith('overlay.html')) body = String(body).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '').replace('</head>', '<style>html,body{background:#1d1d1f!important}</style></head>');
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => islandServer.listen(0, '127.0.0.1', r));
const islandURL = `http://127.0.0.1:${islandServer.address().port}/everywhere/overlay.html`;

// ---- the windows ----
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({
  headless: false, executablePath: exe,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: [...fixtureHosts, '127.0.0.1', 'localhost'].join(',') } : undefined,
  args: ['--ignore-certificate-errors', `--host-resolver-rules=${fixtureHosts.map((h) => `MAP ${h} 127.0.0.1:${fixture.port}`).join(', ')}`,
    '--window-position=0,0', `--window-size=${W},${BH}`, '--no-first-run', '--no-default-browser-check', '--disable-features=Translate'],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
page.on('dialog', (d) => d.accept().catch(() => {}));
const place = async (pg, bounds) => { const c = await pg.context().newCDPSession(pg); const { windowId } = await c.send('Browser.getWindowForTarget'); await c.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); await c.send('Browser.setWindowBounds', { windowId, bounds }); };
await place(page, { left: 0, top: 0, width: W, height: BH });
await page.goto('about:blank');

const islandCtx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-island-')), {
  headless: false, executablePath: exe, viewport: null, args: [`--app=${islandURL}`, `--window-position=0,${BH}`, `--window-size=${W},${H - BH}`, '--no-first-run'],
});
await islandCtx.addInitScript(() => {
  const h = {};
  window.ew = { on: (c, f) => { (h[c] ||= []).push(f); }, approve() {}, stop() {}, undo() {}, mouse() {}, dash() {} };
  window.__ew = (c, d) => (h[c] || []).forEach((f) => f(d));
});
const island = islandCtx.pages()[0] ?? await islandCtx.waitForEvent('page');
await island.reload();
await place(island, { left: 0, top: BH, width: W, height: H - BH });
await island.waitForTimeout(500);
const ew = (c, d) => island.evaluate(([c, d]) => window.__ew?.(c, d), [c, d]).catch(() => {});
await ew('ew:prefs', { sounds: false }); await ew('ew:dock', 0);
const show = (d) => ew('ew:state', d);
await show({ state: 'idle' });

// ---- the real mouse ----
const mouse = spawn('python3', [path.join(here, 'video/xmouse.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
let at = { x: 900, y: 500 };
const glide = (to, ms = 700) => new Promise((resolve) => {
  mouse.stdout.once('data', resolve);
  mouse.stdin.write(`${at.x} ${at.y} ${Math.round(to.x)} ${Math.round(to.y)} ${ms}\n`);
  at = { x: Math.round(to.x), y: Math.round(to.y) };
});
/** A page point → the screen point the app would read (this window's own geometry, as underPointer reverses). */
const toScreen = async (p) => { const [sx, sy, dw, dh] = await page.evaluate('[screenX, screenY, outerWidth - innerWidth, outerHeight - innerHeight]'); return { x: p.x + sx + dw / 2, y: p.y + sy + dh }; };
async function pointAtResult(n) {
  await page.evaluate(PAGE_LIB).catch(() => {});
  const p = await page.evaluate(([DX, n]) => {
    const kit = window[DX]; if (!kit) return null;
    const list = kit.results(); const r = list[Math.min(n, list.length) - 1]; if (!r || list.length < 2) return null;   // one result: "this" needs no pointing
    const el = kit.get(r.ref); el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect(); return { x: b.left + Math.min(30, b.width / 2), y: b.top + b.height / 2 };
  }, [DX, n]).catch(() => null);
  if (p) await glide(await toScreen(p));
  return Boolean(p);
}
async function pointAtLine(n) {
  await page.evaluate(PAGE_LIB).catch(() => {});
  const p = await page.evaluate(([DX, n]) => {
    const kit = window[DX]; if (!kit) return null;
    const l = kit.cartLines()[n - 1]; if (!l) return null;
    const el = kit.get(l.remove ?? l.line) ?? null; const box = (el?.closest('li,tr,[class*=line],[class*=item],[data-sku],[class*=cart]') ?? el); if (!box) return null;
    box.scrollIntoView({ block: 'center' }); const b = box.getBoundingClientRect(); return { x: b.left + Math.min(40, b.width / 3), y: b.top + Math.min(24, b.height / 2) };
  }, [DX, n]).catch(() => null);
  if (p) await glide(await toScreen(p));
  return Boolean(p);
}

// ---- Dixi's brain for your browser, the page bridge being CDP here ----
const bridge = { async call(m) { try {
  if (m.op === 'go') { page.goto(m.url).catch(() => {}); await page.waitForTimeout(50); return { url: page.url(), title: '', loading: true }; }
  if (m.op === 'js') { const value = await page.evaluate(m.js); return { value, url: page.url(), title: await page.title().catch(() => ''), loading: false }; }
  return { url: page.url(), title: await page.title().catch(() => ''), loading: false };
} catch (err) { return { error: err.message.split('\n')[0] }; } } };
const titled = (n) => n.replace(/\b\w/g, (c) => c.toUpperCase());
const entries = [
  ...Object.entries(SITES).map(([name, x]) => ({ name: titled(name), said: name, url: x.url, host: new URL(x.url).hostname.replace(/^www\./, ''), finalHost: new URL(x.url).hostname.replace(/^www\./, ''), searchTemplate: x.tpl, fail: 0 })),
  ...offline.map((b) => ({ name: b.name, said: b.name.toLowerCase(), url: `https://${b.host}/`, host: b.host, finalHost: b.host, searchTemplate: null, fail: 0 })),
];
const brain = makeBrowse({ bridge, chat: async () => ({ status: 503, json: { error: { message: 'no model in this recording' } } }), tiers: () => ({}),
  resolve: async (q) => { const e = entries.find((x) => x.said === String(q.said).toLowerCase().trim()); return e ? { status: 'ok', url: e.url, host: e.host, finalHost: e.finalHost, name: e.name, entry: e, searchTemplate: e.searchTemplate } : { status: 'none' }; },
  registry: { entries, byHost: (h) => entries.find((e) => e.host === h) ?? null, outcome() {}, setSearchTemplate() {}, confirm() {} },
  pointer: () => at,
  // Dixi's questions mid-task, answered by voice as you would: "Which one?" → "the second one"; "Press …?" → "yes".
  ask: (q) => answerByVoice(q, pick(['the second one', 'the first one', 'the third one'])),
  confirm: async (q) => /^yes/.test(await answerByVoice(q, 'yes')),
  keys: { type: (t) => page.keyboard.type(t, { delay: 25 }), key: (k) => page.keyboard.press({ return: 'Enter', escape: 'Escape', tab: 'Tab' }[k] ?? k), click: (x, y) => page.mouse.click(x, y) } });
const chrome = { app: 'Google Chrome', bundle: 'com.google.Chrome' };

// ---- voices: yours (the commands) and Dixi's (answers and problems only) ----
const audio = [];
let t0 = 0;
function speak(text, voice, key) {
  const f = path.join(OUT, 'audio', `${String(audio.length).padStart(3, '0')}-${key}.wav`);
  execFileSync('espeak-ng', ['-v', voice, '-s', voice.includes('f') ? '175' : '165', '-w', f, text]);
  const dur = (fs.statSync(f).size - 44) / (22050 * 2) * 1000;
  audio.push({ f, at: Date.now() - t0 });
  return dur;
}

// ---- a question from Dixi, and your spoken answer ----
async function answerByVoice(question, reply) {
  const qd = speak(question, 'en-us+f3', 'dixi');
  await show({ state: 'listening', title: question.slice(0, 120), text: '' });
  await sleep(qd + 500);
  const d = speak(reply, 'en-us+m3', 'you');
  const words = reply.split(' ');
  for (let i = 1; i <= words.length; i++) { await sleep(d / words.length); await show({ state: 'listening', title: question.slice(0, 120), text: words.slice(0, i).join(' ') }); }
  await sleep(400);
  log.push({ t: ((Date.now() - t0) / 1000).toFixed(1), said: `(asked) ${question} → ${reply}`, route: 'answer', ok: true, ms: 0, message: '', url: page.url() });
  console.log(`  ↳ Dixi asked “${question.slice(0, 70)}” → you: “${reply}”`);
  await show({ state: 'thinking', title: reply });
  return reply;
}

// ---- one spoken command, start to finish ----
const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function say(said, { expect = null } = {}) {
  const dur = speak(said, 'en-us+m3', 'you');
  const words = said.split(' ');
  const start = Date.now();
  let level = setInterval(() => ew('ew:level', 0.25 + 0.6 * Math.abs(Math.sin(Date.now() / 140)) * rnd()), 70);
  await show({ state: 'listening', text: '' });
  for (let i = 1; i <= words.length; i++) {
    await sleep(Math.max(0, start + (dur * i) / words.length - Date.now()));
    await show({ state: 'listening', text: words.slice(0, i).join(' ') });
  }
  clearInterval(level); level = null; await ew('ew:level', 0);
  await sleep(450);   // the pause that ends a hands-free command
  const at0 = Date.now() - t0, tStart = Date.now();
  let r, route;
  if (chatter(said) || remark(said)) { route = 'ignored'; r = { ok: true, message: '(thinking out loud: nothing done)' }; await show({ state: 'idle' }); }
  else if (quickIntent(said)) {
    route = 'quick';
    const qa = await quickAnswer(said, { webAnswer: async () => null });
    r = { ok: Boolean(qa), message: qa?.say ?? "I couldn't work that out", answer: qa?.say };
    await show({ state: 'done', title: qa?.title ?? '', text: qa?.text ?? r.message, linger: 4000 });
  } else if (brain.forPage(said)) {
    route = 'page';
    const steps = [];
    await show({ state: 'thinking', title: said });
    r = await Promise.race([brain.run(said, chrome, { signal: new AbortController().signal, onStep: ({ label, i }) => { steps.forEach((x) => { x.state = 'done'; }); steps[i] = { label, state: 'running' }; show({ state: 'acting', title: said, steps: steps.slice(-6) }); } }),
      sleep(45000).then(() => ({ ok: false, message: 'That took too long, so I stopped.' }))]).catch((e) => ({ ok: false, message: e.message }));
    if (r.none) r = { ok: false, message: 'That needs a model (none is used in this recording).' };
    steps.forEach((x) => { x.state = 'done'; });
    await show({ state: r.ok ? 'done' : 'error', title: said, text: String(r.message).slice(0, 200), ...(steps.length > 1 && { steps }), linger: r.ok ? 3000 : 6000 });
  } else { route = 'mac'; r = { ok: false, message: 'A Mac command (not part of this browser recording).' }; }
  const ms = Date.now() - tStart;
  const truth = expect ? await expect().catch(() => false) : null;
  log.push({ t: (at0 / 1000).toFixed(1), said, route, ok: Boolean(r.ok), ms, message: r.message, url: page.url(), checked: truth });
  console.log(`${r.ok ? '✓' : '✗'} ${(at0 / 1000).toFixed(1).padStart(6)}s ${said.padEnd(36)} ${route.padEnd(7)} ${String(ms).padStart(5)} ms  ${String(r.message).slice(0, 90)}`);
  if (route === 'page' && (!r.ok || r.answer) || route === 'quick') speak(r.answer ?? r.message, 'en-us+f3', 'dixi');   // Dixi speaks answers and problems only
  await sleep(route === 'ignored' ? 600 : 1300);
  return r;
}

// ---- the random trips ----
function realTrip(name) {
  const items = shuffle(POOLS[name] ?? ['milk']);
  const c = [`go to ${name}`, SAY.search(items[0])];
  if (name === 'safeway' || name === 'walmart') return [...c, SAY.addFirst(), SAY.cart()];
  return [...c, SAY.addFirst(), SAY.remark(), { said: SAY.back(), when: 'product' }, { point: 3, said: SAY.addThis() }, SAY.cart(), ...(name === 'target' ? [{ line: 1, said: 'remove this' }, 'what time is it'] : [])];
}
function offlineTrip(b) {
  const named = shuffle(b.items).find((it) => it.name.split(' ').length > 1) ?? b.items[0];
  return [`go to ${b.name.toLowerCase()}`, SAY.search(b.items[0].base), SAY.addFirst(), { said: SAY.back(), when: 'product' }, { point: 2, said: SAY.addThis() }, SAY.filler(),
    `add the ${named.name.toLowerCase()} to my cart`, SAY.cart(), { line: 1, said: 'make that two' }, { line: 2, said: 'remove this' }, SAY.remark(), 'check out'];
}
const plan = [...REAL.map((n) => ({ store: n, trip: realTrip(n) })), ...offline.map((b) => ({ store: b.name, trip: offlineTrip(b) }))];
fs.writeFileSync(path.join(OUT, 'lists.json'), JSON.stringify({ seed: SEED, plan }, null, 2));
console.log(`seed ${SEED}; stores: ${plan.map((p) => p.store).join(', ')}`);

// ---- record ----
const raw = path.join(OUT, 'screen.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', `${W}x${H}`, '-i', process.env.DISPLAY,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'inherit', 'inherit'] });
t0 = Date.now() + 300;
await sleep(1200);
await glide({ x: 980, y: 380 }, 900);
for (const { store, trip } of plan) {
  for (const c of trip) {
    const said = typeof c === 'string' ? c : c.said;
    // "go back" only when a product page is open (a store that adds straight from its list never left the results).
    if (c.when === 'product' && !/\/(?:p|dp|ip|item|product|products)\/|product_details|prod\.html/i.test(page.url())) continue;
    if (c.point) await pointAtResult(c.point);
    if (c.line) await pointAtLine(c.line);
    const r = await say(said);
    if (r?.wall) break;   // a "prove you're human" page: Dixi stops there; on to the next store
  }
  await sleep(800);
  void store;
}
await sleep(1500);
ff.stdin.write('q');
await new Promise((r) => ff.on('exit', r));

// ---- your voice and Dixi's, mixed in where they were said ----
const final = path.join(OUT, 'dixi-shopping.mp4');
const inputs = audio.flatMap((a) => ['-i', a.f]);
const delays = audio.map((a, i) => `[${i + 1}]adelay=${Math.max(0, a.at)}|${Math.max(0, a.at)}[a${i}]`).join(';');
const mix = `${delays};${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0:dropout_transition=0[aout]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest', final]);
fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
const done = log.filter((l) => l.ok).length;
console.log(`\n${done}/${log.length} commands done · video ${final} (${(fs.statSync(final).size / 1e6).toFixed(1)} MB)`);
mouse.kill(); await islandCtx.close(); await browser.close(); await fixture.close(); islandServer.close();
process.exit(0);
