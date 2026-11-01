// The Mac suite runner: each row is said to Dixi Everywhere as text (window.dixi.everywhere.run) on a second,
// muted Dixi with its own profile, then the real state of the Mac is polled until the row's check passes.
// ms = from run() to the verified end state. Hard stop per row (everywhere.stop()), spend guard on the ledger.
//
//   node qa/mac-run.js --baseline                 the known-failure rows + the simple single commands, once each
//   node qa/mac-run.js --rows music-search,volume-30
//   options: --timeout 30000  --max-usd 3  --app /path/to/electron (default: this worktree's electron/)
//
// Writes qa/results/mac-<stamp>.json. Never messages anyone: rows that would are 'blocked' until a test contact exists.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchMac, QA, APP, QA_CAP, qaSpent, qaRecord } from './app.js';
import { ROWS, mac } from './mac-suite.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TIMEOUT = Number(arg('timeout', 30000)), MAX_USD = Number(arg('max-usd', QA_CAP)), KEEP = process.argv.includes('--keep'), MESSAGING = process.argv.includes('--messaging');
// Sites a test may load (orchestrator safety rule). Anything else is flagged in the report.
const ALLOWED = /(^|\.)(apple\.com|youtube\.com|google\.com|wikipedia\.org|safeway\.com|amazon\.com|nytimes\.com|github\.com|ytimg\.com|googlevideo\.com|gstatic\.com)$/;
// Never let the screen agent type into these: a terminal or editor may hold an agent's prompt.
const UNSAFE_FRONT = /^(Terminal|iTerm2|Warp|Ghostty|Alacritty|kitty|WezTerm|Cursor|Code|Visual Studio Code|Zed|Electron|Claude)$/;
const pick = arg('rows', '').split(',').filter(Boolean);
const rows = process.argv.includes('--baseline') ? ROWS.filter((r) => r.known || ['open-calculator', 'quit-calculator', 'volume-30', 'open-downloads', 'open-youtube'].includes(r.id))
  : pick.length ? ROWS.filter((r) => pick.includes(r.id)) : ROWS;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const LEDGER = path.join(os.homedir(), 'Library/Application Support/Dixi/spend.json');
const spent = () => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')).totalUSD ?? 0; } catch { return 0; } };
// The founder's own Dixi shares the ledger: count what it did in our window (kinds only, never its text).
const FOUNDER_LOG = path.join(os.homedir(), 'Library/Application Support/Dixi/activity.jsonl');
const founderEvents = (t0, t1) => { try { return fs.readFileSync(FOUNDER_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.t >= t0 && e.t <= t1).length; } catch { return null; } };
const log = (...a) => console.log('[mac]', ...a);

const a = await launchMac({ DIXI_EVERYWHERE: '1', ELEVENLABS_API_KEY: ' ', DEEPGRAM_API_KEY: ' ' });
log(`test Dixi up in ${a.startMs} ms (profile ${a.profile})`);
// Own spend: every Spend.add in the test copy (the app's own pricing) is also counted here, so the shared
// ledger's other spenders (the founder's Dixi, other agents) never land in QA's numbers.
await a.main(async (_e, u) => { const { Spend } = await import(u); globalThis.__qaUSD = 0; const add = Spend.prototype.add; Spend.prototype.add = function (...x) { const usd = add.apply(this, x); globalThis.__qaUSD += usd; return usd; }; return true; }, pathToFileURL(path.join(APP, 'src/main/providers.js')).href);
const own = async () => Number(await a.main(() => globalThis.__qaUSD)) || 0;
const qa0 = qaSpent();
const m = mac({ osa: a.osa, main: a.main, inputURL: pathToFileURL(path.join(APP, 'src/main/input.js')).href, fs, path, os, crypto, execFile, sleep, dns, appDir: APP,
  said: () => a.ui(() => window.__said.map((x) => x.text)), navs: () => a.main(() => globalThis.__navs.map((n) => n.url)) });
