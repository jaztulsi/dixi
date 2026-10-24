// Runs corpus cases through the REAL Electron app against the fixture web and scores them.
//
//   node eval/run.js --seed 7 [--split dev|heldout|all] [--sample 3] [--mode text|oracle|oracle-url]
//                    [--workers 2] [--cases d1,h5] [--out name]
//
// Modes (stage attribution, spec Phase 2B):
//   text        gold transcript fed word by word as Flux TurnInfo updates (bypasses only speech recognition)
//   oracle      gold structured intent fed straight to the executor (bypasses interpretation)
//   oracle-url  oracle + the target's real home URL (bypasses interpretation AND resolution)
// The app reaches only the fixture server: Chromium's host-resolver-rules map every host to it, so a
// wrong site shows up as an event for the wrong brand or an "escape" to an unknown host.

import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';
import { generate } from './gen.js';
import { scoreCase, summarize } from './score.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('seed', 7));
const mode = arg('mode', 'text');
const split = arg('split', 'all');
const workers = Number(arg('workers', 1));
const sample = Number(arg('sample', 0));
const only = arg('cases', '')?.split(',').filter(Boolean);
const outName = arg('out', `${mode}-${split}-s${seed}`);
const appRoot = path.resolve(arg('app', root));  // --app ../app-baseline/electron runs the baseline code
const WORD_MS = Number(arg('word-ms', 240));
const IDLE_MS = 1500, CASE_TIMEOUT_MS = Number(arg('timeout', 25000));

const { cases: all, world } = generate(seed);
let cases = all.filter((c) => split === 'all' || c.split === split);
if (only.length) cases = cases.filter((c) => only.includes(c.id));
if (sample) {  // stratified: `sample` per category
  const by = {};
  for (const c of cases) (by[c.cat] ??= []).push(c);
  cases = Object.values(by).flatMap((list) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / sample)) === 0).slice(0, sample));
}

const server = await startServer({ world });
const brandById = Object.fromEntries(world.brands.map((b) => [b.id, b]));
console.log(`fixture web on :${server.port} · ${cases.length} cases · mode=${mode} · workers=${workers}`);

// Editors that embed Electron export ELECTRON_RUN_AS_NODE=1, which turns the app into plain Node.
function appEnv() {
  const env = { ...process.env, DIXI_EVAL: '1', DIXI_SEARCH_URL: 'https://search.fixture-web.net/search?q={q}' };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function launch(w) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `dixi-eval-${w}-`));
  const app = await electron.launch({
    args: [appRoot, `--user-data-dir=${profile}`, `--host-resolver-rules=MAP * 127.0.0.1:${server.port}, EXCLUDE localhost`, '--ignore-certificate-errors'],
    cwd: appRoot, env: appEnv(),
  });
  await app.evaluate(({ session }) => {
    globalThis.__case = '';
    session.fromPartition('persist:dixi-tabs').webRequest.onBeforeSendHeaders((d, cb) => { cb({ requestHeaders: { ...d.requestHeaders, 'x-dixi-case': globalThis.__case } }); });
  });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error' && process.env.VERBOSE) console.log(`   [w${w}]`, m.text().slice(0, 200)); });
  await page.waitForFunction(() => window.__dixi);
  await page.evaluate(async () => {
    const { voice, llm, tabs, agent, settings } = window.__dixi;
    await voice.stop?.();
    if (settings) settings.requireWakeWord = false;
    window.__llm = { calls: 0, tokens: 0 };
    const transport = llm.transport;
    llm.transport = async (body) => { window.__llm.calls++; const r = await transport(body); window.__llm.tokens += r?.json?.usage?.total_tokens ?? 0; return r; };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__busy = () => (window.__dixi.busy ? window.__dixi.busy() : (voice.pending > 0 || agent.isRunning || tabs.isLoading()));
    window.__reset = async () => {
      (voice.cancelAll ?? (() => {})).call(voice);
      if (agent.isRunning) agent.stop();
      for (let i = 0; i < 50 && window.__busy(); i++) await sleep(100);
      voice.resetDispatchState?.();
      Object.assign(voice, { plan: [], answer: null, lastNavigatedSite: null, navigating: Promise.resolve(), statusLine: '' });
      if (voice.session) voice.session.history = [];
      window.__dixi.resetForEval?.();
      for (const t of [...tabs.tabs]) tabs.closeTab(t.id);
      tabs.createTab('about:blank');
      window.__llm = { calls: 0, tokens: 0 };
    };
    // Flux-style: the whole turn so far ~4x a second, then early and final end of turn.
    window.__say = async (text, wordMS) => {
      voice.awakeUntil = Date.now() + 1e9;
      const send = (event, transcript, i) => voice.handleMessage(JSON.stringify({ type: 'TurnInfo', event, turn_index: window.__turn, transcript, audio_window_start: 0, audio_window_end: i }));
      window.__turn = (window.__turn ?? 0) + 1;
      const words = text.split(' ');
      send('StartOfTurn', '', 0);
      for (let i = 1; i <= words.length; i++) { send('Update', words.slice(0, i).join(' '), i); if (i < words.length) await sleep(wordMS); }
      const end = Date.now();
      const final = text[0].toUpperCase() + text.slice(1) + (/[.?!]$/.test(text) ? '' : /^(who|what|how|when|where|why|is|are|does|do|can)\b/i.test(text) ? '?' : '.');
      await sleep(200); send('EagerEndOfTurn', final, words.length);
      await sleep(200); send('EndOfTurn', final, words.length);
      return end;
    };
  });
  return { app, page, profile };
}

