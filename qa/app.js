// The real app for QA: launched as a plain process with its own throwaway profile, driven over the
// token-gated control port (eval/harness.js --real), spoken replies muted so the founder's Dixi never
// hears it. Shared by run.js (browser commands) and mac-run.js (Dixi Everywhere).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.resolve(process.env.QA_APP ?? path.join(QA, '../electron'));
// The QA lane's own spend ledger: only what QA runs cost, capped across all of them (orchestrator: $1.50).
export const QA_LEDGER = path.join(QA, 'results', 'qa-spend.json'), QA_CAP = 1.5;
const readLedger = () => { try { return JSON.parse(fs.readFileSync(QA_LEDGER, 'utf8')); } catch { return { totalUSD: 0, runs: [] }; } };
export const qaSpent = () => readLedger().totalUSD;
export function qaRecord(what, usd) {
  const d = readLedger(); d.totalUSD = Number((d.totalUSD + usd).toFixed(4)); d.runs.push({ at: new Date().toISOString(), what, usd: Number(usd.toFixed(4)) });
  fs.mkdirSync(path.dirname(QA_LEDGER), { recursive: true }); fs.writeFileSync(QA_LEDGER, JSON.stringify(d, null, 1)); return d.totalUSD;
}

/**
 * Dixi Everywhere for the Mac suite: spawned plainly (no automation), control port + token, its own profile,
 * and only used once the app is ready (harness.js launchApp hooks the session first, which races in --real).
 * → { main(fn, arg), ui(fn, arg), osa(jxa), profile, errs, startMs, close() }
 */
export async function launchMac(env = {}) {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const os = await import('node:os');
  const crypto = await import('node:crypto');
  const { default: electronPath } = await import(path.join(APP, 'node_modules/electron/index.js'));
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const token = crypto.randomBytes(16).toString('hex');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-qa-mac-'));
  const e = { ...process.env, DIXI_USER_DATA: profile, DIXI_CONTROL_PORT: String(port), DIXI_CONTROL_TOKEN: token, ...env };
  delete e.ELECTRON_RUN_AS_NODE; delete e.DIXI_EVAL;   // DIXI_EVAL turns Everywhere off
  const t0 = Date.now();
  const child = spawn(electronPath, [APP, `--user-data-dir=${profile}`], { cwd: APP, env: e, stdio: ['ignore', 'ignore', 'pipe'] });
  const errs = [];
  child.stderr.on('data', (d) => { for (const l of String(d).split('\n')) if (/error|uncaught|unhandled|exception|fatal|\[everywhere\]/i.test(l) && !/DevTools|ERROR:.*(gpu|ssl_client|registration|cert)|Autofill/i.test(l)) errs.push(l.slice(0, 300)); });
  const call = async (where, fn, arg) => {
    const r = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', headers: { 'x-dixi-control': token }, body: JSON.stringify({ where, code: String(fn), arg }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.value;
  };
  const until = async (what, fn, ms = 40000) => {
    for (const end = Date.now() + ms; ;) {
      if (child.exitCode != null) throw new Error(`the app exited (${child.exitCode}) before ${what}`);
      if (await fn().catch(() => false)) return;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await until('app ready', () => call('main', ({ app }) => app.isReady()));
  await until('the UI', () => call('ui', () => Boolean(window.dixi?.everywhere && window.__dixi)));
  await until('Everywhere', () => call('ui', () => window.dixi.everywhere.enabled().then(() => true, () => false)));
  // Hide its windows so they never sit in front of the app under test (the glass panel still shows itself).
  await call('main', ({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.isVisible()) w.hide(); return true; });
  await call('ui', (audible) => {
    window.__said = []; window.__asked = [];
    window.dixi.everywhere.onSay((text) => window.__said.push({ t: Date.now(), text }));
    window.dixi.everywhere.onConfirm((c) => window.__asked.push({ t: Date.now(), q: c?.question }));
    if (!audible) {   // muted, so the founder's listening Dixi never hears the test app
      const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.muted = true; return play.call(this); };
      if (window.speechSynthesis) { const s = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { u.volume = 0; s(u); }; }
    }
    return true;
  }, Boolean(process.env.QA_AUDIBLE));
  // JXA run by the app itself, so it uses the Automation grants Dixi already has (no new prompts for the QA shell).
  const osa = (src) => call('main', async (_e, s) => { const { execFile } = await import('node:child_process'); return new Promise((r) => execFile('osascript', ['-l', 'JavaScript', '-e', s], { timeout: 8000 }, (err, o, se) => r(err ? `ERR ${String(se || err.message).trim().slice(0, 200)}` : String(o).trim()))); }, src);
  return {
    main: (fn, arg) => call('main', fn, arg), ui: (fn, arg) => call('ui', fn, arg), osa, profile, errs, child, startMs: Date.now() - t0,
    close: async () => { child.kill(); await new Promise((r) => (child.exitCode != null ? r() : child.once('exit', r))); fs.rmSync(profile, { recursive: true, force: true }); },
  };
}

/** → { app, page, profile, errs, startMs, crashes, close() }. env is added to the launch (DIXI_EVERYWHERE '0' unless given). */
export async function launch(env = {}, { onCrash = () => {} } = {}) {
  const { launchApp } = await import(path.join(APP, 'eval/harness.js'));
  const t0 = Date.now();
  const { app, page, profile } = await launchApp({ appRoot: APP, real: true, env: { DIXI_EVERYWHERE: '0', ...env } });
  const child = app.process();
  const errs = [];
  child.stderr?.on('data', (d) => { for (const l of String(d).split('\n')) if (/error|uncaught|unhandled|exception|fatal|\[everywhere\]/i.test(l) && !/DevTools|ERROR:.*(gpu|ssl_client|registration|cert)|Autofill/i.test(l)) errs.push(l.slice(0, 300)); });
  child.on('exit', (code, sig) => { if (!app.closing && (code || sig)) onCrash(`app exited code=${code} signal=${sig}`); });
  await page.evaluate((audible) => {
    window.__qaAudio = []; window.__qaErr = [];
    window.addEventListener('error', (e) => window.__qaErr.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__qaErr.push(String(e.reason?.message ?? e.reason)));
    const ce = console.error; console.error = (...a) => { window.__qaErr.push(a.map(String).join(' ').slice(0, 240)); ce(...a); };
    const sp = window.__dixi.voice.speaker;
    if (sp) { const prev = sp.onSpeaking; sp.onSpeaking = (on) => { if (on) window.__qaAudio.push(Date.now()); prev?.call(sp, on); }; }
    if (!audible) {   // muted, so the founder's listening Dixi never hears the test app
      const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.muted = true; return play.call(this); };
      if (window.speechSynthesis) { const s = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { u.volume = 0; s(u); }; }
    }
    return true;
  }, Boolean(process.env.QA_AUDIBLE));
  return { app, page, profile, errs, startMs: Date.now() - t0, close: async () => { app.closing = true; await app.close(); fs.rmSync(profile, { recursive: true, force: true }); } };
}
