// Your own browser, driven like Dixi's: the same page toolkit (renderer/ui/pagekit.js) and the same shopping
// executor (renderer/core/execute.js) act on the tab in front of you in Chrome (and Brave, Edge, Arc, Vivaldi)
// or Safari — your sign-ins, your cart — by reading and pressing the page's own elements. No screenshots, no
// mouse: one Apple Event per page call (~10–40 ms) through one long-lived JavaScript-for-Automation worker.
//
// Needs, once: the browser's "Allow JavaScript from Apple Events" (Chrome: View > Developer; Safari: Develop
// menu) and macOS's Automation permission for Dixi to control the browser.
import { spawn as nodeSpawn } from 'node:child_process';
import { DX, PAGE_LIB, dxCall } from '../renderer/ui/pagekit.js';

export const BROWSERS = {
  'com.google.Chrome': { app: 'Google Chrome', kind: 'chromium' },
  'com.google.Chrome.beta': { app: 'Google Chrome Beta', kind: 'chromium' },
  'com.brave.Browser': { app: 'Brave Browser', kind: 'chromium' },
  'com.microsoft.edgemac': { app: 'Microsoft Edge', kind: 'chromium' },
  'company.thebrowser.Browser': { app: 'Arc', kind: 'chromium' },
  'com.vivaldi.Vivaldi': { app: 'Vivaldi', kind: 'chromium' },
  'com.apple.Safari': { app: 'Safari', kind: 'safari' },
};
/** The browser in front, from the app's bundle id or name, or null. */
export function browserOf({ bundle = '', app = '' } = {}) {
  if (BROWSERS[bundle]) return BROWSERS[bundle];
  return Object.values(BROWSERS).find((b) => b.app.toLowerCase() === String(app).toLowerCase()) ?? null;
}

// The worker: reads {id, op, app, kind, js?, url?} lines, answers {id, value?, url, title, loading, error?} lines.
// The JavaScript runs in the page; its result comes back as a JSON string (Apple Events carry only plain values).
export const WORKER_JXA = `ObjC.import('Foundation');
const IN = $.NSFileHandle.fileHandleWithStandardInput, OUT = $.NSFileHandle.fileHandleWithStandardOutput;
const emit = (o) => OUT.writeData($(JSON.stringify(o) + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));
const apps = {};
function tabOf(m) {
  const A = apps[m.app] || (apps[m.app] = Application(m.app));
  if (!A.windows.length) throw new Error('no window');
  const w = A.windows[0];
  return { A, w, t: m.kind === 'chromium' ? w.activeTab : w.currentTab };
}
function state(m, A, t) {
  const c = m.kind === 'chromium';
  return { url: String(t.url() || ''), title: String((c ? t.title() : t.name()) || ''), loading: c ? Boolean(t.loading()) : null };
}
function handle(m) {
  const { A, w, t } = tabOf(m);
  const c = m.kind === 'chromium';
  if (m.op === 'js') { const v = c ? t.execute({ javascript: m.js }) : A.doJavaScript(m.js, { in: t }); return Object.assign({ value: v === undefined ? null : v }, state(m, A, t)); }
  if (m.op === 'go') { t.url = m.url; return state(m, A, t); }
  if (m.op === 'newtab') { if (c) { w.tabs.push(A.Tab({ url: m.url || 'about:blank' })); } else { const n = A.Tab({ url: m.url || 'about:blank' }); w.tabs.push(n); w.currentTab = n; } return state(m, A, c ? w.activeTab : w.currentTab); }
  if (m.op === 'close') { if (c) t.close(); else t.close(); return {}; }
  if (m.op === 'front') { A.activate(); return state(m, A, t); }
  return state(m, A, t);
}
let buf = '';
for (;;) {
  const d = IN.availableData;
  if (!d || d.length === 0) break;
  buf += $.NSString.alloc.initWithDataEncoding(d, $.NSUTF8StringEncoding).js;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m; try { m = JSON.parse(line); } catch (e) { continue; }
    try { emit(Object.assign({ id: m.id }, handle(m))); } catch (e) { emit({ id: m.id, error: String(e && e.message || e) }); }
  }
}`;

