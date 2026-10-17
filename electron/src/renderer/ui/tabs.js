// Tabs as <webview> elements. Page work runs in each tab's ISOLATED world through the main process
// (window.dixi.tabExec), with a timeout, so a hung page can't block the app and pages can't spoof it.
// URL/title/loading come from the tab's own events (no synchronous IPC in hot paths). Typing uses the
// browser's real input path (insertText + key events), so sites that ignore synthetic events still work.

import { dxCall } from './pagekit.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;

// A webview pointed at about:blank never fires dom-ready; an empty data page behaves like a normal page.
const BLANK = 'data:text/html;charset=utf-8,<title>New Tab</title>';

/** Only http(s) (and our blank page) may be opened; anything else from a model or page is refused. */
export function normalizeURL(input) {
  const s = String(input ?? '').trim();
  if (s === 'about:blank' || s === '') return BLANK;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^\s/:]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(s)) return null;  // javascript:, file:, data:...
  if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export class TabManager {
  constructor(container, onChange = () => {}) {
    this.container = container;
    this.onChange = onChange;
    this.tabs = [];          // {id, webview, title, url, loading, ready, background, navs}
    this.activeIndex = -1;
  }

  get activeTab() { return this.tabs[this.activeIndex] ?? null; }
  get visibleTabs() { return this.tabs.filter((t) => !t.background); }

  makeWebview(url, background) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:dixi-tabs');
    wv.className = background ? 'tab background' : 'tab';
    const tab = { id: nextId++, webview: wv, title: '', url: url || 'about:blank', loading: true, ready: false, background, wcId: null, waiters: [] };
    const fire = (type) => { for (const w of tab.waiters.splice(0)) w(type); };
    wv.addEventListener('dom-ready', () => { tab.ready = true; try { tab.wcId = wv.getWebContentsId(); } catch {} fire('dom-ready'); });
    wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; this.onChange(); });
    wv.addEventListener('did-navigate', (e) => { if (e.url.startsWith('data:')) return; tab.url = e.url; tab.title = ''; fire('navigate'); this.onChange(); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { tab.url = e.url; fire('navigate'); this.onChange(); } });
    wv.addEventListener('did-start-loading', () => { tab.loading = true; this.onChange(); });
    wv.addEventListener('did-stop-loading', () => { tab.loading = false; fire('stop'); this.onChange(); });
    wv.addEventListener('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode !== -3) { tab.failed = e.errorDescription; fire('fail'); } });
    wv.addEventListener('render-process-gone', () => { tab.crashed = true; tab.loading = false; fire('fail'); this.onChange(); });
    wv.src = normalizeURL(url) ?? BLANK;
    this.container.appendChild(wv);
    return tab;
  }

  createTab(url) {
    const tab = this.makeWebview(url, false);
    this.tabs.push(tab);
    this.show(this.tabs.length - 1);
    return tab;
  }

  createBackgroundTab(url) { const tab = this.makeWebview(url, true); this.tabs.push(tab); return tab.id; }

  closeTab(id) {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const active = this.activeTab;
    this.tabs[i].webview.remove();
    this.tabs.splice(i, 1);
    this.activeIndex = active && active.id !== id ? this.tabs.indexOf(active) : Math.min(this.activeIndex, this.tabs.length - 1);
    this.show(this.activeIndex);
  }

  show(index) {
    this.activeIndex = index;
    this.tabs.forEach((t, i) => {
      t.webview.classList.toggle('active', i === index);
      // A tab you leave stops making noise (hidden tabs otherwise play on at full speed).
      if (i !== index && t.ready && !t.background) this.exec(t.id, dxCall('media', 'pause'), 1000).catch(() => {});
    });
    this.onChange();
  }

  switchToTab(visibleIndex) { const tab = this.visibleTabs[visibleIndex]; if (!tab) return false; this.show(this.tabs.indexOf(tab)); return true; }
  switchBy(delta) { const vis = this.visibleTabs; if (vis.length < 2) return; this.switchToTab((vis.indexOf(this.activeTab) + delta + vis.length) % vis.length); }

  tab(tabId) { return tabId == null ? this.activeTab : this.tabs.find((t) => t.id === tabId); }
  getCurrentURL(tabId) { const t = this.tab(tabId); if (!t) return 'about:blank'; return t.url.startsWith('data:') ? 'about:blank' : t.url; }
  displayURL() { try { return new URL(this.getCurrentURL()).hostname; } catch { return ''; } }
  async getTitle(tabId) { return this.tab(tabId)?.title ?? ''; }
  tabList() { return this.visibleTabs.map((t, i) => `[${i}] ${(t.title || this.getCurrentURL(t.id)).slice(0, 50)}`).join(', '); }
  isLoading(tabId) { const t = this.tab(tabId); return Boolean(t && (t.loading || !t.ready)); }
  canGoBack() { const t = this.activeTab; try { return Boolean(t?.ready && t.webview.canGoBack()); } catch { return false; } }

  /** Next event of the given types on a tab (or null after the timeout). */
  next(tab, types, timeoutMs) {
    if (types.length === 1 && types[0] === 'dom-ready' && tab.ready) return Promise.resolve('dom-ready');
    return new Promise((resolve) => {
      const t = setTimeout(() => { tab.waiters = tab.waiters.filter((w) => w !== on); resolve(null); }, timeoutMs);
      const on = (type) => { if (!types.includes(type) && type !== 'fail') { tab.waiters.push(on); return; } clearTimeout(t); resolve(type); };
      tab.waiters.push(on);
    });
  }

  /** Runs page code in the tab's isolated world; resolves to its result or 'JS error: …' (never hangs). */
  async exec(tabId, code, timeoutMs = 8000) {
    const t = this.tab(tabId);
    if (!t) return 'JS error: no tab';
    if (!t.ready) await this.next(t, ['dom-ready'], timeoutMs);
    if (!t.wcId) return 'JS error: tab not ready';
    try { return await window.dixi.tabExec(t.wcId, code, timeoutMs); } catch (err) { return `JS error: ${err.message}`; }
  }

  /** Toolkit call in the active tab (see pagekit.js). */
  /** Toolkit call in the active tab; a page error is "no answer" (null), never a truthy string. */
  async dx(fn, ...args) {
    const r = await this.exec(null, dxCall(fn, ...args));
    if (typeof r === 'string' && r.startsWith('JS error')) { console.warn('[page]', fn, r.slice(0, 120)); return null; }
    return r;
  }

  // Kept for page Q&A (plain text read), returns a string.
  async executeJS(code, tabId) { const r = await this.exec(tabId, code); return typeof r === 'string' ? r : JSON.stringify(r ?? null); }

  /**
   * Starts loading a URL. Resolves when the page has committed (the new URL is current), not when every
   * image is in; callers that need the DOM use waitForDom(). Refuses non-http(s) URLs.
   */
  async navigate(url, tabId) {
    const t = this.tab(tabId) ?? this.createTab('about:blank');
    const target = normalizeURL(url);
    if (!target) throw new Error(`Refused to open "${String(url).slice(0, 60)}"`);
    t.failed = null;
    // A brand-new tab can't take loadURL until its blank page is attached; until then, set src instead.
    if (!t.ready) await this.next(t, ['dom-ready'], 1500);
    const committed = this.next(t, ['navigate'], 15000);
    if (t.ready) t.webview.loadURL(target).catch((err) => { if (/attached|dom-ready/i.test(err?.message ?? '')) t.webview.src = target; });
    else { t.url = target; t.webview.src = target; }
    const r = await committed;
    if (r === 'fail' || t.failed) throw new Error(t.failed ? `The page didn't load (${t.failed})` : 'The page didn\'t load');
    return r;
  }

  /** The new page's DOM exists (dom-ready for this load), without waiting for it to stop changing. */
  async waitForReady(tabId, maxMs = 5000) {
    const t = this.tab(tabId);
    if (t?.loading) await this.next(t, ['dom-ready', 'stop'], maxMs);
  }

  /** The DOM is there (dom-ready for this load) and has stopped changing for a moment. */
  async waitForDom(tabId, maxMs = 6000) {
    const t = this.tab(tabId);
    if (!t) return;
    const start = Date.now();
    if (t.loading) await this.next(t, ['dom-ready', 'stop'], maxMs);
    const left = Math.max(300, maxMs - (Date.now() - start));
    await this.exec(t.id, dxCall('quiet', 200, Math.min(1500, left)), left + 500);
  }

  async waitUntilLoaded(timeoutS = 10, tabId) { await this.waitForDom(tabId, timeoutS * 1000); }

  async goBack(tabId) { const t = this.tab(tabId); if (t?.ready && t.webview.canGoBack()) { const n = this.next(t, ['navigate'], 8000); t.webview.goBack(); await n; } }
  async goForward() { const t = this.activeTab; if (t?.ready && t.webview.canGoForward()) { const n = this.next(t, ['navigate'], 8000); t.webview.goForward(); await n; } }
  reload() { this.activeTab?.webview.reload(); }

  /** Real typing into whatever has focus in the page (trusted events; works in React inputs, shadow DOM, iframes). */
  async typeText(text, { submit = false } = {}, tabId) {
    const t = this.tab(tabId);
    if (!t?.ready) return;
    t.webview.focus();
    await t.webview.insertText(text);
    if (submit) await this.key('Return', tabId);
  }
  /** A real (trusted) mouse click at page coordinates, for controls that ignore script clicks. */
  async clickAt({ x, y }, tabId) {
    const t = this.tab(tabId);
    if (!t?.ready) return;
    const z = t.webview.getZoomFactor?.() ?? 1;
    const p = { x: Math.round(x * z), y: Math.round(y * z), button: 'left', clickCount: 1 };
    t.webview.sendInputEvent({ type: 'mouseMove', ...p });
    t.webview.sendInputEvent({ type: 'mouseDown', ...p });
    t.webview.sendInputEvent({ type: 'mouseUp', ...p });
    await sleep(30);
  }
  async key(keyCode, tabId) {
    const t = this.tab(tabId);
    if (!t?.ready) return;
    t.webview.sendInputEvent({ type: 'keyDown', keyCode });
    if (keyCode === 'Return') t.webview.sendInputEvent({ type: 'char', keyCode: '\r' });
    t.webview.sendInputEvent({ type: 'keyUp', keyCode });
    await sleep(30);
  }

  async scroll(direction, amount = 600, tabId) {
    await this.exec(tabId, `window.scrollBy({top: ${direction === 'down' ? amount : -amount}, behavior: 'instant'})`);
  }

  async screenshot() { const t = this.activeTab; if (!t?.wcId) return null; return window.dixi.screenshot(t.wcId); }
}
