// Shared test harness: launch the real Dixi app, speak to it the way Deepgram Flux delivers speech,
// read back real state. Used by the live real-site suite (live.js) and the fixture suite (run.js).

import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Launch the app with its own throwaway profile. extraArgs e.g. host-resolver-rules for fixtures. */
export async function launchApp({ appRoot = root, extraArgs = [], env = {}, profile = null } = {}) {
  const dir = profile ?? fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-test-'));
  const e = { ...process.env, ...env };
  delete e.ELECTRON_RUN_AS_NODE;  // editors that embed Electron export this; it turns the app into plain Node
  const app = await electron.launch({ args: [appRoot, `--user-data-dir=${dir}`, ...extraArgs], cwd: appRoot, env: e });
  app.process().stderr?.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(d); });
  // Every top-level page load, with its time: wrong-site detection and "first action" timing.
  await app.evaluate(({ session }) => {
    globalThis.__navs = [];
    globalThis.__case = '';
    const s = session.fromPartition('persist:dixi-tabs');
    s.webRequest.onBeforeSendHeaders((d, cb) => cb({ requestHeaders: { ...d.requestHeaders, ...(globalThis.__case ? { 'x-dixi-case': globalThis.__case } : {}) } }));
    // Tab page loads only (not the resolver's hidden probe windows).
    s.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => { if (d.resourceType === 'mainFrame' && d.webContents?.getType?.() === 'webview') globalThis.__navs.push({ t: Date.now(), url: d.url }); cb({}); });
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__dixi);
  await page.evaluate(async () => {
    const { voice, llm, tabs, agent, settings } = window.__dixi;
    await voice.stop?.();
    if (settings) settings.requireWakeWord = false;
    window.__llm = { calls: 0, tokens: 0, ms: [] };
    const transport = llm.transport;
    llm.transport = async (req) => { window.__llm.calls++; const r = await transport(req); window.__llm.tokens += r?.json?.usage?.total_tokens ?? 0; window.__llm.ms.push(r?.ms ?? 0); return r; };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__busy = () => (window.__dixi.busy ? window.__dixi.busy() : (voice.pending > 0 || agent.isRunning || tabs.isLoading()));
    window.__reset = async ({ closeTabs = true } = {}) => {
      if (window.__dixi.resetForEval) window.__dixi.resetForEval(); else { voice.cancelAll?.(); agent.finalResult = null; voice.plan = []; voice.answer = null; }
      for (let i = 0; i < 50 && window.__busy() && !tabs.isLoading(); i++) await sleep(100);
      if (closeTabs) { for (const t of [...tabs.tabs]) tabs.closeTab(t.id); tabs.createTab('about:blank'); }
      window.__llm = { calls: 0, tokens: 0, ms: [] };
    };
    // Flux-style: the whole turn so far ~4x a second, then early and final end of turn.
    // ElevenLabs-style: live partials word by word, then the committed turn ~0.9 s after the last word.
    window.__sayEL = async (text, wordMS, commitMS = 900) => {
      const send = (event, transcript) => voice.handleMessage(JSON.stringify({ type: 'TurnInfo', event, turn_index: window.__turn, transcript }));
      window.__turn = (window.__turn ?? 0) + 1;
      const words = text.split(' ');
      const t0 = Date.now();
      for (let i = 1; i <= words.length; i++) { send('Update', words.slice(0, i).join(' ')); if (i < words.length) await sleep(wordMS); }
      const end = Date.now();
      await sleep(commitMS); send('EndOfTurn', text);
      return { end, eot: Date.now(), start: t0 };
    };
    window.__say = async (text, wordMS) => {
      const send = (event, transcript) => voice.handleMessage(JSON.stringify({ type: 'TurnInfo', event, turn_index: window.__turn, transcript }));
      window.__turn = (window.__turn ?? 0) + 1;
      const words = text.split(' ');
      send('StartOfTurn', '');
      for (let i = 1; i <= words.length; i++) { send('Update', words.slice(0, i).join(' ')); if (i < words.length) await sleep(wordMS); }
      const end = Date.now();
      const final = text[0].toUpperCase() + text.slice(1) + (/[.?!]$/.test(text) ? '' : /^(who|what|how|when|where|why|is|are|does|do|can)\b/i.test(text) ? '?' : '.');
      await sleep(200); send('EagerEndOfTurn', final);
      await sleep(250); send('EndOfTurn', final);
      return { end, eot: Date.now() };
    };
  });
  return { app, page, profile: dir };
}

/** Say something and wait until Dixi is done (idle for idleMs) or the timeout. Returns timings. */
export async function say(app, page, text, { wordMS = 240, idleMs = 1500, timeoutMs = 25000, style = 'flux' } = {}) {
  const navsBefore = (await app.evaluate(() => globalThis.__navs.length));
  const { end, eot, start } = await page.evaluate(({ text, ms, style }) => (style === 'elevenlabs' ? window.__sayEL(text, ms) : window.__say(text, ms)), { text, ms: wordMS, style });
  let idleSince = null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => window.__busy());
    if (busy) idleSince = null; else if (!idleSince) idleSince = Date.now(); else if (Date.now() - idleSince > idleMs) break;
    await page.waitForTimeout(150);
  }
  const navs = (await app.evaluate(() => globalThis.__navs)).slice(navsBefore);
  const state = await page.evaluate(() => {
    const { voice, tabs } = window.__dixi;
    const tr = window.__dixi.traces ?? [];
    return {
      url: tabs.getCurrentURL(), title: tabs.activeTab?.title ?? '', status: voice.statusLine, answer: voice.answer?.text ?? '',
      plan: (voice.plan ?? []).map((p) => `${p.label} [${p.state}]`), clarify: voice.clarify?.question ?? null, confirm: voice.confirm?.question ?? null,
      llm: window.__llm, timedOut: window.__busy(),
      trace: tr.filter((e) => ['interpret', 'resolve', 'step_start', 'step_end', 'eot'].includes(e.stage)).map((e) => ({ ...e, intent: e.intent ? e.intent.steps.map((x) => [x.act, x.said, x.query || x.item || x.value || x.n].filter(Boolean).join('/')) : undefined })),
    };
  });
  const stepStart = state.trace.find((e) => e.stage === 'step_start');
  const eotT = state.trace.find((e) => e.stage === 'eot')?.t;
  return { start, end, eot, navs, state, firstNavMs: navs[0] ? navs[0].t - end : null, overheadMs: stepStart && eotT ? stepStart.t - eotT : null };
}

/** Run page code in the active tab (isolated world). */
export const inPage = (page, code) => page.evaluate(async (c) => {
  const t = window.__dixi.tabs;
  if (t.exec) return t.exec(null, c);
  const r = await t.executeJS(c);   // baseline app: string results
  try { return JSON.parse(r); } catch { return r; }
}, code);
export const media = (page) => inPage(page, `(() => { const m = [...document.querySelectorAll('video, audio')].sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0]; return m ? { paused: m.paused, muted: m.muted, volume: m.volume, rate: m.playbackRate, time: m.currentTime } : null; })()`);
export const pageText = (page) => inPage(page, `document.body ? document.body.innerText.slice(0, 20000) : ''`);
