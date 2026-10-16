// Tabs as <webview> elements (ported from TabManager.swift). Page scripts are the same as the
// Swift app's: indexed visible elements, click/type by index, DOM-settle waits.

const EXTRACT_JS = `(function() {
  var selectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [onclick], [contenteditable="true"]';
  var els = Array.from(document.querySelectorAll(selectors));
  var results = []; var refs = []; var idx = 0;
  for (var el of els) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    if (rect.right < 0 || rect.left > window.innerWidth) continue;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    if (el.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') continue;
    refs.push(el);
    results.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 80),
      id: el.id || '', role: el.getAttribute('role') || '', href: el.href || '', placeholder: el.placeholder || '',
      cx: Math.round(rect.x + rect.width / 2), cy: Math.round(rect.y + rect.height / 2), index: idx });
    idx++;
  }
  window.__runic_elements = refs;
  return JSON.stringify(results);
})()`;

const clickJS = (el) => `(function() {
  var el = (window.__runic_elements || [])[${el.index}] || document.elementFromPoint(${el.cx}, ${el.cy});
  if (!el) return 'no element found';
  if (el.tagName === 'SELECT') { el.focus(); el.click(); return 'select clicked'; }
  if (el.getAttribute('role') === 'combobox' || el.classList.contains('dropdown') || el.classList.contains('select')) {
    el.focus(); el.click();
    setTimeout(function() { if (el.getAttribute('aria-expanded') === 'false') el.click(); }, 50);
    return 'dropdown clicked: ' + el.tagName;
  }
  el.click(); return 'clicked: ' + el.tagName;
})()`;

const typeJS = (el, text, pressEnter) => `(function() {
  var el = (window.__runic_elements || [])[${el.index}] || document.elementFromPoint(${el.cx}, ${el.cy});
  if (!el) return 'no element found';
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable) {
    var inner = el.querySelector('input, textarea, [contenteditable="true"]'); if (inner) el = inner;
  }
  var text = ${JSON.stringify(text)};
  el.focus(); el.click();
  function enter() {
    ${pressEnter ? `['keydown','keypress','keyup'].forEach(function(t) { el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); });
    var form = el.closest('form'); if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }` : ''}
  }
  if (el.isContentEditable) { el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })); enter(); return 'typed (contenteditable)'; }
  var setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value');
  if (setter && setter.set) setter.set.call(el, text); else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  enter(); return 'typed into: ' + el.tagName;
})()`;

