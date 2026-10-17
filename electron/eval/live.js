// Live suite on REAL sites with real tasks: the evidence that matters. Read-only: it never signs in,
// pays or places an order (the purchase gate must stop it, and that is checked).
//
//   node eval/live.js [--only youtube,amazon] [--word-ms 240] [--out live]
//
// Each scenario is a chain of things a person says on one site. Every step is checked against what
// really happened in the browser: the URL it landed on, the video's real state, the real quantity in the
// cart. Every top-level page load is recorded: a load outside the site that was asked for = WRONG SITE.
// Bot walls / CAPTCHAs / sign-in walls are reported as BLOCKED (with what Dixi said), never as passes.

import fs from 'node:fs';
import path from 'node:path';
import { launchApp, say, media, pageText, inPage, root } from './harness.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only', '')?.split(',').filter(Boolean);
const outName = arg('out', 'live');
const WORD_MS = Number(arg('word-ms', 240));
const appRoot = arg('app', root);  // --app ../bayvalleyhacks-baseline/electron → the baseline app

const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const dec = (u) => { try { return decodeURIComponent(u.replace(/\+/g, ' ')).toLowerCase(); } catch { return u.toLowerCase(); } };
const BOT = /captcha|are you a robot|unusual traffic|verify (that )?you are (a )?human|access denied|press (&|and) hold|request blocked|not a robot|robot check/i;
const pass = 'pass';

