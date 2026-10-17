// Debug helper (real network): what the resolver sees for real names/URLs.
//   node eval/debug-real.js "Google Docs" https://docs.google.com/ "Apple Music" https://music.apple.com/
import { launchApp } from './harness.js';
const { app, page } = await launchApp();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (/^https?:/.test(args[i])) continue;
  const name = args[i];
  const urls = []; while (/^https?:/.test(args[i + 1] ?? '')) urls.push(args[++i]);
  const probes = await app.evaluate(async ({ session }, urls) => Promise.all(urls.map(async (u) => {
    try { const r = await session.fromPartition('persist:dixi-tabs').fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(4000) }); const t = await r.text();
      return { u, status: r.status, final: r.url, title: t.match(/<title[^>]*>([^<]*)/i)?.[1], site: t.match(/og:site_name["'][^>]*content=["']([^"']*)/i)?.[1], len: t.length };
    } catch (e) { return { u, err: e.message }; } })), urls);
  console.log(name, JSON.stringify(probes));
  console.log('  resolve →', JSON.stringify(await page.evaluate((q) => window.dixi.resolve(q), { said: name, urls })).slice(0, 300));
}
await app.close();