/** "Executing JavaScript through AppleScript is turned off…" and its Safari twin. */
export const JS_OFF = /turned off|allow javascript from apple events|not allowed to execute javascript|javascript from apple events/i;
export const NO_AUTOMATION = /-1743|not authori[sz]ed to send apple events|not allowed to send apple events/i;

/**
 * One long-lived worker; restarted if it dies or a call hangs. call(msg, timeoutMs) → the worker's answer
 * ({error} on a failure, never a throw).
 */
export function makeBridge({ spawn = nodeSpawn, log = () => {} } = {}) {
  let child = null, n = 0, buf = '';
  const waiting = new Map();
  const start = () => {
    child = spawn('osascript', ['-l', 'JavaScript', '-e', WORKER_JXA], { stdio: ['pipe', 'pipe', 'pipe'] });
    buf = '';
    child.stdout.on('data', (d) => {
      buf += d; const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { let m; try { m = JSON.parse(l); } catch { continue; } waiting.get(m.id)?.(m); }
    });
    child.stderr?.on('data', (d) => log(`[realtabs] ${String(d).trim().slice(0, 300)}`));
    const me = child;
    child.on('exit', () => { if (child === me) child = null; for (const done of waiting.values()) done({ error: 'the browser bridge stopped' }); });
    child.on('error', (err) => log(`[realtabs] couldn't start osascript: ${err.message}`));
  };
  return {
    call(msg, timeoutMs = 8000) {
      if (!child) start();
      const id = ++n;
      return new Promise((resolve) => {
        const timer = setTimeout(() => { waiting.delete(id); log(`[realtabs] ${msg.op} timed out`); child?.kill(); child = null; resolve({ error: 'the browser did not answer in time' }); }, timeoutMs);
        waiting.set(id, (m) => { clearTimeout(timer); waiting.delete(id); resolve(m); });
        try { child.stdin.write(`${JSON.stringify({ ...msg, id })}\n`); } catch { resolve({ error: 'the browser bridge stopped' }); }
      });
    },
    stop() { child?.kill(); child = null; },
  };
}

/**
 * Page code as one expression that returns a JSON string. Toolkit calls (`${PAGE_LIB}\n<call>`) install the
 * toolkit first. A promise (the toolkit's quiet()) is kept in the page and read back by polling.
 */