// Old executor (baseline) has no execute(); map gold steps onto its own step types so the oracle run
// exercises the baseline executor + its own resolution, not a new one.
async function runOracle(page, c, withURL) {
  const urlOf = (said) => { const b = world.brands.find((x) => x.name.toLowerCase() === said.toLowerCase()); return b ? `https://${b.host}/` : null; };
  const urls = Object.fromEntries(c.gold.steps.filter((s) => s.said).map((s) => [s.said, withURL ? urlOf(s.said) : null]));
  return page.evaluate(async ({ gold, urls, text }) => {
    const d = window.__dixi;
    if (d.execute) return d.execute(gold, { urls, said: text });
    const { voice } = d;
    const { homeURL } = await import('./core/tasks.js');
    const MEDIA = { pause: 'pause', mute: 'mute', louder: 'volume up', faster: 'faster', slower: 'slower', forward: 'skip ahead', rewind: 'rewind', restart: 'restart', next: 'next video', captions: 'captions', skip_ad: 'skip the ad' };
    const home = (said) => urls[said] ?? homeURL(said) ?? said;
    const plan = [];
    for (const s of gold.steps) {
      if (s.act === 'open') plan.push({ do: 'open', url: home(s.said), label: `Opening ${s.said}` });
      else if (s.act === 'search' || s.act === 'find_item') {
        if (s.said) plan.push({ do: 'open', url: home(s.said), label: `Opening ${s.said}` });
        plan.push({ do: 'command', text: `search for ${s.query ?? s.item}`, label: 'Searching' });
      } else if (s.act === 'order') {
        if (s.said) plan.push({ do: 'open', url: home(s.said), label: `Opening ${s.said}` });
        plan.push({ do: 'command', text: `find ${s.item} on the menu`, label: `Finding ${s.item}` }, { do: 'command', text: 'add it to the order', label: 'Adding' });
      } else if (s.act === 'nth') plan.push({ do: 'command', text: s.n < 0 ? 'play the last video' : `play video number ${s.n}`, label: 'Playing' });
      else if (s.act === 'media') plan.push({ do: 'command', text: MEDIA[s.value] ?? s.value, label: s.value });
      else if (s.act === 'add_to_cart') plan.push({ do: 'command', text: 'add it to cart', label: 'Adding to cart' });
      else if (s.act === 'checkout') plan.push({ do: 'command', text: s.value === 'place_order' ? 'click place order' : 'click the buy now button', label: 'Buying' });
      else if (s.act === 'scroll') plan.push({ do: 'command', text: 'scroll down', label: 'Scrolling' });
      else if (s.act === 'ask_page') plan.push({ do: 'ask', question: text, label: 'Answering' });
      else if (s.act === 'ask_web') plan.push({ do: 'search', url: `https://www.google.com/search?q=${encodeURIComponent(text)}`, label: 'Web' });
      else if (s.act === 'stop') voice.cancelAll();
    }
    if (plan.length) voice.runPlan(text, plan);
    return null;
  }, { gold: c.gold, urls, text: c.text });
}

// Agent overhead: end of turn (EndOfTurn event) → first step issued, from the app's own trace clock.
function overhead(trace, tEnd) { return null; }

