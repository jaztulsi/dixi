// Real-browser shopping, end to end, offline: the same code that drives your Chrome (main/realtabs.js +
// renderer/core/execute.js + interpret.js) drives a real Chromium page of the fixture store. Only the Apple
// Events hop is replaced: page.evaluate runs the same JavaScript in the page's main world, as Chrome's
// "execute javascript" does. Ground truth is the store's own log (cart_add / cart_remove / cart_qty).
// No model is called: every command here is one the rules understand.   node eval/realtabs-e2e.mjs
import { chromium } from 'playwright';
import { startServer } from './server.js';
import { makeBrowse, forPage } from '../src/main/browse.js';

const server = await startServer({ seed: 3 });
const SHOPS = server.world.brands.filter((b) => ['shop', 'grocery', 'store'].includes(b.kind) && !b.quirks.login);
const only = process.argv.includes('--one');
let browser;
try { browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * 127.0.0.1:${server.port}, EXCLUDE localhost`, '--ignore-certificate-errors', '--no-proxy-server'] }); }
catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: [`--host-resolver-rules=MAP * 127.0.0.1:${server.port}, EXCLUDE localhost`, '--ignore-certificate-errors', '--no-proxy-server'] }); }
const page = await browser.newPage();

// The Apple Events worker, played by Playwright: same messages, same answers.
const bridge = {
  async call(m) {
    try {
      if (m.op === 'go') { page.goto(m.url).catch(() => {}); await new Promise((r) => setTimeout(r, 30)); return { url: page.url(), title: '', loading: true }; }
      if (m.op === 'js') { const value = await page.evaluate(m.js); return { value, url: page.url(), title: await page.title().catch(() => ''), loading: false }; }
      return { url: page.url(), title: await page.title().catch(() => ''), loading: false };
    } catch (err) { return { error: err.message.split('\n')[0] }; }
  },
};
// The whole brain Dixi uses for your browser (browse.js): routing, understanding, executor. Models: none.
let mouse = null;
// The app reads the pointer in screen points; the page turns it back with its own window geometry. Same here.
const toScreen = async ({ x, y }) => { const [sx, sy, dw, dh] = await page.evaluate('[screenX, screenY, outerWidth - innerWidth, outerHeight - innerHeight]'); return { x: x + sx + dw / 2, y: y + sy + dh }; };
const brain = makeBrowse({ bridge, pointer: () => mouse, chat: async () => ({ status: 503, json: { error: { message: 'no model in this test' } } }), tiers: () => ({}),
  resolve: async () => ({ status: 'none' }),
  keys: { type: (t) => page.keyboard.type(t), key: (k) => page.keyboard.press({ return: 'Enter' }[k] ?? k), click: (x, y) => page.mouse.click(x, y) } });
const chrome = { app: 'Google Chrome', bundle: 'com.google.Chrome' };
const log = async () => (await fetch(`http://127.0.0.1:${server.port}/__log`)).json();
const rows = [];
async function say(said, expect) {
  const t0 = performance.now();
  const route = forPage(said);
  const r = route ? await brain.run(said, chrome, { signal: new AbortController().signal }) : { ok: false, message: 'not a page command' };
  const steps = r.none ? [] : [r.source ?? ''];
  const ms = Math.round(performance.now() - t0);
  const truth = await expect(await log());
  rows.push({ said, ok: r.ok && truth, ms, msg: r.message });
  console.log(`${r.ok && truth ? '✓' : '✗'} ${said.padEnd(34)} ${String(ms).padStart(5)} ms  ${String(route).padEnd(6)} ${r.message}`);
}
const count = (events, type) => events.filter((e) => e.type === type).length;

for (const shop of only ? SHOPS.slice(0, 1) : SHOPS) {
  console.log(`\nstore: ${shop.name} (${shop.kind}, ${shop.host}) add "${shop.quirks.addLabel}", results "${shop.quirks.results}", search "${shop.quirks.search}"${shop.quirks.cookie ? ', cookie banner' : ''}`);
    await fetch(`http://127.0.0.1:${server.port}/__reset`, { method: 'POST' });
  await page.goto(`https://${shop.host}/c/all`);   // a category page: every product, a results list to pick from
  // "add this" on a list: the result under the mouse pointer (here the third card).
  const hovered = page.locator('a[href*="/item/"]').nth(3);
  const third = await hovered.boundingBox(), hoverSku = (await hovered.getAttribute('href')).split('/').pop();
  mouse = await toScreen({ x: Math.round(third.x + 5), y: Math.round(third.y + 5) });
  await say('add this to my cart', (e) => e.some((x) => x.type === 'cart_add' && x.sku === hoverSku));
  mouse = null;
  await say('go back', () => /\/c\//.test(page.url()));
  await say('add the first one to my cart', (e) => count(e, 'cart_add') === 2);
  await say('go back', () => /\/c\//.test(page.url()));
  await say('open the second one', () => /\/item\//.test(page.url()));
  await say('add this to my cart', (e) => count(e, 'cart_add') === 3);
  await say('go back', () => /\/c\//.test(page.url()));
  const inCart = new Set([hoverSku, ...(await log()).filter((x) => x.type === 'cart_add').map((x) => x.sku)]);
  const named = shop.items.find((it) => !inCart.has(it.sku) && it.name.split(' ').length > 1) ?? shop.items.find((it) => !inCart.has(it.sku));
  await say(`add the ${named.name} to my cart`, (e) => e.some((x) => x.type === 'cart_add' && x.sku === named.sku));
  await say('go to my cart', () => /\/cart/.test(page.url()));
  const lines = await page.$$eval('.line a', (as) => as.map((a) => a.textContent));
  const lineSkus = await page.$$eval('.line', (ls) => ls.map((l) => l.dataset.sku));
  await say(`remove the ${lines[0]} from my cart`, (e) => count(e, 'cart_remove') === 1);
  // "remove this": the cart line under the pointer.
  const box = await page.locator(`.line[data-sku="${lineSkus[1]}"]`).boundingBox();   // that product's line, wherever it moved to
  mouse = await toScreen({ x: Math.round(box.x + 4), y: Math.round(box.y + box.height / 2) });
  await say('remove this', (e) => e.some((x) => x.type === 'cart_remove' && x.sku === lineSkus[1]));
  mouse = null;
  await say(`take the ${lines[2]} out of my cart`, (e) => count(e, 'cart_remove') === 3);
  await say('make it two', (e) => e.some((x) => x.type === 'cart_qty' && x.qty === 2));
  await say('remove it', (e) => count(e, 'cart_remove') === 4);

}
const passed = rows.filter((r) => r.ok).length, ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const byCmd = {};
for (const r of rows) { const k = r.said.replace(/^remove this$/, 'remove this (pointer)').replace(/the .+ (from|out of) my cart/, 'the <line> $1 my cart').replace(/add the .+ to my cart/, (m) => (m === 'add the first one to my cart' ? m : 'add the <item> to my cart')); (byCmd[k] ??= [0, 0])[r.ok ? 0 : 1]++; }
console.log('\nper command (pass/fail):'); for (const [k, [a, b]] of Object.entries(byCmd)) console.log(`  ${String(a).padStart(2)}/${a + b}  ${k}`);
console.log(`\n${passed}/${rows.length} commands done on ${only ? 1 : SHOPS.length} stores · p50 ${ms[Math.floor((ms.length - 1) / 2)]} ms · p95 ${ms[Math.floor(ms.length * 0.95)]} ms · max ${ms.at(-1)} ms · $0 (no model)`);
await browser.close();
await server.close();
process.exit(passed === rows.length ? 0 : 1);