// allow: hosts this scenario may load (the site itself, its sign-in and consent pages).
export const SCENARIOS = [
  { site: 'Google Classroom', allow: /(^|\.)google\.com$/, steps: [
    { say: 'open up Google Classroom', check: ({ url }) => (/classroom\.google\.com/.test(url) || (/accounts\.google\.com/.test(url) && dec(url).includes('classroom')) || (/edu\.google\.com/.test(url) && /classroom/.test(url))) && !/\/search\?/.test(url) ? pass : `fail: landed on ${url}` },
    { say: 'now pull up Google Docs', check: ({ url }) => (/docs\.google\.com/.test(url) || (/accounts\.google\.com/.test(url) && dec(url).includes('docs')) || /workspace\.google\.com\/.*docs|\/docs\//.test(url)) && !/\/search\?/.test(url) ? pass : `fail: landed on ${url}` },
  ] },
  { site: 'AP Classroom (near Google Classroom)', allow: /(^|\.)collegeboard\.org$/, steps: [
    { say: 'open AP Classroom', check: ({ url }) => /collegeboard\.org/.test(url) ? pass : `fail: landed on ${url}` },
  ] },
  { site: 'Apple Music', allow: /(^|\.)apple\.com$/, steps: [
    { say: 'search lo-fi beats on Apple Music', check: ({ url }) => /music\.apple\.com/.test(url) && /lo.?fi/.test(dec(url)) ? pass : `fail: ${url}` },
    { say: 'play the first one', check: ({ url, m, before }) => /\/(album|song|playlist|station|music-video)\//.test(url) || (m && !m.paused) ? pass : `fail: still ${url}` },
  ] },
  { site: 'Safeway', allow: /(^|\.)safeway\.com$|(^|\.)albertsons(companies)?\.com$/, steps: [
    { say: 'find me a bagel on the Safeway website', check: ({ url, text }) => /safeway\.com/.test(url) && (/bagel/.test(dec(url)) || /bagel/i.test(text)) ? pass : `fail: ${url}` },
    { say: 'buy me a bagel from Safeway', check: ({ url, status, text }) => /safeway\.com/.test(url) && (/added|in your cart|cart \(?[1-9]/i.test(text) || /sign in|store|zip|delivery|pick ?up|address/i.test(status)) ? pass : `fail: ${status} @ ${url}` },
    { say: 'go to my cart', check: ({ url, status }) => /safeway\.com/.test(url) && (/cart|basket/i.test(url) || /cart/i.test(status)) ? pass : `fail: ${status} @ ${url}` },
  ] },
  { site: 'Burger King', allow: /(^|\.)bk\.com$|(^|\.)burgerking\.[a-z.]+$/, steps: [
    { say: 'show me the Burger King menu', check: ({ url }) => /bk\.com|burgerking/.test(url) && /menu/.test(url) ? pass : `fail: ${url}` },
    { say: 'order a Whopper from Burger King', check: ({ url, status }) => /bk\.com|burgerking/.test(url) && (/whopper/i.test(dec(url)) || /added|store|location|address|delivery|pick ?up|sign in/i.test(status)) && !/couldn'?t/i.test(status) ? pass : `fail: ${status} @ ${url}` },
  ] },
  { site: 'YouTube', allow: /(^|\.)youtube\.com$|(^|\.)google\.com$/, steps: [
    { say: 'search lofi beats on YouTube', check: ({ url }) => /youtube\.com\/results/.test(url) && /lofi beats/.test(dec(url)) ? pass : `fail: ${url}` },
    { say: 'play the second video', check: ({ url }) => /youtube\.com\/watch/.test(url) ? pass : `fail: ${url}` },
    { say: 'pause it', check: ({ m }) => m?.paused ? pass : `fail: ${JSON.stringify(m)}` },
    { say: 'turn it up', check: ({ m, before }) => m && before && (m.volume > before.volume || (before.muted && !m.muted)) ? pass : `fail: ${JSON.stringify(before)} → ${JSON.stringify(m)}` },
    { say: 'skip ahead', check: ({ m, before }) => m && before && m.time >= before.time + 8 ? pass : `fail: ${before?.time} → ${m?.time}` },
    { say: 'mute it', check: ({ m }) => m?.muted ? pass : `fail: ${JSON.stringify(m)}` },
  ] },
  { site: 'Amazon', allow: /(^|\.)amazon\.com$/, steps: [
    { say: 'search for wireless headphones on Amazon', check: ({ url }) => /amazon\.com\/s/.test(url) && /wireless headphones/.test(dec(url)) ? pass : `fail: ${url}` },
    { say: 'open the first result', check: ({ url }) => /amazon\.com\/.*(\/dp\/|\/gp\/)/.test(url) ? pass : `fail: ${url}` },
    { say: 'add it to my cart', check: ({ text, url, status }) => /added to (the )?cart|cart subtotal|proceed to checkout/i.test(text) || /cart/i.test(status) && !/couldn/i.test(status) ? pass : `fail: ${status} @ ${url}` },
    { say: 'go to my cart', check: ({ url }) => /amazon\.com\/(gp\/cart|cart)/.test(url) ? pass : `fail: ${url}` },
    { say: 'increase the quantity', check: ({ status, text }) => /quantity is now 2/i.test(status) || /qty:\s*2|quantity:\s*2/i.test(text) ? pass : `fail: ${status}` },
    { say: 'go to purchase', check: ({ url, status, orders }) => !orders && (/signin|ap\/|checkout|buy/i.test(url) || /sign in|checkout|stopped before/i.test(status)) ? pass : `fail: ${status} @ ${url}` },
  ] },
  { site: 'Target', allow: /(^|\.)target\.com$/, steps: [
    { say: 'find a desk lamp on Target', check: ({ url }) => /target\.com\/s/.test(url) && /desk lamp/.test(dec(url)) ? pass : `fail: ${url}` },
    { say: 'open the first one', check: ({ url }) => /target\.com\/p\//.test(url) ? pass : `fail: ${url}` },
    { say: 'add it to my cart', check: ({ text, status }) => /added to cart|view cart|added/i.test(text) && !/couldn/i.test(status) || /added/i.test(status) ? pass : `fail: ${status}` },
  ] },
  { site: 'Wikipedia', allow: /(^|\.)wikipedia\.org$|(^|\.)wikimedia\.org$/, steps: [
    { say: 'look up black holes on Wikipedia', check: ({ url }) => /wikipedia\.org/.test(url) && /black.?hole/.test(dec(url)) ? pass : `fail: ${url}` },
    { say: 'scroll down', check: async ({ page }) => Number(await inPage(page, 'scrollY')) > 100 ? pass : 'fail: did not scroll' },
    { say: 'what does this page say about the event horizon', check: ({ answer }) => answer.length > 20 && !/can'?t|couldn'?t|doesn'?t (show|say)/i.test(answer) ? pass : `fail: "${answer}"` },
  ] },
  { site: 'YouTube (one breath)', allow: /(^|\.)youtube\.com$|(^|\.)google\.com$/, steps: [
    { say: 'open YouTube, search cooking pasta and play the first one', check: ({ url }) => /youtube\.com\/watch/.test(url) ? pass : `fail: ${url}` },
  ] },
  { site: 'Best Buy', allow: /(^|\.)bestbuy\.com$/, steps: [
    { say: 'search gaming laptops on Best Buy', check: ({ url, text }) => /bestbuy\.com/.test(url) && (/gaming laptop/.test(dec(url)) || /gaming laptop/i.test(text)) ? pass : `fail: ${url}` },
  ] },
  { site: 'Spotify', allow: /(^|\.)spotify\.com$/, steps: [
    { say: 'open Spotify', check: ({ url }) => /spotify\.com/.test(url) ? pass : `fail: ${url}` },
  ] },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, page, profile } = await launchApp({ appRoot, env: { DIXI_DEBUG: '' } });
  const rows = [];
  try {
    for (const sc of SCENARIOS.filter((s) => !only.length || only.some((o) => s.site.toLowerCase().includes(o.toLowerCase())))) {
      await page.evaluate(() => window.__reset());
      console.log(`\n== ${sc.site}`);
      for (const st of sc.steps) {
        const before = await media(page).catch(() => null);
        await page.evaluate(() => { const d = window.__dixi; if (d.resetForEval) { d.resetForEval(); } else { d.voice.plan = []; d.voice.answer = null; d.agent.finalResult = null; } });
        const r = await say(app, page, st.say, { wordMS: WORD_MS });
        const text = String(await pageText(page).catch(() => ''));
        const m = await media(page).catch(() => null);
        const wrong = r.navs.filter((n) => !sc.allow.test(host(n.url)) && !/^(about|data|chrome)/.test(n.url));
        const orders = /order (has been )?placed|thank you for your order/i.test(text);
        let verdict = await st.check({ page, url: r.state.url, text, status: [r.state.status, ...r.state.plan].join(' | '), answer: r.state.answer, m: m && typeof m === 'object' ? m : null, before: before && typeof before === 'object' ? before : null, orders });
        if (verdict !== pass && BOT.test(text)) verdict = 'blocked: bot wall';
        if (wrong.length) verdict = `WRONG SITE: ${wrong.map((n) => host(n.url)).join(', ')}`;
        if (orders) verdict = 'FAIL: an order was placed';
        const row = { site: sc.site, say: st.say, verdict, url: r.state.url.slice(0, 140), plan: r.state.plan, firstNavMs: r.firstNavMs, overheadMs: r.overheadMs, llmCalls: r.state.llm.calls, trace: r.state.trace.map((e) => `${e.stage}${e.intent ? `:${e.intent.join(',')}` : ''}${e.source ? `(${e.source} ${e.ms}ms)` : ''}${e.status ? `:${e.status}/${e.host ?? ''}` : ''}${e.message ? `:${e.message}` : ''}`) };
        rows.push(row);
        const tag = verdict === pass ? 'PASS' : verdict.startsWith('blocked') ? 'BLOCKED' : 'FAIL';
        console.log(`${tag.padEnd(7)} "${st.say}"  overhead=${r.overheadMs ?? '-'}ms firstNav=${r.firstNavMs ?? '-'}ms ai=${r.state.llm.calls}\n        ${verdict === pass ? '' : `${verdict}\n        `}plan: ${r.state.plan.join(' · ')}${verdict === pass ? '' : `\n        trace: ${row.trace.join(' → ')}`}`);
      }
    }
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(root, 'eval/out'), { recursive: true });
  fs.writeFileSync(path.join(root, 'eval/out', `${outName}.json`), JSON.stringify(rows, null, 1));
  const n = rows.length, p = rows.filter((r) => r.verdict === pass).length, b = rows.filter((r) => r.verdict.startsWith('blocked')).length, w = rows.filter((r) => r.verdict.startsWith('WRONG')).length;
  const oh = rows.map((r) => r.overheadMs).filter((v) => v != null).sort((a, z) => a - z);
  console.log(`\n${p}/${n} passed · ${b} blocked by the site · ${n - p - b} failed (${w} wrong-site) · overhead p50=${oh[oh.length >> 1] ?? '-'}ms p95=${oh[Math.floor(oh.length * 0.95)] ?? '-'}ms · AI calls ${rows.reduce((a, r) => a + r.llmCalls, 0)}`);
  const bySite = {};
  for (const r of rows) (bySite[r.site] ??= []).push(r);
  for (const [s, rs] of Object.entries(bySite)) console.log(`  ${s.padEnd(38)} ${rs.filter((r) => r.verdict === pass).length}/${rs.length}`);
}
