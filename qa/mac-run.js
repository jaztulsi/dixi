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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchMac, QA, APP } from './app.js';
import { ROWS, mac } from './mac-suite.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TIMEOUT = Number(arg('timeout', 30000)), MAX_USD = Number(arg('max-usd', 3));
const pick = arg('rows', '').split(',').filter(Boolean);
const rows = process.argv.includes('--baseline') ? ROWS.filter((r) => r.known || ['open-calculator', 'quit-calculator', 'volume-30', 'open-downloads', 'open-youtube'].includes(r.id))
  : pick.length ? ROWS.filter((r) => pick.includes(r.id)) : ROWS;
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
const m = mac({ osa: a.osa, main: a.main, inputURL: pathToFileURL(path.join(APP, 'src/main/input.js')).href, fs, path, os, crypto, execFile, sleep });
const testLog = () => { try { return fs.readFileSync(path.join(a.profile, 'activity.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const APPS = ['Music', 'Notes', 'Calendar', 'Calculator', 'Messages', await m.browser()];

const out = { at: new Date().toISOString(), app: APP, timeout: TIMEOUT, ledgerStart: spent(), rows: [] };
const tRun0 = Date.now();
try {
  for (const r of rows) {
    if (r.blocked) { out.rows.push({ id: r.id, kind: r.kind, known: Boolean(r.known), say: r.say, status: 'blocked', why: r.blocked }); log(`blocked  ${r.say}  (${r.blocked})`); continue; }
    if (spent() - out.ledgerStart > MAX_USD) { log(`spend guard: over $${MAX_USD}, stopping`); out.stoppedForSpend = true; break; }
    // Snapshot what this row may change, so it can be put back.
    const snap = { vol: await m.volume(), front: await m.front(), tabs: await m.tabIds(), finder: await m.finderWindows(), music: (await m.music()).state,
      running: Object.fromEntries(await Promise.all(APPS.map(async (n) => [n, await m.running(n)]))) };
    const s = { ...((await r.setup?.(m)) ?? {}) };
    const usd0 = spent(), logN = testLog().length;
    await a.ui(() => { window.__said.length = 0; window.__asked.length = 0; window.__runDone = 0; window.__runErr = ''; return true; });
    const t0 = Date.now(); s.t0 = t0;
    await a.ui((text) => { window.dixi.everywhere.run(text).then(() => { window.__runDone = Date.now(); }, (e) => { window.__runErr = String(e?.message ?? e); window.__runDone = Date.now(); }); return true; }, r.say);
    let verified = null, last = { ok: false, got: '' };
    while (Date.now() - t0 < TIMEOUT) {
      const tc = Date.now();
      try { last = await r.check(m, s); } catch (err) { last = { ok: false, got: `check threw ${err.message}` }; }
      if (last.ok) { verified = tc - t0; break; }
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
    const row = {
      id: r.id, kind: r.kind, known: Boolean(r.known), say: r.say, label: r.label, note: r.note,
      status: verified != null ? 'pass' : 'fail', ms: verified ?? (Date.now() - t0), runMs: runDone ? runDone - t0 : null, hardStopped: stopped,
      got: last.got, said: heard.said, asked: heard.asked, runError: heard.err || undefined,
      steps: acts.filter((e) => e.kind === 'step').map((e) => [e.verb, e.role, e.label, e.model, e.ms].filter((x) => x != null).join(' ')).slice(0, 30),
      usd: Number((spent() - usd0).toFixed(4)), errs: a.errs.splice(0).slice(0, 8),
    };
    out.rows.push(row);
    log(`${row.status.padEnd(7)} ${String(row.ms).padStart(6)} ms  $${row.usd.toFixed(3)}  ${r.say}${row.status === 'pass' ? '' : `  → ${row.got}`}${stopped ? '  [hard stop]' : ''}`);
    // Put the Mac back.
    try { row.restored = await r.cleanup?.(m, s); } catch (err) { row.cleanupError = err.message; }
    try {
      await m.setVolume(snap.vol);
      await m.closeTabsExcept(snap.tabs);
      await m.closeFinderExcept(snap.finder);
      if (snap.music !== 'playing' && (await m.music()).state === 'playing') await m.osa("Application('Music').pause()");
      for (const [n, was] of Object.entries(snap.running)) if (!was && n !== 'Finder' && (await m.running(n))) await m.quit(n);
      if (snap.front && snap.front !== (await m.front())) await m.activate(snap.front).catch(() => {});
    } catch (err) { row.restoreError = err.message; }
    await sleep(1000);
  }
} finally {
  out.ledgerEnd = spent();
  out.founderEvents = founderEvents(tRun0, Date.now());
  await a.close();
}
const ran = out.rows.filter((r) => r.status !== 'blocked');
const simple = ran.filter((r) => r.kind === 'simple').map((r) => r.ms);
out.summary = {
  ran: ran.length, blocked: out.rows.length - ran.length, pass: ran.filter((r) => r.status === 'pass').length,
  passRate: ran.length ? ran.filter((r) => r.status === 'pass').length / ran.length : null,
  avgMs: ran.length ? Math.round(ran.reduce((s, r) => s + r.ms, 0) / ran.length) : null, slowest: ran.reduce((b, r) => (r.ms > (b?.ms ?? -1) ? r : b), null)?.id,
  simpleP50: pct(simple, 50), simpleP90: pct(simple, 90), usd: Number((out.ledgerEnd - out.ledgerStart).toFixed(4)), founderEventsDuringRun: out.founderEvents,
};
fs.mkdirSync(path.join(QA, 'results'), { recursive: true });
const file = path.join(QA, 'results', `mac-${out.at.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
log(JSON.stringify(out.summary));
log(`→ ${file}`);