async function runCase(w, c) {
  const { app, page } = w;
  await page.evaluate(() => window.__reset());
  await app.evaluate((_, id) => { globalThis.__case = id; }, c.id);
  const startBrand = c.start?.split('/')[0];
  if (c.start) {
    const b = brandById[startBrand];
    const p = c.start.slice(startBrand.length) || '/';
    await page.evaluate(async (u) => { await window.__dixi.tabs.navigate(u); }, `https://${b.host}${p}`);
    await page.waitForTimeout(400);
  }
  const tStart = Date.now();
  let tSpeechEnd;
  if (mode === 'text') tSpeechEnd = await page.evaluate(({ text, ms }) => window.__say(text, ms), { text: c.text, ms: WORD_MS });
  else { tSpeechEnd = Date.now(); await runOracle(page, c, mode === 'oracle-url'); }
  // Wait until the app has been idle for a while (or time out).
  let idleSince = null;
  const deadline = Date.now() + CASE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => window.__busy());
    if (busy) idleSince = null; else if (!idleSince) idleSince = Date.now(); else if (Date.now() - idleSince > IDLE_MS) break;
    await page.waitForTimeout(150);
  }
  const app_ = await page.evaluate(() => {
    const { voice, agent, tabs } = window.__dixi;
    const labels = (voice.plan ?? []).map((p) => p.label);
    return {
      status: [voice.statusLine, ...labels, agent.finalResult ?? ''].join(' | '), answer: voice.answer?.text ?? '',
      clarify: voice.clarify?.question ?? null, confirm: voice.confirm?.question ?? window.__dixi.pendingConfirm?.() ?? null,
      planDuplicates: new Set(labels).size !== labels.length, url: tabs.getCurrentURL(), llm: window.__llm, timedOut: window.__busy(),
      trace: (window.__dixi.traces ?? []).filter((e) => ['interpret', 'resolve', 'step_end', 'eot'].includes(e.stage)).map((e) => e.stage === 'interpret' ? { s: 'interpret', src: e.source, ms: e.ms, steps: (e.intent?.steps ?? []).map((x) => [x.act, x.said, x.guess, x.query || x.item || x.value || x.n].filter(Boolean).join('/')), err: e.errors } : e.stage === 'resolve' ? { s: 'resolve', said: e.said, guess: e.guess, st: e.status, host: e.host, src: e.source, ms: e.ms } : { s: e.stage, ok: e.ok, m: e.message?.slice?.(0, 60) }),
    };
  });
  const events = await (await fetch(`http://localhost:${server.port}/__log?case=${c.id}`)).json();
  const s = scoreCase({ ...c, tStart, tSpeechEnd, startBrand }, events, world, app_);
  return { id: c.id, split: c.split, cat: c.cat, text: c.text, ...s, llmCalls: app_.llm.calls, llmTokens: app_.llm.tokens, timedOut: app_.timedOut, status: app_.status.slice(0, 300), url: app_.url.slice(0, 120), trace: app_.trace, overheadMs: overhead(app_.trace, tSpeechEnd) };
}

const rows = [];
const queue = [...cases];
const pool = await Promise.all(Array.from({ length: workers }, (_, i) => launch(i)));
await Promise.all(pool.map(async (w) => {
  for (let c = queue.shift(); c; c = queue.shift()) {
    let r;
    try { r = await runCase(w, c); } catch (err) { r = { id: c.id, split: c.split, cat: c.cat, text: c.text, pass: false, error: String(err).slice(0, 200) }; }
    rows.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id.padEnd(5)} ${(r.firstActionMs ?? '-').toString().padStart(6)}ms ai=${r.llmCalls ?? '-'} ${r.wrongSite ? 'WRONG-SITE ' : ''}${r.contamination ? 'CONTAM ' : ''}${r.dup ? 'DUP ' : ''}${r.cat.padEnd(28)} "${r.text}"${r.pass ? '' : `\n        checks=${JSON.stringify(r.checks ?? {})} ${r.wrongDetail?.length ? `wrong=${r.wrongDetail.join(',')}` : ''} url=${r.url ?? ''}\n        status=${r.status ?? r.error}\n        trace=${JSON.stringify(r.trace ?? []).slice(0, 600)}`}`);
  }
}));
await Promise.all(pool.map((w) => w.app.close().catch(() => {})));
await server.close();
for (const w of pool) fs.rmSync(w.profile, { recursive: true, force: true });

const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${outName}.json`), JSON.stringify(rows, null, 1));
const fmt = (m) => `n=${m.n} success=${m.success.toFixed(1)}% [${m.ci.map((v) => v.toFixed(0)).join('-')}] wrongSite=${m.wrongSite.toFixed(1)}% contamination=${m.contamination.toFixed(1)}% duplicate=${m.duplicate.toFixed(1)}% firstAction p50=${m.firstActionP50}ms p95=${m.firstActionP95}ms llmCalls/task=${m.llmCallsPerTask.toFixed(2)}`;
console.log(`\n== ${outName}`);
for (const sp of ['dev', 'heldout']) { const sub = rows.filter((r) => r.split === sp); if (sub.length) console.log(`${sp.padEnd(8)} ${fmt(summarize(sub))}`); }
console.log(`${'all'.padEnd(8)} ${fmt(summarize(rows))}`);
const cats = {};
for (const r of rows) (cats[r.cat] ??= []).push(r);
console.log('per category:', Object.entries(cats).map(([k, v]) => `${k}=${v.filter((r) => r.pass).length}/${v.length}`).join(' '));
