// npm run qa: every QA stage against the real code on this Mac, results to qa/results/<stamp>.json
// (and latest.json), then the dashboards (qa/dashboard.html).
//
//   node qa/run.js                          everything, live stages included (real app, real sites, real APIs)
//   node qa/run.js --only unit,static       just those stages
//   node qa/run.js --skip live              the offline stages only (unit, gate, static, secrets)
//   node qa/run.js --repeat 3               unit suite repeats, for flake detection (default 3)
//
// Stages: unit · gate · static · secrets · idle · retrieval* · commands* · failures* · e2e*   (* = live)
// The app runs with its own throwaway profile and DIXI_EVERYWHERE=0, so the founder's running Dixi is untouched.
// Spoken replies are muted in the test app (set QA_AUDIBLE=1 to hear them).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, FAILURES, DOCS, QUESTIONS, FEATURE_OF_FILE } from './suite.js';
import { launch as launchApp } from './app.js';

const launch = (env) => launchApp(env, { onCrash: (text) => { run.crashes++; run.errors.push({ type: 'crash', text }); } });

const QA = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(QA, '..');
const APP = path.join(REPO, 'electron');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const LIVE = ['retrieval', 'commands', 'failures', 'e2e'];
const ALL = ['unit', 'gate', 'static', 'secrets', 'idle', ...LIVE];
const only = arg('only', '').split(',').filter(Boolean);
const skip = arg('skip', '').split(',').filter(Boolean).flatMap((s) => (s === 'live' ? LIVE : [s]));
const stages = (only.length ? only : ALL).filter((s) => !skip.includes(s));
const REPEAT = Number(arg('repeat', 3));
const BUDGET_MS = 2000;

const sh = (cmd, args, opts = {}) => new Promise((res) => execFile(cmd, args, { maxBuffer: 256e6, ...opts }, (err, out, errOut) => res({ code: err ? err.code ?? 1 : 0, out: String(out), err: String(errOut) })));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const log = (...a) => console.log('[qa]', ...a);

const run = { at: new Date().toISOString(), stages: {}, tests: [], latency: [], checks: [], retrieval: null, errors: [], crashes: 0 };
const test = (stage, id, feature, status, extra = {}) => run.tests.push({ stage, id, feature, status, ...extra });
const check = (id, area, status, detail) => { run.checks.push({ id, area, status, detail }); test('static', id, area, status, { error: status === 'pass' ? undefined : detail }); };

