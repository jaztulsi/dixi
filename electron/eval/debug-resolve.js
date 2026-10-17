// Debug helper: launch the app against the fixture web and resolve some names.
//   node eval/debug-resolve.js 7 "Faistnuk" "Tixora Market"
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';
import { makeWorld } from './world.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = Number(process.argv[2] ?? 7);
const server = await startServer({ world: makeWorld(seed) });
const env = { ...process.env, DIXI_EVAL: '1', DIXI_SEARCH_URL: 'https://search.fixture-web.net/search?q={q}' };
delete env.ELECTRON_RUN_AS_NODE;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-dbg-'));
const app = await electron.launch({ args: [root, `--user-data-dir=${profile}`, `--host-resolver-rules=MAP * 127.0.0.1:${server.port}, EXCLUDE localhost`, '--ignore-certificate-errors'], env });
const page = await app.firstWindow();
page.on('console', (m) => console.log('  [renderer]', m.type(), m.text().slice(0, 300)));
await page.waitForFunction(() => window.__dixi);
for (const name of process.argv.slice(3)) {
  const r = await page.evaluate((n) => window.dixi.resolve({ said: n, urls: [] }), name);
  console.log(name, '→', JSON.stringify(r).slice(0, 400));
}
for (const u of (process.env.PAGES ?? '').split(',').filter(Boolean)) {
  await page.evaluate(async (url) => { const d = window.__dixi; if (!d.tabs.activeTab) d.tabs.createTab('about:blank'); await d.tabs.navigate(url); await d.tabs.waitForDom(null, 4000); }, u);
  for (const call of (process.env.CALLS ?? 'results').split(';')) {
    const [fn, ...args] = call.split('|');
    const r = await page.evaluate(({ fn, args }) => window.__dixi.tabs.dx(fn, ...args.map((a) => (a.startsWith('/') ? new RegExp(a.slice(1, a.lastIndexOf('/')), a.slice(a.lastIndexOf('/') + 1)) : a))), { fn, args });
    console.log(u, fn, '→', JSON.stringify(r).slice(0, 500));
  }
}
const probe = await app.evaluate(async ({ session }, port) => {
  const res = await session.fromPartition('persist:dixi-tabs').fetch('https://search.fixture-web.net/search?q=Faistnuk%20official%20site', { headers: { 'x-dixi-probe': '1' } });
  return { status: res.status, url: res.url, body: (await res.text()).slice(0, 600) };
}, server.port);
console.log('search fetch:', JSON.stringify(probe).slice(0, 700));
console.log('events:', JSON.stringify(server.events.slice(-12)));
await app.close();
await server.close();
fs.rmSync(profile, { recursive: true, force: true });
