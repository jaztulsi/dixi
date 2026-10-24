// Dixi main process: window, keys, and every call that needs a key or main-process powers.
// The renderer (UI + agents) never sees an API key; every IPC handler checks it is our own UI calling.

import { app, BrowserWindow, ipcMain, session, shell, systemPreferences, webContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { chat, abort, tiers, keyStatus, Spend, ENDPOINTS, discoverModels, problems, escalation, modeOf } from './providers.js';
import { DeepgramBridge } from './deepgram.js';
import { ElevenLabsBridge } from './stt.js';
import { Resolver } from './resolve.js';
import { speakable } from './speakable.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const config = loadConfig();
const EVAL = Boolean(process.env.DIXI_EVAL);

// Voice-opened videos must play without a real user click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Hands-free: Dixi works while other apps are in front, so a covered window must not be paused.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// End-to-end tests: play a WAV file as the microphone (DIXI_FAKE_AUDIO=/path/to.wav).
if (process.env.DIXI_FAKE_AUDIO) {
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${process.env.DIXI_FAKE_AUDIO}%noloop`);
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox');
}

// A test launch (eval/harness.js --real) gets its own profile, so it never collides with your running Dixi.
if (process.env.DIXI_USER_DATA) app.setPath('userData', process.env.DIXI_USER_DATA);
// The app was called Runic: carry its data folder over once (settings, learned names, tab logins).
{
  const legacy = path.join(app.getPath('appData'), 'Runic');
  const data = app.getPath('userData');
  if (!fs.existsSync(data) && fs.existsSync(legacy)) {
    fs.cpSync(legacy, data, { recursive: true, filter: (src) => !/Singleton|Cache|Code Cache|GPUCache/.test(path.basename(src)) });
    const tabs = path.join(data, 'Partitions');
    if (fs.existsSync(path.join(tabs, 'runic-tabs'))) fs.renameSync(path.join(tabs, 'runic-tabs'), path.join(tabs, 'dixi-tabs'));
  }
}
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let pendingURL = null;
// Speech-to-text: ElevenLabs Scribe when its key is set (or DIXI_STT=elevenlabs), else Deepgram Flux.
// ElevenLabs out of credit or refused → Deepgram Flux, when DEEPGRAM_API_KEY is set.
const sttName = config.env.DIXI_STT || (config.keys.elevenlabs ? 'elevenlabs' : 'deepgram');
const emitToUI = (channel, data) => win?.webContents.send(channel, data);
const deepgram = sttName === 'elevenlabs'
  ? new ElevenLabsBridge(config.keys.elevenlabs, emitToUI, { fallback: config.deepgramAPIKey ? new DeepgramBridge(config.deepgramAPIKey, emitToUI) : null })
  : new DeepgramBridge(config.deepgramAPIKey, emitToUI);
// One ledger for the app and test runs (whatever their profile), so per-provider caps hold across both.
const spendCaps = Object.fromEntries(Object.keys(ENDPOINTS).map((p) => [p, Number(config.env[`DIXI_CAP_${p.toUpperCase()}`]) || 0]));
const spend = new Spend(path.join(app.getPath('appData'), 'Dixi', 'spend.json'), config.spendCapUSD, spendCaps);
if (!config.env.DIXI_LLM_CACHE_DIR) config.env.DIXI_LLM_CACHE_DIR = path.join(root, 'eval/.cache/llm');
const tabsSession = () => session.fromPartition('persist:dixi-tabs');
// Which models the keys can use, asked of Cerebras and Anthropic at startup (ranked by npm run bench:models).
const modelsFile = path.join(app.getPath('appData'), 'Dixi', 'models.json');
let found = {};
const discovered0 = discoverModels(config, { file: modelsFile }).then((f) => { found = f; for (const p of problems(config, f)) console.error('[keys]', p); });

/** A page fetched with the tabs' own network stack (same cookies, same host rules in evals). Sites that
 *  refuse background fetches (401/403/429, or no real page) are loaded for real in a hidden window. */
async function fetchPage(url, { probe = false } = {}) {
  if (!/^https?:\/\//i.test(url)) return null;
  let r = null;
  try {
    const res = await tabsSession().fetch(url, { headers: probe ? { 'x-dixi-probe': '1' } : {}, redirect: 'follow', signal: AbortSignal.timeout(4000) });
    r = { ok: res.ok, status: res.status, url: res.url || url, html: (await res.text()).slice(0, 400_000) };
  } catch {}
  if (probe && (!r || [401, 403, 429, 503].includes(r.status) || (r.ok && !/<title/i.test(r.html.slice(0, 50_000))))) return (await loadPage(url)) ?? r;
  return r;
}

// Hidden windows for real page loads (same session as the tabs): at most two at a time.
let loaders = 0;
const waiting = [];
async function loadPage(url) {
  if (loaders >= 2) await new Promise((r) => waiting.push(r));
  loaders++;
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:dixi-tabs', sandbox: true, contextIsolation: true, images: false, backgroundThrottling: false } });
  w.webContents.setAudioMuted(true);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    const done = new Promise((res) => { w.webContents.once('dom-ready', res); w.webContents.once('did-fail-load', res); setTimeout(res, 6000); });
    w.loadURL(url, { extraHeaders: 'x-dixi-probe: 1\n' }).catch(() => {});
    await done;
    await new Promise((res) => setTimeout(res, 400));   // titles set by script
    const html = await Promise.race([w.webContents.executeJavaScriptInIsolatedWorld(1002, [{ code: `'<title>' + document.title.replace(/</g, '') + '</title>' + document.documentElement.outerHTML.slice(0, 400000)` }]), new Promise((res) => setTimeout(() => res(''), 2000))]);
    return html ? { ok: true, status: 200, url: w.webContents.getURL() || url, html } : null;
  } catch { return null; } finally { loaders--; w.destroy(); waiting.shift()?.(); }
}
let resolver = null;

function createWindow() {
  win = new BrowserWindow({
    title: 'Dixi', width: 1400, height: 900, minWidth: 720, minHeight: 500, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(here, '../preload/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true },
  });
  win.loadFile(path.join(here, '../renderer/index.html'));
  win.on('closed', () => { win = null; deepgram.close(); });
  win.webContents.on('did-finish-load', () => { if (pendingURL) { win.webContents.send('app:open-url', pendingURL); pendingURL = null; } });
  // The UI page never navigates away (a dropped link would otherwise get the window.dixi bridge).
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Tabs: fixed partition, no preload, no Node, whatever the page asks for.
  win.webContents.on('will-attach-webview', (_e, prefs, params) => {
    delete prefs.preload;
    Object.assign(prefs, { nodeIntegration: false, contextIsolation: true, sandbox: true });
    params.partition = 'persist:dixi-tabs';
  });
}

// Popups from pages open as Dixi tabs (http/https only), not stray windows.
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() !== 'webview') return;
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) win?.webContents.send('tab:popup', url); return { action: 'deny' }; });
  wc.on('render-process-gone', () => win?.webContents.send('tab:crashed', wc.id));
});

// dixi:// deep links (website "Launch Dixi" button). They only focus/prefill, never run a task.
function handleDeepLink(url) {
  if (!url?.startsWith('dixi://')) return;
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); win.webContents.send('app:open-url', url); } else pendingURL = url;
}
app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });
app.on('second-instance', (_e, argv) => handleDeepLink(argv.find((a) => a.startsWith('dixi://'))));

app.whenReady().then(() => {
  if (process.defaultApp) app.setAsDefaultProtocolClient('dixi', process.execPath, [path.resolve(process.argv[1] ?? '.')]);
  else app.setAsDefaultProtocolClient('dixi');

  // Microphone: only the Dixi UI may use it, never the websites inside the tabs.
  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone').catch(() => false);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(permission === 'media' && wc.getURL().startsWith('file://') && (details.mediaTypes ?? ['audio']).every((t) => t === 'audio'));
  });
  const tabs = tabsSession();
  tabs.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));
  // Sites see a normal Chrome (same engine and version), without the "Electron/x" and app tokens that
  // some bot walls key on. Reported as a trade-off in docs/DECISIONS.md.
  tabs.setUserAgent(tabs.getUserAgent().replace(/\s(Electron|dixi|Dixi)\/\S+/g, ''));
  // Ads and trackers: a generated public blocklist (npm run refresh-blocklist), never a hand-written one.
  try {
    const hosts = fs.readFileSync(path.join(root, 'data/blocklist.generated.txt'), 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    const blocked = new Set(hosts);
    if (hosts.length) {
      tabs.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
        let h = '';
        try { h = new URL(d.url).hostname; } catch {}
        const parts = h.split('.');
        cb({ cancel: d.resourceType !== 'mainFrame' && parts.some((_, i) => blocked.has(parts.slice(i).join('.'))) });
      });
    }
  } catch {}
  resolver = new Resolver({ fetchPage, file: path.join(app.getPath('userData'), 'registry.json'), env: config.env, keys: config.keys });
  createWindow();
  handleDeepLink(process.argv.find((a) => a.startsWith('dixi://')));
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win) createWindow(); });
process.on('unhandledRejection', (err) => console.error('[main] unhandled', err));

// Test hook for eval/harness.js --real: the app launched normally (no automation, so sites see exactly
// what they see in daily use), driven over localhost. Exists only when the harness sets both env vars;
// every request must carry the token. Runs the given function in the UI page or in this process.
if (process.env.DIXI_CONTROL_PORT && process.env.DIXI_CONTROL_TOKEN) {
  const http = await import('node:http');
  const electronModule = await import('electron');
  http.createServer((req, res) => {
    const reply = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method !== 'POST' || req.headers['x-dixi-control'] !== process.env.DIXI_CONTROL_TOKEN) return reply(403, { error: 'forbidden' });
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { where, code, arg } = JSON.parse(body);
        const value = where === 'main'
          ? await (0, eval)(`(${code})`)(electronModule, arg)
          : await win.webContents.executeJavaScript(`(${code})(${arg === undefined ? '' : JSON.stringify(arg)})`, true);
        reply(200, { value: value ?? null });
      } catch (err) { reply(200, { error: String(err?.message ?? err) }); }
    });
  }).listen(Number(process.env.DIXI_CONTROL_PORT), '127.0.0.1');
}

// ---- IPC: only our own UI page may call these ----
const ours = (e) => Boolean(win) && e.sender === win.webContents && e.senderFrame?.url?.startsWith('file://');
const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => { if (!ours(e)) throw new Error('forbidden'); return fn(...args); });
const on = (channel, fn) => ipcMain.on(channel, (e, ...args) => { if (ours(e)) fn(...args); });

handle('config:get', async () => {
  await Promise.race([discovered0, new Promise((r) => setTimeout(r, 4000))]);
  return { keys: keyStatus(config), stt: sttName, mode: modeOf(config), tiers: tiers(config, found), escalation: escalation(config), problems: problems(config, found),
    webSearch: config.env.DIXI_SEARCH_URL || '', eval: EVAL, debug: Boolean(config.env.DIXI_DEBUG) || EVAL };
});

const BODY_FIELDS = ['messages', 'tools', 'tool_choice', 'max_tokens', 'temperature', 'response_format', 'reasoning_effort'];
handle('llm:chat', (req) => {
  const all = Object.values(tiers(config, found)).flat();
  if (!req || !all.includes(req.model)) return { status: 400, json: { error: { message: `Model not allowed: ${req?.model}` } } };
  const body = Object.fromEntries(BODY_FIELDS.filter((k) => req.body?.[k] !== undefined).map((k) => [k, req.body[k]]));
  body.max_tokens = Math.min(Number(body.max_tokens) || 512, 2048);
  if (JSON.stringify(body).length > 1_500_000) return { status: 413, json: { error: { message: 'Request too large' } } };
  return chat(config, spend, { model: req.model, body, id: req.id });
});
on('llm:abort', (id) => abort(id));
handle('spend:get', () => ({ totalUSD: spend.total, capUSD: spend.cap, byProvider: spend.by, caps: spendCaps }));

handle('resolve:site', (q) => resolver.resolve({ said: String(q?.said ?? '').slice(0, 120), guess: String(q?.guess ?? '').slice(0, 120), urls: (q?.urls ?? []).slice(0, 3).map(String).filter((u) => /^https?:\/\//i.test(u)), fast: Boolean(q?.fast) }));
handle('registry:confirm', (said, hit) => resolver.confirm(String(said), { url: String(hit.url), host: String(hit.host), finalHost: String(hit.finalHost ?? hit.host), name: String(hit.name) }));
handle('registry:names', () => resolver.names());
handle('registry:all', () => [...new Set(Object.values(resolver.entries))].filter((e) => e.fail < 2).map(({ name, said, url, host, finalHost, searchTemplate }) => ({ name, said, url, host, finalHost, searchTemplate })));
handle('registry:lookup', (name) => resolver.lookup(String(name)));
handle('registry:outcome', (host, ok) => resolver.outcome(String(host), Boolean(ok)));
handle('registry:template', (host, tpl) => resolver.setSearchTemplate(String(host), String(tpl)));
handle('registry:clear', () => { resolver.entries = {}; resolver.save(); return true; });

// Page scripts run in the tab's isolated world (world 1001): the page can't see or tamper with them.
const blockedWorlds = new Set();   // tabs whose current page refused the isolated world (reset on navigation)
app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'webview') wc.on('did-start-navigation', (d) => { if (d.isMainFrame && !d.isSameDocument) blockedWorlds.delete(wc.id); }); });
handle('tab:exec', async (id, code, timeoutMs = 8000) => {
  const wc = webContents.fromId(Number(id));
  if (!wc || wc.hostWebContents !== win.webContents) throw new Error('not a Dixi tab');
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('page did not answer in time')), Math.min(Number(timeoutMs) || 8000, 15000)));
  // Pages with a strict content-security policy refuse the isolated world: run in the page's own world then.
  const run = async () => {
    if (!blockedWorlds.has(wc.id)) {
      try { return await wc.executeJavaScriptInIsolatedWorld(1001, [{ code: String(code) }], true); } catch (err) {
        if (!/failed to execute/i.test(err.message)) throw err;
        blockedWorlds.add(wc.id);
      }
    }
    return wc.executeJavaScript(String(code), true);
  };
  return Promise.race([run(), timeout]);
});
// OpenSearch description → a URL template with {q}: the template attribute, plus any <Param> children.
export function openSearchTemplate(xml) {
  const urlEl = [...String(xml).matchAll(/<Url\b([^>]*?)(\/>|>([\s\S]*?)<\/Url>)/gi)].find((m) => /type=["']text\/html["']/i.test(m[1]));
  if (!urlEl) return null;
  let tpl = urlEl[1].match(/template=["']([^"']+)/i)?.[1]?.replace(/&amp;/g, '&');
  if (!tpl || !/^https?:/.test(tpl)) return null;
  for (const p of (urlEl[3] ?? '').matchAll(/<Param\b[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi)) tpl += `${tpl.includes('?') ? '&' : '?'}${p[1]}=${p[2]}`;
  tpl = tpl.replace(/\{searchTerms\}/, '{q}').replace(/[&?][a-z_]+=\{[^}]+\?\}/gi, '');
  return tpl.includes('{q}') ? tpl : null;
}
handle('tab:opensearch', async (url) => openSearchTemplate((await fetchPage(String(url)).catch(() => null))?.html ?? ''));
// Spoken replies in an ElevenLabs voice (key stays here). DIXI_VOICE = voice id, DIXI_TTS_MODEL = model.
// Returns mp3 bytes, or null (the renderer then falls back to the system voice).
handle('tts:speak', async (text) => {
  if (!config.keys.elevenlabs || spend.over) return null;
  // Matilda (knowledgeable, upbeat; the user's pick). Others that sound good: Jessica cgSgspJ2msm6clMCkdW9, Bella hpp4J3VqNfWAUOO0d1Us.
  const voice = config.env.DIXI_VOICE || 'XrExE9yKIg1WjnnlVkGX';
  try {
    const res = await fetch(`${ENDPOINTS.elevenlabs.url}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'xi-api-key': config.keys.elevenlabs, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      // Turbo v2.5: as quick as Flash (~0.5 s) and clearly better sounding (Flash mumbles). A natural,
      // unhurried pace; numbers written out first (speakable), which every model then says right.
      body: JSON.stringify({ text: speakable(String(text).slice(0, 400)), model_id: config.env.DIXI_TTS_MODEL || 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.95 } }),
    });
    if (!res.ok) { console.warn('[tts]', res.status, (await res.text()).slice(0, 160)); return null; }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) { console.warn('[tts]', err.message); return null; }
});
// A spoken answer about something recent ("latest Apple products"): Claude with one web search.
// About $0.01 per search plus tokens, counted against the Anthropic cap. DIXI_WEB_MODEL to change.
handle('answer:web', async (question) => {
  if (!config.keys.anthropic || spend.overFor('anthropic')) return null;
  const model = config.env.DIXI_WEB_MODEL || 'claude-haiku-5-5';
  const ws = config.env.ANTHROPIC_WORKSPACE_ID;
  try {
    const res = await fetch(ENDPOINTS.anthropic.url, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(ws ? { 'anthropic-workspace-id': ws } : {}) },
      body: JSON.stringify({
        model, max_tokens: 400, thinking: { type: 'disabled' },
        system: `Today is ${new Date().toDateString()}. Answer the spoken question in 1-3 short sentences that sound natural read aloud. Use one web search for anything recent or specific (specs, prices, comparisons). The question may say which web page the user is on, for context only: never mention pages, searching or what you can or can't see; just give the answer. No lists, no markdown, no links.`,
        messages: [{ role: 'user', content: String(question).slice(0, 300) }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      }),
    });
    const j = await res.json();
    if (!res.ok) { console.warn('[web answer]', res.status, j.error?.message); return null; }
    spend.add(`anthropic:${model}`, j.usage);
    spend.addUSD('anthropic', 0.01 * (j.usage?.server_tool_use?.web_search_requests ?? 1));
    // Only what comes after the search result is the answer ("I'll look that up." before it is not).
    const blocks = j.content ?? [];
    const after = blocks.slice(blocks.findLastIndex((c) => c.type === 'web_search_tool_result') + 1);
    return after.filter((c) => c.type === 'text').map((c) => c.text).join('').replace(/\s+/g, ' ').trim() || null;
  } catch (err) { console.warn('[web answer]', err.message); return null; }
});
// A site's search URL read from its home page HTML (no rendering), so a first search can skip the home page.
// A site's search URL read from its home page HTML (no rendering), so a first search skips the home
// page: its OpenSearch link, else its own GET search form. One lookup per site (also while you talk).
const discovered = new Map();  // origin → Promise<template | null>
handle('tab:discover-search', (url) => {
  let origin; try { origin = new URL(String(url)).origin; } catch { return null; }
  if (!/^https?:/.test(origin)) return null;
  if (!discovered.has(origin)) discovered.set(origin, discoverSearch(String(url)).catch(() => null));
  return discovered.get(origin);
});
async function discoverSearch(url) {
  // The whole page: big sites put the link after ~1 MB of inline script (fetchPage stops at 400 KB).
  const home = await tabsSession().fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(2500) })
    .then(async (r) => ({ ok: r.ok, url: r.url || url, html: await r.text() })).catch(() => null);
  if (!home?.ok) return null;
  const tag = home.html.match(/<link\b[^>]*\btype=["']application\/opensearchdescription\+xml["'][^>]*>/i)?.[0];
  const href = tag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (href) {
    try {
      const t = openSearchTemplate((await fetchPage(new URL(href.replace(/&amp;/g, '&'), home.url).href).catch(() => null))?.html ?? '');
      if (t) return t;
    } catch {}
  }
  return searchFormTemplate(home.html, home.url);
}
/** The page's own search form as a URL template: GET, a real action, its search box as {q}, hidden fields kept. */
export function searchFormTemplate(html, base) {
  const attr = (tag, a) => tag.match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? '';
  const BOX = /^(q|query|search|searchterm|search_query|keyword|keywords|field-keywords|k|st|_nkw|term|text|s|p|w|ss|kw|searchtext|search-term)$/i;
  let best = null;
  for (const m of String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const form = m[1], body = m[2];
    if ((attr(form, 'method') || 'get').toLowerCase() !== 'get') continue;
    const action = attr(form, 'action').replace(/&amp;/g, '&');
    if (!action || action === '#' || /^(javascript|mailto):/i.test(action)) continue;
    const inputs = [...body.matchAll(/<input\b[^>]*>/gi)].map((x) => x[0]);
    const box = inputs.find((i) => /type\s*=\s*["']search/i.test(i) && attr(i, 'name'))
      ?? inputs.find((i) => BOX.test(attr(i, 'name')) && !/type\s*=\s*["'](hidden|submit|checkbox|radio)/i.test(i))
      ?? inputs.find((i) => /search/i.test(`${attr(i, 'placeholder')} ${attr(i, 'aria-label')} ${attr(i, 'id')}`) && attr(i, 'name') && !/type\s*=\s*["'](hidden|submit)/i.test(i));
    if (!box) continue;
    const score = (/role\s*=\s*["']search/i.test(form) ? 2 : 0) + (/search|\/s\b|results|find/i.test(action) ? 2 : 0) + (/type\s*=\s*["']search/i.test(box) ? 1 : 0);
    if (best && best.score >= score) continue;
    let u;
    try { u = new URL(action, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const params = new URLSearchParams(u.search);
    for (const h of inputs.filter((i) => /type\s*=\s*["']hidden/i.test(i) && attr(i, 'name'))) params.set(attr(h, 'name'), attr(h, 'value').replace(/&amp;/g, '&'));
    params.set(attr(box, 'name'), '__Q__');
    u.search = params.toString();
    best = { score, tpl: u.href.replace('__Q__', '{q}') };
  }
  return best?.tpl ?? null;
}
on('net:preconnect', (url) => { if (/^https?:\/\//i.test(url)) tabsSession().preconnect({ url, numSockets: 2 }); });

handle('deepgram:open', (params) => deepgram.open({ keyterms: (params?.keyterms ?? []).slice(0, 50).map(String) }));
on('deepgram:audio', (chunk) => deepgram.sendAudio(chunk));
on('deepgram:control', (message) => deepgram.sendControl(message));
handle('deepgram:close', () => deepgram.close());

handle('tab:screenshot', async (webContentsId) => {
  const wc = webContents.fromId(Number(webContentsId));
  if (!wc || wc.hostWebContents !== win.webContents) return null;
  const image = await wc.capturePage();
  return image.resize({ width: Math.min(1280, image.getSize().width) }).toJPEG(50).toString('base64');
});

handle('catalog:get', () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'data/apple-catalog.json'), 'utf8')); } catch { return null; } });

// Traces (DIXI_DEBUG=1): one JSON line per stage event, local only, no secrets, no page content.
const traceDir = path.join(app.getPath('userData'), 'traces');
on('trace:write', (line) => {
  if (!config.env.DIXI_DEBUG && !EVAL) return;
  try { fs.mkdirSync(traceDir, { recursive: true }); fs.appendFileSync(path.join(traceDir, `${new Date().toISOString().slice(0, 10)}.jsonl`), `${String(line).slice(0, 4000)}\n`); } catch {}
});

// A failed step's screen, next to its trace line (same switch as traces). Returns the file path.
handle('trace:shot', async (webContentsId, name) => {
  if (!config.env.DIXI_DEBUG && !EVAL) return null;
  const wc = webContents.fromId(Number(webContentsId));
  if (!wc || wc.hostWebContents !== win.webContents) return null;
  const dir = path.join(traceDir, new Date().toISOString().slice(0, 10));
  const file = path.join(dir, `${String(name).replace(/[^\w.-]+/g, '-').slice(0, 80)}.jpg`);
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, (await wc.capturePage()).toJPEG(60)); return file; } catch (err) { console.warn('[trace] screenshot not saved:', err.message); return null; }
});
handle('shell:open-external', (url) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); });