// The test copy's own hidden browser: every top-level load, for the URL report.
await a.main(({ session }) => { globalThis.__navs = []; session.fromPartition('persist:dixi-tabs').webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => { if (d.resourceType === 'mainFrame') globalThis.__navs.push({ t: Date.now(), url: d.url }); cb({}); }); return true; });
// A scratch TextEdit document in front before every row: stray typing lands there, never in a terminal.
const teDocs0 = JSON.parse((await m.osa("const te = Application('TextEdit'); JSON.stringify(te.running() ? te.documents().map((d) => d.name()) : [])")) || '[]');
const neutral = async () => { await m.osa("const te = Application('TextEdit'); te.activate(); if (!te.documents().some((d) => { try { return !d.path() && d.text() === ''; } catch (e) { return false; } })) te.documents.push(te.Document({ text: '' })); 'ok'"); await sleep(600); };
const firstFront = await m.front();
const testLog = () => { try { return fs.readFileSync(path.join(a.profile, 'activity.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const APPS = ['Music', 'Notes', 'Calendar', 'Calculator', 'Messages', 'Contacts', 'TextEdit', await m.browser()];
const teWasRunning = await m.running('TextEdit');

const out = { at: new Date().toISOString(), app: APP, timeout: TIMEOUT, ledgerStart: spent(), rows: [], urls: [] };
const tRun0 = Date.now();
try {
  for (const r of rows) {
    const block = (why, say = r.say) => { out.rows.push({ id: r.id, kind: r.kind, known: Boolean(r.known), say: typeof say === 'function' ? '(set at run time)' : say, status: 'blocked', why }); log(`blocked  ${r.id}  (${why})`); };
    if (r.blocked) { block(r.blocked); continue; }
    if (r.messaging && !MESSAGING) { block('messaging rows run only with --messaging'); continue; }
    if (qa0 + (await own()) >= MAX_USD) { log(`spend guard: QA total at $${MAX_USD}, stopping`); out.stoppedForSpend = true; break; }
    // Snapshot what this row may change, so it can be put back.
    const snap = { vol: await m.volume(), muted: await m.muted(), front: await m.front(), tabs: await m.tabIds(), finder: await m.finderWindows(), music: (await m.music()).state,
      running: Object.fromEntries(await Promise.all(APPS.map(async (n) => [n, await m.running(n)]))) };
    await neutral();
    const s = { ...((await r.setup?.(m)) ?? {}) };
    if (s.blocked) { block(s.blocked); try { await r.cleanup?.(m, s); } catch {} continue; }
    const say = typeof r.say === 'function' ? r.say(s) : r.say;
    const frontNow = await m.front();
    if (UNSAFE_FRONT.test(frontNow)) { block(`unsafe app in front: ${frontNow}`, say); continue; }
    const tabsBefore = await m.tabURLs(), navN = (await a.main(() => globalThis.__navs.length));
    s.tabs0 = tabsBefore;
    const usd0 = await own(), logN = testLog().length;
    await a.ui(() => { window.__said.length = 0; window.__asked.length = 0; window.__runDone = 0; window.__runErr = ''; return true; });
    const t0 = Date.now(); s.t0 = t0;
    await a.ui((text) => { window.dixi.everywhere.run(text).then(() => { window.__runDone = Date.now(); }, (e) => { window.__runErr = String(e?.message ?? e); window.__runDone = Date.now(); }); return true; }, say);
    let verified = null, last = { ok: false, got: '' };
    while (Date.now() - t0 < TIMEOUT) {
      const tc = Date.now();
      try { last = await r.check(m, s); } catch (err) { last = { ok: false, got: `check threw ${err.message}` }; }
      if (last.ok) { verified = Date.now() - t0; break; }   // when the check came back: an upper bound
      if (await a.ui(() => window.__runDone)) { await sleep(1500); try { last = await r.check(m, s); } catch {} if (last.ok) verified = Date.now() - t0; break; }   // run() ended: one last look
      await sleep(400);
    }
    // Don't let a finished check overlap the next row: wait for run() to end, up to the hard stop.
    while (!(await a.ui(() => window.__runDone)) && Date.now() - t0 < TIMEOUT) await sleep(300);
    const runDone = await a.ui(() => window.__runDone);
    const stopped = !runDone;
    if (stopped) { await a.ui(() => { window.dixi.everywhere.stop(); return true; }); await sleep(800); }
    const heard = await a.ui(() => ({ said: window.__said.map((x) => x.text), asked: window.__asked.map((x) => x.q), err: window.__runErr }));
    const acts = testLog().slice(logN);
    // Every URL this row loaded: new or changed browser tabs, and the test copy's own browser.
    const tabsAfter = await m.tabURLs();
    const loaded = [...new Set([...Object.entries(tabsAfter).filter(([id, u]) => tabsBefore[id] !== u).map(([, u]) => u), ...(await a.main(() => globalThis.__navs.map((n) => n.url))).slice(navN)])].filter((u) => /^https?:/.test(u));
    for (const u of loaded) out.urls.push({ row: r.id, url: u, allowed: ALLOWED.test(host(u)) });
    const row = {
      id: r.id, kind: r.kind, known: Boolean(r.known), say, label: r.label, note: r.note,
      status: verified != null ? 'pass' : 'fail', ms: verified ?? (Date.now() - t0), runMs: runDone ? runDone - t0 : null, hardStopped: stopped,
      got: last.got, said: heard.said, asked: heard.asked, runError: heard.err || undefined,
      steps: acts.filter((e) => e.kind === 'step').map((e) => [e.verb, e.role, e.label, e.model, e.ms].filter((x) => x != null).join(' ')).slice(0, 30),
      usd: Number(((await own()) - usd0).toFixed(4)), errs: a.errs.splice(0).slice(0, 8), loaded,
    };
    out.rows.push(row);
    log(`${row.status.padEnd(7)} ${String(row.ms).padStart(6)} ms  $${row.usd.toFixed(3)}  ${say}${row.status === 'pass' ? '' : `  → ${row.got}`}${stopped ? '  [hard stop]' : ''}`);
    // Put the Mac back.
    try { row.restored = await r.cleanup?.(m, s); } catch (err) { row.cleanupError = err.message; }
    try {
      await m.setVolume(snap.vol);
      if ((await m.muted()) !== snap.muted) await m.setMuted(snap.muted);
      await m.closeTabsExcept(snap.tabs);
      await m.closeFinderExcept(snap.finder);
      if (snap.music !== 'playing' && (await m.music()).state === 'playing') await m.osa("Application('Music').pause()");
      for (const [n, was] of Object.entries(snap.running)) if (!was && n !== 'Finder' && (await m.running(n))) await m.quit(n);
    } catch (err) { row.restoreError = err.message; }
    await sleep(1000);
  }
} finally {
  await m.osa(`const te = Application('TextEdit'); const keep = ${JSON.stringify(teDocs0)}; if (te.running()) for (const d of te.documents()) { try { if (!keep.includes(d.name()) && !d.path()) d.close({ saving: 'no' }); } catch (e) {} } 'ok'`).catch(() => {});   // only docs this run made
  if (!teWasRunning) await m.quit('TextEdit').catch(() => {});
  if (firstFront) await m.activate(firstFront).catch(() => {});   // the user's own front app, as found
  out.ledgerEnd = spent();
  out.usd = await own().catch(() => 0);
  out.qaTotalUSD = qaRecord(`mac-run ${out.at}`, out.usd);
  out.founderEvents = founderEvents(tRun0, Date.now());
  if (KEEP) { a.close = async () => { a.child.kill(); }; log(`kept profile ${a.profile}`); }
  await a.close();
}
const ran = out.rows.filter((r) => r.status !== 'blocked');
const simple = ran.filter((r) => r.kind === 'simple').map((r) => r.ms);
out.flaggedURLs = out.urls.filter((u) => !u.allowed);
out.summary = {
  ran: ran.length, blocked: out.rows.length - ran.length, pass: ran.filter((r) => r.status === 'pass').length,
  passRate: ran.length ? ran.filter((r) => r.status === 'pass').length / ran.length : null,
  avgMs: ran.length ? Math.round(ran.reduce((s, r) => s + r.ms, 0) / ran.length) : null, slowest: ran.reduce((b, r) => (r.ms > (b?.ms ?? -1) ? r : b), null)?.id,
  flaggedURLs: out.flaggedURLs.length, simpleP50: pct(simple, 50), simpleP90: pct(simple, 90), usd: Number(out.usd.toFixed(4)), qaTotalUSD: out.qaTotalUSD, sharedLedgerDelta: Number((out.ledgerEnd - out.ledgerStart).toFixed(4)), founderEventsDuringRun: out.founderEvents,
};
// The done bar (orchestrator): >= 95% pass and simple commands <= 2 s (p95), on two runs in a row of the same rows.
out.summary.simpleP95 = pct(simple, 95);
out.summary.meetsBar = out.summary.passRate >= 0.95 && (out.summary.simpleP95 ?? Infinity) <= 2000 && !out.stoppedForSpend;
const sameRows = (o) => JSON.stringify(o.rows.map((x) => x.id)) === JSON.stringify(out.rows.map((x) => x.id));
const prev = fs.readdirSync(path.join(QA, 'results')).filter((f) => /^mac-.*\.json$/.test(f)).sort().map((f) => { try { return JSON.parse(fs.readFileSync(path.join(QA, 'results', f), 'utf8')); } catch { return null; } }).filter((o) => o?.summary && sameRows(o)).at(-1);
out.summary.barTwiceInARow = out.summary.meetsBar && Boolean(prev?.summary?.meetsBar);
fs.mkdirSync(path.join(QA, 'results'), { recursive: true });
const file = path.join(QA, 'results', `mac-${out.at.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
log(JSON.stringify(out.summary));
log(`→ ${file}`);