const SETTLE_JS = `(function() {
  if (!window.__runic_mo) {
    window.__runic_mo_changed = false;
    window.__runic_mo = new MutationObserver(function() { window.__runic_mo_changed = true; });
    window.__runic_mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
  var c = window.__runic_mo_changed; window.__runic_mo_changed = false; return c ? 'changed' : 'stable';
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;

// A webview pointed at about:blank never fires dom-ready, and its late "navigated to about:blank"
// event overwrote the first real navigation (voice's first command did nothing). An empty data page
// behaves like a normal page; getCurrentURL still reports it as about:blank.
const BLANK = 'data:text/html;charset=utf-8,<title>New Tab</title>';

export function normalizeURL(input) {
  const s = input.trim();
  if (s === 'about:blank') return BLANK;
  if (s.includes('://')) return s;
  if (s.includes('.') && !s.includes(' ')) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

export class TabManager {
  constructor(container, onChange = () => {}) {
    this.container = container;
    this.onChange = onChange;
    this.tabs = [];          // {id, webview, title, url, background}
    this.activeIndex = -1;
  }

  get activeTab() { return this.tabs[this.activeIndex] ?? null; }
  get visibleTabs() { return this.tabs.filter((t) => !t.background); }

  makeWebview(url, background) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:runic-tabs');
    wv.setAttribute('allowpopups', '');
    wv.className = background ? 'tab background' : 'tab';
    const tab = { id: nextId++, webview: wv, title: '', url, background, ready: false };
    tab.domReady = new Promise((r) => wv.addEventListener('dom-ready', () => { tab.ready = true; r(); }, { once: true }));
    wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; this.onChange(); });
    wv.addEventListener('did-navigate', (e) => { if (!e.url.startsWith('data:')) tab.url = e.url; this.onChange(); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { tab.url = e.url; this.onChange(); } });
    wv.addEventListener('did-start-loading', () => this.onChange());
    wv.addEventListener('did-stop-loading', () => this.onChange());
    wv.src = normalizeURL(url);
    this.container.appendChild(wv);
    return tab;
  }

  createTab(url) {
    const tab = this.makeWebview(url, false);
    this.tabs.push(tab);
    this.show(this.tabs.length - 1);
    return tab;
  }

  /** Hidden tab for fork_tasks sub-agents. Returns its id. */
  createBackgroundTab(url) {
    const tab = this.makeWebview(url, true);
    this.tabs.push(tab);
    return tab.id;
  }

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
    this.tabs.forEach((t, i) => t.webview.classList.toggle('active', i === index));
    this.onChange();
  }

  switchToTab(visibleIndex) {
    const tab = this.visibleTabs[visibleIndex];
    if (!tab) return false;
    this.show(this.tabs.indexOf(tab));
    return true;
  }

  switchBy(delta) {
    const vis = this.visibleTabs;
    if (vis.length < 2) return;
    const cur = vis.indexOf(this.activeTab);
    this.switchToTab((cur + delta + vis.length) % vis.length);
  }

  tab(tabId) { return tabId == null ? this.activeTab : this.tabs.find((t) => t.id === tabId); }

  getCurrentURL(tabId) {
    const t = this.tab(tabId);
    if (!t) return 'about:blank';
    let u;
    try { u = t.ready ? t.webview.getURL() : t.url; } catch { u = t.url; }
    return u.startsWith('data:text/html') ? 'about:blank' : u;
  }
  displayURL() { try { return new URL(this.getCurrentURL()).hostname; } catch { return ''; } }
  async getTitle(tabId) { const t = this.tab(tabId); try { return t?.webview.getTitle() ?? ''; } catch { return t?.title ?? ''; } }
  tabList() { return this.visibleTabs.map((t, i) => `[${i}] ${t.title || this.getCurrentURL(t.id)}`).join(', '); }
  // A tab that hasn't finished its first load yet counts as loading (a navigation is pending).
  isLoading(tabId) { const t = this.tab(tabId); if (!t) return false; try { return !t.ready || t.webview.isLoading(); } catch { return true; } }
  canGoBack() { const t = this.activeTab; try { return Boolean(t?.ready && t.webview.canGoBack()); } catch { return false; } }

  async executeJS(code, tabId) {
    const t = this.tab(tabId);
    if (!t) return 'Error: no active tab';
    await t.domReady;
    try {
      const r = await t.webview.executeJavaScript(code);
      if (r == null) return 'null';
      return typeof r === 'string' ? r : JSON.stringify(r).slice(0, 2000);
    } catch (err) { return `JS error: ${err.message}`; }
  }

  async navigate(url, tabId) {
    const t = this.tab(tabId) ?? this.createTab('about:blank');
    const target = normalizeURL(url);
    if (!t.ready) {
      // A fresh tab may never fire dom-ready for about:blank (voice's first command hung on this),
      // and loadURL needs it; before that, pointing src at the URL is the way to navigate.
      t.url = target;
      t.webview.src = target;
    } else {
      try { await t.webview.loadURL(target); } catch { /* aborted by a newer navigation: fine */ }
    }
    await this.waitUntilLoaded(10, t.id);
  }

  async goBack(tabId) { const t = this.tab(tabId); if (t?.ready && t.webview.canGoBack()) { t.webview.goBack(); await this.waitUntilLoaded(10, t.id); } }
  async goForward() { const t = this.activeTab; if (t?.ready && t.webview.canGoForward()) { t.webview.goForward(); await this.waitUntilLoaded(); } }
  reload() { this.activeTab?.webview.reload(); }

  async scroll(direction, amount, tabId) {
    await this.executeJS(`window.scrollBy(0, ${direction === 'down' ? amount : -amount});`, tabId);
    await this.waitUntilSettled(1.5, tabId);
  }

  async extractElements(tabId) {
    try { return JSON.parse(await this.executeJS(EXTRACT_JS, tabId)); } catch { return []; }
  }

  async click(el, tabId) { await this.executeJS(clickJS(el), tabId); await this.waitUntilLoaded(10, tabId); }
  async type(el, text, pressEnter, tabId) { await this.executeJS(typeJS(el, text, pressEnter), tabId); if (pressEnter) await this.waitUntilLoaded(10, tabId); }

  async screenshot() {
    const t = this.activeTab;
    if (!t?.ready) return null;
    return window.runic.screenshot(t.webview.getWebContentsId());
  }

  async waitUntilLoaded(timeoutS = 10, tabId) {
    const t = this.tab(tabId);
    if (!t) return;
    const start = Date.now();
    await Promise.race([t.domReady, sleep(timeoutS * 1000)]);
    while (this.isLoading(t.id) && Date.now() - start < timeoutS * 1000) await sleep(150);
    await sleep(100);
    await this.waitUntilSettled(Math.max(0, timeoutS - (Date.now() - start) / 1000), t.id);
  }

  async waitUntilSettled(timeoutS = 3, tabId) {
    const start = Date.now();
    let stable = 0;
    while ((Date.now() - start) / 1000 < timeoutS) {
      stable = (await this.executeJS(SETTLE_JS, tabId)) === 'changed' ? 0 : stable + 1;
      if (stable >= 2) return;
      await sleep(150);
    }
  }
}