// ---------------------------------------------------------------- unit: node --test, repeated to catch flakes
async function unit() {
  const seen = {};
  for (let i = 0; i < REPEAT; i++) {
    const r = await sh('node', ['--test', '--test-reporter=tap', ...fs.readdirSync(path.join(APP, 'test/unit')).filter((f) => f.endsWith('.test.js')).map((f) => `test/unit/${f}`)], { cwd: APP });
    const lines = r.out.split('\n');
    for (let j = 0; j < lines.length; j++) {
      const m = lines[j].match(/^(not ok|ok) \d+ - (.*)$/);   // top level only (subtests are indented)
      if (!m) continue;
      let loc = '', ms = 0, err = '';
      for (let k = j + 1; k < Math.min(lines.length, j + 40) && !/^(not )?ok \d/.test(lines[k]); k++) {
        loc ||= lines[k].match(/location: '(.*?)'/)?.[1] ?? '';
        ms ||= Number(lines[k].match(/duration_ms: ([\d.]+)/)?.[1] ?? 0);
        if (m[1] === 'not ok' && !err && /^\s+error: /.test(lines[k])) err = lines.slice(k, k + 6).join(' ').replace(/\s+/g, ' ').slice(0, 300);
      }
      const file = path.basename(loc.split(':')[0] || '', '.test.js');
      const t = (seen[m[2]] ??= { file, loc: loc.replace(/^.*electron\//, 'electron/'), pass: 0, fail: 0, ms: [], err: '' });
      t[m[1] === 'ok' ? 'pass' : 'fail']++; t.ms.push(ms); if (err) t.err = err;
    }
  }
  for (const [name, t] of Object.entries(seen)) {
    const status = t.fail === 0 ? 'pass' : t.pass === 0 ? 'fail' : 'flaky';
    test('unit', name, FEATURE_OF_FILE[t.file] ?? t.file, status, { ms: Math.round(Math.max(...t.ms)), runs: t.pass + t.fail, fails: t.fail, loc: t.loc, error: t.err || undefined });
  }
  const n = Object.keys(seen).length;
  return { summary: `${n} tests × ${REPEAT} runs`, status: run.tests.some((t) => t.stage === 'unit' && t.status !== 'pass') ? 'fail' : 'pass' };
}

// ---------------------------------------------------------------- playwright specs (gate: no keys; e2e: live app)
async function playwright(spec, stage) {
  const r = await sh('npx', ['playwright', 'test', spec, '--reporter=json'], { cwd: APP, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
  let j; try { j = JSON.parse(r.out); } catch { return { status: 'error', summary: r.err.slice(0, 400) || r.out.slice(0, 400) }; }
  const walk = (s) => [...(s.specs ?? []), ...(s.suites ?? []).flatMap(walk)];
  for (const sp of (j.suites ?? []).flatMap(walk)) for (const t of sp.tests) {
    const last = t.results.at(-1) ?? {};
    const status = { passed: 'pass', failed: 'fail', timedOut: 'fail', skipped: 'skip', interrupted: 'fail' }[last.status] ?? last.status;
    test(stage, sp.title, stage === 'gate' ? 'guardian' : 'browser-voice', t.results.length > 1 && status === 'pass' ? 'flaky' : status,
      { ms: last.duration, error: last.error?.message?.replace(/\u001b\[\d+m/g, '').slice(0, 300) });
  }
  return { status: r.code === 0 ? 'pass' : 'fail', summary: `${j.stats?.expected ?? 0} passed, ${j.stats?.unexpected ?? 0} failed, ${j.stats?.flaky ?? 0} flaky` };
}

// ---------------------------------------------------------------- static: Electron settings + production checklist
async function staticChecks() {
  const src = (dir) => fs.readdirSync(path.join(APP, dir), { recursive: true }).filter((f) => /\.(m?js|cjs)$/.test(f)).map((f) => ({ f: `${dir}/${f}`, s: fs.readFileSync(path.join(APP, dir, f), 'utf8') }));
  const files = [...src('src'), ...src('bin')];
  const all = files.map((x) => x.s).join('\n');
  const where = (re) => files.flatMap(({ f, s }) => s.split('\n').flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}`] : [])));

  // Every window: context isolation and sandbox on, node integration off.
  const wins = files.flatMap(({ f, s }) => [...s.matchAll(/new BrowserWindow\(\{/g)].map((m) => ({ at: `${f}:${s.slice(0, m.index).split('\n').length}`, body: s.slice(m.index, m.index + 900) })));
  const weak = wins.filter((w) => !/contextIsolation:\s*true/.test(w.body) || !/sandbox:\s*true/.test(w.body) || /nodeIntegration:\s*true/.test(w.body));
  check('electron-window-prefs', 'security', weak.length ? 'fail' : 'pass', weak.length ? `weak webPreferences at ${weak.map((w) => w.at).join(', ')}` : `${wins.length} windows: contextIsolation + sandbox, no nodeIntegration`);
  const unsafe = where(/webSecurity:\s*false|allowRunningInsecureContent:\s*true|experimentalFeatures:\s*true|enableRemoteModule/);
  check('electron-unsafe-flags', 'security', unsafe.length ? 'fail' : 'pass', unsafe.join(', ') || 'none');
  check('electron-webview-hardened', 'security', /will-attach-webview[\s\S]{0,400}contextIsolation: true/.test(all) ? 'pass' : 'fail', 'will-attach-webview forces isolation on every <webview>');
  const openers = (all.match(/setWindowOpenHandler/g) ?? []).length;
  check('electron-window-open', 'security', openers >= wins.length ? 'pass' : 'fail', `${openers} window-open handlers for ${wins.length} windows`);
  // Shell: execFile with an argument list is fine; a shell string can be injected.
  const shells = where(/(?<![.\w])exec(Sync)?\(\s*[`'"]|shell:\s*true|(?<![.\w])execSync\(/);   // not db.exec(SQL) or an injected d.exec(cmd, [args])
  check('shell-exec', 'security', shells.length ? 'fail' : 'pass', shells.length ? `shell-string exec at ${shells.join(', ')}` : 'only execFile/spawn with argument lists');
  const evals = where(/(?<![.\w])eval\(|new Function\(/).filter((w) => !/main\.js/.test(w) || !/DIXI_CONTROL/.test(fs.readFileSync(path.join(APP, w.split(':')[0]), 'utf8')));
  check('dynamic-code', 'security', evals.length ? 'fail' : 'pass', evals.join(', ') || 'none (the control hook eval exists only with DIXI_CONTROL_PORT + token, test-only)');

  // Production readiness.
  check('crash-handler', 'production', /uncaughtException|unhandledRejection/.test(all) && /render-process-gone|child-process-gone|crashReporter/.test(all) ? 'pass' : 'fail',
    `uncaughtException/unhandledRejection: ${/uncaughtException|unhandledRejection/.test(all) ? 'yes' : 'NO'} · render/child-process-gone or crashReporter: ${/render-process-gone|child-process-gone|crashReporter/.test(all) ? 'yes' : 'NO'}`);
  check('error-log', 'production', /errors?\.jsonl|kind: 'error'/.test(all) ? 'pass' : 'fail', 'errors persisted by default (traces only exist with DIXI_DEBUG=1)');
  check('keychain', 'production', /safeStorage|find-generic-password|keytar/.test(all) ? 'pass' : 'fail', 'API keys come from .env in plain text, not the macOS Keychain');
  check('auto-update', 'production', /autoUpdater|electron-updater/.test(all) ? 'pass' : 'fail', 'no update path');
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
  check('packaging', 'production', pkg.build || pkg.config?.forge || fs.existsSync(path.join(APP, 'forge.config.js')) || fs.existsSync(path.join(APP, 'electron-builder.yml')) ? 'pass' : 'fail', 'no electron-builder / forge config: no .app or DMG can be built');
  const ids = (await sh('security', ['find-identity', '-v', '-p', 'codesigning'])).out;
  check('signing-identity', 'production', /Developer ID Application/.test(ids) ? 'pass' : 'blocked', /Developer ID Application/.test(ids) ? 'Developer ID present' : 'no "Developer ID Application" certificate in the keychain: signing + notarization need the founder\'s Apple Developer account');
  check('changelog', 'production', fs.existsSync(path.join(REPO, 'CHANGELOG.md')) || fs.existsSync(path.join(APP, 'CHANGELOG.md')) ? 'pass' : 'fail', 'no CHANGELOG.md');
  check('ci', 'production', fs.existsSync(path.join(REPO, '.github/workflows')) ? 'pass' : 'fail', 'no .github/workflows: nothing runs the suite on commit');
  check('privacy-export-delete', 'production', /exportData|exportAll|deleteAll|wipeAll|eraseAll/.test(all) ? 'pass' : 'fail', 'no "export my data" / "delete everything" path');
  check('env-untracked', 'security', (await sh('git', ['ls-files', '.env', 'electron/.env'], { cwd: REPO })).out.trim() ? 'fail' : 'pass', '.env is not tracked by git');
  return { status: run.checks.some((c) => c.status === 'fail') ? 'fail' : 'pass', summary: `${run.checks.filter((c) => c.status === 'pass').length}/${run.checks.length} checks pass` };
}

// ---------------------------------------------------------------- secrets: key patterns in the repo + history; real key values in logs
const KEY_RE = /sk-ant-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|\bsk_[a-f0-9]{40,}|csk-[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[bp]-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/g;
const FAKE = /invalid|example|x{6,}|your[-_]?key|placeholder|qa_|test_?key|\.\.\./i;
async function secrets() {
  const { loadConfig } = await import(path.join(APP, 'src/main/config.js'));
  const real = Object.values(loadConfig().keys).filter((k) => k && k.length >= 16);   // held in memory only, never printed
  const hits = [];
  const scan = (label, text) => {
    for (const m of text.matchAll(KEY_RE)) if (!FAKE.test(m[0])) hits.push(`${label}: pattern ${m[0].slice(0, 7)}…`);
    for (const k of real) if (text.includes(k)) hits.push(`${label}: a real key (${k.slice(0, 4)}…)`);
  };
  const tracked = (await sh('git', ['ls-files', '-z'], { cwd: REPO })).out.split('\0').filter(Boolean);
  for (const f of tracked) { try { const p = path.join(REPO, f); if (fs.statSync(p).size < 5e6) scan(`tracked ${f}`, fs.readFileSync(p, 'utf8')); } catch {} }
  const untracked = (await sh('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: REPO })).out.split('\0').filter(Boolean);
  for (const f of untracked) { try { const p = path.join(REPO, f); if (fs.statSync(p).size < 5e6) scan(`untracked ${f}`, fs.readFileSync(p, 'utf8')); } catch {} }
  scan('git history', (await sh('git', ['log', '--all', '-p', '--no-color'], { cwd: REPO })).out);
  // Logs and outputs: the founder's app data (activity, traces, undo, spend), test outputs, the LLM cache.
  const logDirs = [path.join(os.homedir(), 'Library/Application Support/Dixi'), path.join(APP, 'test-results'), path.join(APP, 'eval/out'), path.join(APP, 'eval/.cache'), path.join(QA, 'results')];
  let n = 0;
  for (const d of logDirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d, { recursive: true })) {
      const p = path.join(d, String(f));
      if (!/\.(jsonl?|log|txt|md)$/.test(p) || /Partitions|Cache|IndexedDB|Local Storage/.test(p)) continue;
      try { if (fs.statSync(p).size < 20e6) { scan(`log ${p.replace(os.homedir(), '~')}`, fs.readFileSync(p, 'utf8')); n++; } } catch {}
    }
  }
  const uniq = [...new Set(hits)];
  test('secrets', 'secrets-scan', 'secrets', uniq.length ? 'fail' : 'pass', { error: uniq.slice(0, 20).join(' | ') || undefined });
  return { status: uniq.length ? 'fail' : 'pass', summary: `${tracked.length} tracked + ${untracked.length} untracked files, all history, ${n} log files, ${real.length} real keys checked · ${uniq.length} findings`, findings: uniq.slice(0, 50) };
}

// ---------------------------------------------------------------- idle: the founder's running Dixi, sampled with ps (read-only)
async function idle() {
  const samples = [];
  for (let i = 0; i < 6; i++) {
    const ps = (await sh('ps', ['-axo', 'pid,%cpu,rss,command'])).out.split('\n').filter((l) => /Application Support\/Dixi|dixi\/electron\/node_modules\/electron\/dist\/Electron\.app\/Contents\/MacOS\/Electron /.test(l) && !/dixi-(test|e2e|qa)-/.test(l));
    samples.push(ps.reduce((a, l) => { const [, cpu, rss] = l.trim().split(/\s+/); return { cpu: a.cpu + Number(cpu), rss: a.rss + Number(rss) / 1024, procs: a.procs + 1 }; }, { cpu: 0, rss: 0, procs: 0 }));
    if (i < 5) await wait(5000);
  }
  if (!samples[0].procs) return { status: 'skip', summary: 'Dixi is not running' };
  const cpu = samples.reduce((a, s) => a + s.cpu, 0) / samples.length, rss = Math.max(...samples.map((s) => s.rss));
  const status = cpu <= 2 && rss <= 800 ? 'pass' : 'fail';
  test('idle', 'idle-resources', 'resources', status, { error: status === 'pass' ? undefined : `idle CPU ${cpu.toFixed(1)}% (budget 2%), memory ${rss.toFixed(0)} MB (budget 800 MB)` });
  run.idle = { cpu: Number(cpu.toFixed(2)), rssMB: Math.round(rss), procs: samples[0].procs };
  return { status, summary: `${samples[0].procs} processes · avg CPU ${cpu.toFixed(1)}% over 25 s · ${rss.toFixed(0)} MB` };
}

// ---------------------------------------------------------------- retrieval: real files, real on-device embeddings, real model
async function retrieval() {
  const { openIndex, answerFrom } = await import(path.join(APP, 'src/main/index.js'));
  const { indexFolder } = await import(path.join(APP, 'src/main/ingest.js'));
  const { makeAsk } = await import(path.join(APP, 'src/main/ask.js'));
  const { chat, Spend } = await import(path.join(APP, 'src/main/providers.js'));
  const { loadConfig } = await import(path.join(APP, 'src/main/config.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-qa-docs-'));
  for (const [f, text] of Object.entries(DOCS)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); }
  const config = loadConfig();
  const spend = new Spend(path.join(dir, 'spend.json'), config.spendCapUSD);
  const ask = makeAsk((req) => chat(config, spend, req));
  const idx = openIndex(path.join(dir, 'index.db'));
  await indexFolder(idx, path.join(dir));
  const uriOf = (f) => `file://${path.join(dir, f)}`;
  const rows = [];
  for (const c of QUESTIONS) {
    const t0 = Date.now();
    const hits = await idx.search(c.q, { k: 5 });
    const rank = c.expect ? hits.findIndex((h) => h.uri === uriOf(c.expect)) + 1 : 0;
    let r; try { r = await answerFrom(idx, c.q, { ask }); } catch (err) { r = { known: false, say: `ERROR ${err.message}`, sources: [], error: true }; }
    const ms = Date.now() - t0;
    const cited = (r.sources ?? []).map((s) => s.uri);
    const row = { q: c.q, expect: c.expect, rank, known: r.known, say: r.say, ms, cited: cited.map((u) => u.replace(`file://${dir}/`, '')), error: r.error };
    if (c.expect === null) row.ok = r.known === false;                                   // grounded "I don't know"
    else if (c.secret) row.ok = !c.secret.test(r.say ?? '');                             // never reads a secret out
    else row.ok = r.known && c.answer.test(r.say ?? '') && cited.includes(uriOf(c.expect));
    row.citationOk = c.expect && r.known ? cited.includes(uriOf(c.expect)) : null;
    rows.push(row);
    test('retrieval', c.q, 'retrieval', row.ok ? 'pass' : 'fail', { ms, error: row.ok ? undefined : `rank ${rank} known ${r.known} cited [${row.cited}] said "${(r.say ?? '').slice(0, 160)}"` });
  }
  const answerable = rows.filter((r) => r.expect && !QUESTIONS.find((q) => q.q === r.q).secret), none = rows.filter((r) => r.expect === null);
  const known = answerable.filter((r) => r.known);
  run.retrieval = {
    at: run.at, n: rows.length,
    hitAt3: answerable.filter((r) => r.rank >= 1 && r.rank <= 3).length / answerable.length,
    answerAcc: answerable.filter((r) => r.ok).length / answerable.length,
    citationAcc: known.length ? known.filter((r) => r.citationOk).length / known.length : 0,
    idkRate: none.filter((r) => r.ok).length / none.length,           // said "I don't know" when nothing answers
    falseIdk: answerable.filter((r) => !r.known).length / answerable.length,
    secretLeaks: rows.filter((r) => QUESTIONS.find((q) => q.q === r.q).secret && !r.ok).length,
    p50: pct(rows.map((r) => r.ms), 50), p95: pct(rows.map((r) => r.ms), 95), rows,
  };
  idx.close?.();
  const R = run.retrieval;
  return { status: rows.every((r) => r.ok) ? 'pass' : 'fail', summary: `hit@3 ${(R.hitAt3 * 100).toFixed(0)}% · answers ${(R.answerAcc * 100).toFixed(0)}% · citations ${(R.citationAcc * 100).toFixed(0)}% · grounded IDK ${(R.idkRate * 100).toFixed(0)}% · secret leaks ${R.secretLeaks}` };
}

// ---------------------------------------------------------------- the real app, driven the way Deepgram Flux delivers speech
/** One command → its check result, latency split, and errors. */
async function said(a, c, memo) {
  const { say, inPage, pageText } = await import(path.join(APP, 'eval/harness.js'));
  const before = await a.page.evaluate(() => window.__dixi.tabs.getCurrentURL());
  await a.page.evaluate(() => { window.__qaAudio = []; window.__qaErr = []; });
  let r;
  if (c.interrupt) {
    const first = a.page.evaluate((t) => window.__say(t, 240), c.say);
    await wait(c.interrupt.afterMs + c.say.split(' ').length * 240);
    r = await say(a.app, a.page, c.interrupt.say, { timeoutMs: 20000 });
    await first.catch(() => {});
  } else r = await say(a.app, a.page, c.say, { timeoutMs: c.type === 'simple' ? 15000 : 45000 });
  const extra = await a.page.evaluate(() => ({ audio: window.__qaAudio, err: window.__qaErr, toast: document.getElementById('toast')?.hidden === false ? document.getElementById('toast-text')?.textContent ?? '' : '' }));
  const text = await pageText(a.page).catch(() => '');
  const ctx = { ...r.state, navs: r.navs, before, text: String(text ?? ''), toast: extra.toast, memo, inPage: (code) => inPage(a.page, code) };
  let verdict; try { verdict = await c.check(ctx); } catch (err) { verdict = `fail: check threw ${err.message}`; }
  if (r.state.timedOut && verdict === 'pass') verdict = 'fail: still busy at the timeout';
  // Latency, measured from the last word said (the harness's end of turn adds ~450 ms; real Flux ~200 ms).
  const tr = r.state.trace;
  const starts = tr.filter((e) => e.stage === 'step_start'), ends = tr.filter((e) => e.stage === 'step_end');
  const interp = tr.find((e) => e.stage === 'interpret');
  const speak = extra.audio.find((t) => t >= r.end);
  const lat = {
    id: c.id, feature: c.feature, type: c.type, at: run.at,
    firstActMs: r.firstNavMs ?? (starts[0] ? starts[0].t - r.end : null),
    doneMs: r.doneMs,
    listenMs: r.eot - r.end,                                   // simulated end of turn (text mode)
    routeMs: interp ? Math.round(interp.waitMs ?? interp.ms ?? 0) : null, routeSource: interp?.source ?? null,
    modelMs: (r.state.llm?.ms ?? []).reduce((s, x) => s + x, 0), aiCalls: r.state.llm?.calls ?? 0,
    toolMs: ends.reduce((s, e, i) => s + (starts[i] ? e.t - starts[i].t : 0), 0),
    speakMs: speak ? speak - r.end : null,
  };
  lat.totalMs = Math.max(lat.doneMs ?? -Infinity, lat.speakMs ?? -Infinity);
  if (!Number.isFinite(lat.totalMs)) lat.totalMs = null;
  const errors = [...extra.err, ...a.errs.splice(0)];
  for (const e of errors) run.errors.push({ type: errType(e), text: e, feature: c.feature, id: c.id });
  return { verdict, lat, status: r.state.status, url: r.state.url, answer: r.state.answer, errors };
}
const errType = (e) => /\b(4\d\d|5\d\d)\b|status/i.test(e) ? 'api-status' : /timeout|timed out/i.test(e) ? 'timeout' : /network|ENOTFOUND|ECONN|fetch failed|ERR_/i.test(e) ? 'network' : /TypeError|ReferenceError|undefined|null/.test(e) ? 'code' : 'other';

async function commands() {
  const a = await launch();
  log(`app up in ${a.startMs} ms`);
  test('commands', 'app-start', 'browser-voice', a.startMs < 15000 ? 'pass' : 'fail', { ms: a.startMs });
  const chains = [...new Set(COMMANDS.map((c) => c.chain))];
  try {
    for (const chain of chains) {
      await a.page.evaluate(() => window.__reset());
      const memo = {};
      for (const c of COMMANDS.filter((x) => x.chain === chain)) {
        let r = await said(a, c, memo);
        let retried = false, retryOk = null;
        if (r.verdict.startsWith('fail')) {   // one in-place retry: is the failure transient?
          retried = true;
          const r2 = await said(a, c, memo);
          retryOk = r2.verdict === 'pass';
        }
        const status = r.verdict === 'pass' ? 'pass' : r.verdict.startsWith('blocked') ? 'blocked' : 'fail';
        log(`${status.padEnd(7)} ${String(r.lat.totalMs ?? '-').padStart(6)} ms  ${c.say}${status === 'pass' ? '' : `  → ${r.verdict}`}`);
        test('commands', c.id, c.feature, status, { say: c.say, ms: r.lat.totalMs, error: status === 'pass' ? undefined : r.verdict.slice(0, 400), retried, retryOk, fixed: c.fixed, dixiSaid: (r.answer || r.status || '').slice(0, 200) });
        run.latency.push(r.lat);
        if (c.type === 'simple' && r.lat.totalMs != null && r.lat.totalMs > BUDGET_MS) test('latency', `budget:${c.id}`, c.feature, 'fail', { ms: r.lat.totalMs, error: `"${c.say}" took ${r.lat.totalMs} ms (budget ${BUDGET_MS} ms)` });
      }
    }
  } finally { await a.close(); }
  const mine = run.tests.filter((t) => t.stage === 'commands');
  return { status: mine.every((t) => t.status !== 'fail') ? 'pass' : 'fail', summary: `${mine.filter((t) => t.status === 'pass').length}/${mine.length} pass, ${mine.filter((t) => t.status === 'blocked').length} blocked` };
}

async function failures() {
  for (const f of FAILURES) {
    const a = await launch(f.env ?? {});
    try {
      if (f.network) await a.app.evaluate(({ session }, n) => { session.fromPartition('persist:dixi-tabs').enableNetworkEmulation(n); return true; }, f.network);
      const r = await said(a, { ...f, type: 'resilience' }, {});
      const crashed = a.app.process().exitCode != null;
      const status = crashed ? 'fail' : r.verdict === 'pass' ? 'pass' : 'fail';
      log(`${status.padEnd(7)} ${f.id}  ${status === 'pass' ? '' : `→ ${crashed ? 'app crashed' : r.verdict}`}`);
      test('failures', f.id, f.feature, status, { say: f.say, ms: r.lat.totalMs, error: status === 'pass' ? undefined : (crashed ? 'app crashed' : r.verdict).slice(0, 400), dixiSaid: (r.answer || r.status || '').slice(0, 200) });
    } finally { await a.close(); }
  }
  const mine = run.tests.filter((t) => t.stage === 'failures');
  return { status: mine.every((t) => t.status === 'pass') ? 'pass' : 'fail', summary: `${mine.filter((t) => t.status === 'pass').length}/${mine.length} handled clearly` };
}

// ---------------------------------------------------------------- go
const STAGES = { unit, gate: () => playwright('test/e2e/gate.spec.js', 'gate'), static: staticChecks, secrets, idle, retrieval, commands, failures, e2e: () => playwright('test/e2e/app.spec.js', 'e2e') };
const head = await sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO });
const dirty = await sh('git', ['status', '--porcelain'], { cwd: REPO });
Object.assign(run, { sha: head.out.trim(), dirtyFiles: dirty.out.split('\n').filter(Boolean).length, mac: `${os.type()} ${os.release()} ${os.arch()}` });
for (const s of stages) {
  log(`stage ${s}…`);
  const t0 = Date.now();
  try { run.stages[s] = { ...(await STAGES[s]()), ms: Date.now() - t0 }; } catch (err) { run.stages[s] = { status: 'error', summary: String(err.stack ?? err).slice(0, 600), ms: Date.now() - t0 }; }
  log(`stage ${s}: ${run.stages[s].status} · ${run.stages[s].summary}`);
}
// Per command type: p50/p95 of the total and of each segment.
run.perf = {};
for (const type of [...new Set(run.latency.map((l) => l.type))]) {
  const ls = run.latency.filter((l) => l.type === type);
  run.perf[type] = Object.fromEntries(['totalMs', 'firstActMs', 'listenMs', 'routeMs', 'modelMs', 'toolMs', 'speakMs'].map((k) => {
    const xs = ls.map((l) => l[k]).filter((x) => x != null && Number.isFinite(x));
    return [k, { p50: pct(xs, 50), p95: pct(xs, 95), n: xs.length }];
  }));
}
fs.mkdirSync(path.join(QA, 'results'), { recursive: true });
const stamp = run.at.replace(/[:.]/g, '-');
fs.writeFileSync(path.join(QA, 'results', `run-${stamp}.json`), JSON.stringify(run, null, 1));
fs.writeFileSync(path.join(QA, 'results', 'latest.json'), JSON.stringify(run, null, 1));
await import('./dashboard.js').then((m) => m.build()).catch((err) => log('dashboard failed:', err.message));
const bad = run.tests.filter((t) => t.status === 'fail' || t.status === 'flaky');
log(`done: ${run.tests.length} results, ${bad.length} failing/flaky → qa/results/run-${stamp}.json, qa/dashboard.html`);
process.exitCode = Object.values(run.stages).some((s) => s.status === 'fail' || s.status === 'error') ? 1 : 0;