export function wrapJS(code, key = 0) {
  const s = String(code);
  const [head, expr] = s.startsWith(PAGE_LIB) ? [PAGE_LIB, s.slice(PAGE_LIB.length)] : ['', s];
  return `${head}\n;(function(){try{var v=(${expr.trim().replace(/;+\s*$/, '')});`
    + `if(v&&typeof v.then==='function'){var P=window.__dxp||(window.__dxp={});P[${key}]=undefined;v.then(function(r){P[${key}]=JSON.stringify(r===undefined?null:r)},function(e){P[${key}]=JSON.stringify({__e:String(e)})});return JSON.stringify({__p:${key}})}`
    + `return JSON.stringify(v===undefined?null:v)}catch(e){return JSON.stringify({__e:String(e&&e.message||e)})}})()`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The executor's `tabs`, for the front tab of your own browser. Same contract as renderer/ui/tabs.js. */
export class RealTabs {
  constructor({ bridge, browser, keys = {}, now = () => Date.now() }) {
    this.bridge = bridge; this.browser = browser; this.keys = keys; this.now = now;
    this.url = 'about:blank'; this.title = ''; this.loading = false; this.ready = true; this.problem = null; this.p = 0;
    this.activeTab = { id: 1 };
    Object.defineProperty(this.activeTab, 'title', { get: () => this.title });
  }
  get visibleTabs() { return [this.activeTab]; }
  note(m) {
    if (typeof m?.url === 'string' && m.url) this.url = m.url;
    if (typeof m?.title === 'string') this.title = m.title;
    if (typeof m?.loading === 'boolean') this.loading = m.loading;
  }
  async ask(msg, timeoutMs) {
    const m = await this.bridge.call({ app: this.browser.app, kind: this.browser.kind, ...msg }, timeoutMs);
    if (m.error) this.problem = JS_OFF.test(m.error) ? 'js-off' : NO_AUTOMATION.test(m.error) ? 'automation' : this.problem;
    this.note(m);
    return m;
  }
  /** Fresh URL/title/loading (the sync getters below read what the last call saw). */
  async refresh() { await this.ask({ op: 'state' }, 3000); return this.url; }
  getCurrentURL() { return /^(https?|about):/.test(this.url) ? this.url : 'about:blank'; }
  displayURL() { try { return new URL(this.getCurrentURL()).hostname; } catch { return ''; } }
  async getTitle() { return this.title; }
  tabList() { return `[0] ${(this.title || this.url).slice(0, 50)}`; }
  isLoading() { return this.loading; }
  canGoBack() { return true; }

  /** Runs page code in the front tab; resolves to its value or 'JS error: …' (never hangs). */
  async exec(_tabId, code, timeoutMs = 8000) {
    const key = ++this.p;
    const m = await this.ask({ op: 'js', js: wrapJS(code, key) }, timeoutMs + 1000);
    if (m.error) return `JS error: ${m.error}`;
    let v;
    try { v = JSON.parse(m.value); } catch { return m.value ?? null; }
    if (v && typeof v === 'object' && '__e' in v) return `JS error: ${v.__e}`;
    if (v && typeof v === 'object' && v.__p === key) {   // a promise: read it back until it settles
      for (const until = this.now() + timeoutMs; this.now() < until; await sleep(100)) {
        const r = await this.ask({ op: 'js', js: `(function(){var x=window.__dxp&&window.__dxp[${key}];return x===undefined?'"__wait"':x})()` }, 3000);
        if (r.error) return `JS error: ${r.error}`;
        let x; try { x = JSON.parse(r.value); } catch { x = null; }
        if (x !== '__wait') return x && typeof x === 'object' && '__e' in x ? `JS error: ${x.__e}` : x;
      }
      return null;
    }
    return v;
  }
  async dx(fn, ...args) {
    const r = await this.exec(null, dxCall(fn, ...args));
    return typeof r === 'string' && r.startsWith('JS error') ? null : r;
  }
  async executeJS(code) { const r = await this.exec(null, code); return typeof r === 'string' ? r : JSON.stringify(r ?? null); }

  /** Waits for something about the tab: 'navigate' = the address changed; 'dom-ready'/'stop' = loaded. */
  async next(_tab, types, timeoutMs = 8000) {
    const from = this.url;
    for (const until = this.now() + timeoutMs; this.now() < until; await sleep(120)) {
      const m = await this.ask({ op: 'js', js: 'JSON.stringify(document.readyState)' }, 3000);
      let rs = null; try { rs = JSON.parse(m.value); } catch {}
      if (this.browser.kind === 'safari') this.loading = rs !== 'complete';
      if (types.includes('navigate') && this.url !== from) return 'navigate';
      if ((types.includes('dom-ready') && rs && rs !== 'loading') || (types.includes('stop') && rs === 'complete' && !this.loading)) return types.includes('stop') && rs === 'complete' ? 'stop' : 'dom-ready';
    }
    return null;
  }
  createTab(url = 'about:blank') { this.ask({ op: 'newtab', url }); return 1; }
  createBackgroundTab(url) { return this.createTab(url); }
  closeTab() { this.ask({ op: 'close' }); }
  switchToTab() { return true; }
  switchBy(d) { return this.keys.key?.(d > 0 ? 'ctrl+tab' : 'ctrl+shift+tab'); }

  /** Starts loading a URL in the front tab; resolves once the address has changed. https/http only. */
  async navigate(url) {
    let u;
    try { u = new URL(/^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`); } catch { throw new Error(`Refused to open "${String(url).slice(0, 60)}"`); }
    if (!/^https?:$/.test(u.protocol)) throw new Error(`Refused to open "${String(url).slice(0, 60)}"`);
    const before = this.url, t0 = this.now();
    const m = await this.ask({ op: 'go', url: u.href }, 5000);
    if (m.error) throw new Error(`The page didn't load (${m.error})`);
    this.loading = true;
    // Committed = the address changed (or, for the same address, 1.5 s passed) and the new document is parsed.
    for (const until = t0 + 15000; this.now() < until; await sleep(120)) {
      const r = await this.ask({ op: 'js', js: 'JSON.stringify(document.readyState)' }, 3000);
      let rs = null; try { rs = JSON.parse(r.value); } catch {}
      const moved = this.url !== before || (before === u.href && this.now() - t0 > 1500);
      if (moved && rs && rs !== 'loading') { if (this.browser.kind === 'safari') this.loading = rs !== 'complete'; return 'navigate'; }
    }
    throw new Error("The page didn't load");
  }
  async waitForReady(_t, maxMs = 5000) { await this.next(null, ['dom-ready'], maxMs); }
  /** Loaded, and the page has stopped changing for a moment (its text length steady over two reads). */
  async waitForDom(_t, maxMs = 6000) {
    const end = this.now() + maxMs;
    await this.next(null, ['dom-ready'], Math.max(300, maxMs));
    let last = -1;
    while (this.now() < end) {
      const n = await this.exec(null, '(document.body ? document.body.innerText.length + document.querySelectorAll("*").length : 0)', 2000);
      if (n === last) return;
      last = n;
      await sleep(200);
    }
  }
  async waitUntilLoaded(s = 10) { await this.waitForDom(null, s * 1000); }
  async goBack() { const before = this.url; await this.exec(null, 'history.back()'); if (this.url === before) await this.next(null, ['navigate'], 6000); }
  async goForward() { await this.exec(null, 'history.forward()'); await this.next(null, ['navigate'], 6000); }
  reload() { this.exec(null, 'location.reload()'); }
  async scroll(direction, amount = 600) { await this.exec(null, `window.scrollBy({top: ${direction === 'down' ? amount : -amount}, behavior: 'instant'})`); }

  /** Real key presses go to the browser in front (input.js), so it's brought forward first. */
  async front() { await this.ask({ op: 'front' }, 3000); }
  async typeText(text, { submit = false } = {}) {
    if (!this.keys.type) return;
    await this.front();
    await this.keys.type(text);
    if (submit) return this.key('Return');
  }
  async key(keyCode) {
    if (keyCode === 'Return') {
      const g = await this.exec(null, dxCall('enterGate'), 2000);
      if (g !== null) return typeof g === 'string' && g.startsWith('confirm') ? g : 'refused: could not check what Enter would press';
    }
    if (!this.keys.key) return;
    await this.front();
    await this.keys.key({ Return: 'return', Escape: 'escape', Tab: 'tab', Down: 'down', Up: 'up', Left: 'left', Right: 'right', Backspace: 'delete' }[keyCode] ?? String(keyCode).toLowerCase());
  }
  /** A real click at page coordinates: the page's own window geometry turns them into screen points. */
  async clickAt({ x, y }) {
    if (!this.keys.click) return;
    const g = await this.exec(null, '[screenX, screenY, outerWidth - innerWidth, outerHeight - innerHeight]');
    if (!Array.isArray(g)) return;
    await this.front();
    await this.keys.click(Math.round(g[0] + g[2] / 2 + x), Math.round(g[1] + g[3] + y));
  }
  async screenshot() { return null; }   // no pictures: the executor works from the page's elements
}

export { DX };
