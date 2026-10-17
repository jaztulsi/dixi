// Page-side toolkit, injected into each tab's ISOLATED world (pages can't see, spoof or override it).
// Generic mechanics only, found by role, accessible name and structure; no site-specific selectors:
// deep queries (open shadow roots, same-origin iframes), search boxes, result lists, add/buy buttons,
// media, overlays, required options, and the purchase gate: every click goes through gate(), and
// typing into password/card/one-time-code fields is refused.
//
// Calls: dxCall('name', ...args) → a JS string that runs window.__dx.name(...args) in the page.

export const PAGE_LIB = String.raw`(() => {
if (window.__dx) return;
const refs = new Map(); let nextRef = 1;
const ref = (el) => { for (const [k, v] of refs) if (v === el) return k; const k = nextRef++; refs.set(k, el); return k; };
const get = (k) => refs.get(k) || null;

// ---- seeing the page ----
function* roots(root = document) {
  yield root;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) yield* roots(el.shadowRoot);
    if (el.tagName === 'IFRAME') { try { if (el.contentDocument) yield* roots(el.contentDocument); } catch {} }
  }
}
const all = (sel) => { const out = []; for (const r of roots()) out.push(...r.querySelectorAll(sel)); return out; };
const frameOffset = (el) => { let x = 0, y = 0, d = el.ownerDocument; while (d && d !== document) { const f = d.defaultView.frameElement; if (!f) break; const r = f.getBoundingClientRect(); x += r.left; y += r.top; d = f.ownerDocument; } return { x, y }; };
const rect = (el) => { const r = el.getBoundingClientRect(), o = frameOffset(el); return { left: r.left + o.x, top: r.top + o.y, width: r.width, height: r.height }; };
function visible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  // An inline link wrapping block content (cards) has an empty box of its own; its content is what shows.
  if (r.width < 2 || r.height < 2) { const c = el.firstElementChild?.getBoundingClientRect(); if (!c || c.width < 2 || c.height < 2) return false; }
  const s = el.ownerDocument.defaultView.getComputedStyle(el);
  // A see-through input laid over a styled label is a real button (a common store pattern): opacity alone doesn't hide it.
  if (s.visibility === 'hidden' || s.display === 'none') return false;
  if (Number(s.opacity) === 0 && !(el.matches('input, button') && el.parentElement && Number(getComputedStyle(el.parentElement).opacity) > 0)) return false;
  return !el.closest('[hidden]');   // aria-hidden hides from screen readers, not from the screen
}
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function name(el) {
  if (!el) return '';
  const by = el.getAttribute('aria-labelledby');
  if (by) { const t = by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent || '').join(' '); if (clean(t)) return clean(t); }
  const label = el.id && el.ownerDocument.querySelector('label[for="' + CSS.escape(el.id) + '"]');
  return clean(el.getAttribute('aria-label') || (label && label.textContent) || el.getAttribute('alt') || el.getAttribute('title')
    || (el.tagName === 'INPUT' ? (el.value && el.type !== 'text' && el.type !== 'search' ? el.value : el.placeholder) : '') || el.innerText || el.textContent || el.value || '').slice(0, 120);
}
const CLICKABLE = 'a[href], button, input[type=submit], input[type=button], [role=button], [role=link], [role=menuitem], [role=option], [role=tab], summary, [onclick]';
const inChrome = (el) => Boolean(el.closest('header, nav, footer, aside, [role=navigation], [role=banner], [role=contentinfo]'));

// ---- the gate: things that can't be undone need a yes; secrets are never typed ----
const IRREVERSIBLE = /\b(place (my |your |the )?order|submit (my |your |the )?order|complete (my |your |the )?(order|purchase)|confirm (and pay|(my |your |the )?(order|purchase|payment))|pay( now| \$| securely)?$|^pay\b|buy now with 1-click|1-click|send( message| email| now)?$|^send\b|delete|remove (account|permanently)|transfer( money| funds)?|realizar pedido|pagar)\b/i;
const SENSITIVE = (el) => el && (el.type === 'password' || /^cc-|one-time-code/.test(el.getAttribute('autocomplete') || '')
  || /card.?number|cvv|cvc|security.?code|\botp\b|verification.?code|passcode/i.test([el.name, el.id, el.getAttribute('aria-label'), el.placeholder].join(' ')));
function gate(el, force) {
  const n = name(el);
  if (!force && IRREVERSIBLE.test(n)) return 'confirm: ' + n.slice(0, 60);
  return null;
}
function click(el, force) {
  const g = gate(el, force);
  if (g) return g;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  el.click();
  return 'ok: ' + name(el).slice(0, 60);
}

// ---- overlays (cookie banners, modals that cover the page) ----
const ACCEPT = /^(accept( all)?( cookies)?|agree|i agree|allow( all)?|got it|ok(ay)?|continue|close|dismiss|no thanks|aceptar( todo)?|accepter|akzeptieren|accetta)$/i;
function dismissOverlays() {
  let n = 0;
  for (const el of all('[role=dialog], [aria-modal=true], dialog[open], [id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [class*=modal i], [class*=overlay i]')) {
    if (!visible(el)) continue;
    const r = rect(el);
    const covers = r.width > innerWidth * 0.5 || r.height > innerHeight * 0.3 || getComputedStyle(el).position === 'fixed';
    if (!covers) continue;
    const b = [...el.querySelectorAll(CLICKABLE)].find((x) => visible(x) && ACCEPT.test(name(x)));
    if (b) { b.click(); n++; }
  }
  return n;
}

// ---- search ----
const SEARCHY = /search|find|look ?up|buscar|recherche|suche|cerca|zoek|pesquis|搜索|検索/i;
function searchInputs() {
  const c = [];
  for (const el of all('input, textarea, [contenteditable=true], [role=searchbox], [role=combobox]')) {
    if (el.tagName === 'INPUT' && !/^(search|text|)$/i.test(el.type)) continue;
    if (SENSITIVE(el)) continue;
    let s = 0;
    if (el.type === 'search' || el.getAttribute('role') === 'searchbox') s += 5;
    if (el.closest('[role=search], form[role=search], form[action*=search i]')) s += 4;
    if (SEARCHY.test([el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title, el.className].join(' '))) s += 3;
    if (el.getAttribute('role') === 'combobox') s += 1;
    if (/^(q|query|search|keywords?|k|s|term|st)$/i.test(el.name || '')) s += 2;
    if (s > 0) c.push([s + (visible(el) ? 3 : 0), el]);
  }
  return c.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}
function findSearch() {
  const os = document.querySelector('link[rel=search][type="application/opensearchdescription+xml"]');
  const input = searchInputs().find(visible);
  if (input) return { how: 'input', ref: ref(input), opensearch: os ? os.href : null };
  // Hidden behind a button ("🔍"): press it, the caller looks again.
  const toggle = all(CLICKABLE).find((x) => visible(x) && SEARCHY.test(name(x)) && !x.closest('form'));
  if (toggle) { toggle.click(); return { how: 'toggle', opensearch: os ? os.href : null }; }
  return { how: 'none', opensearch: os ? os.href : null };
}
function focus(k) {
  const el = get(k);
  if (!el || !el.isConnected) return 'gone';
  if (SENSITIVE(el)) return 'refused';
  el.scrollIntoView({ block: 'center' });
  el.focus();
  if (el.select) el.select(); else { const s = el.ownerDocument.getSelection(); s.selectAllChildren(el); }
  const doc = el.ownerDocument;
  return doc.activeElement === el || doc.activeElement?.shadowRoot || el.getRootNode().activeElement === el ? 'ok' : 'unfocused';
}
/** Is an autocomplete list open with an option highlighted (a bare Enter would pick it, not your words)? */
function suggesting(k) {
  const el = get(k);
  if (!el) return false;
  const lb = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  return el.getAttribute('aria-expanded') === 'true' && (Boolean(el.getAttribute('aria-activedescendant')) || Boolean(lb && el.ownerDocument.getElementById(lb)?.querySelector('[aria-selected=true]')));
}
function closeSuggestions(k) { const el = get(k); if (el) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return suggesting(k) ? 'open' : 'closed'; }
function valueOf(k) { const el = get(k); return el ? (el.value ?? el.textContent ?? '') : ''; }
function submitSearch(k) {
  const el = get(k);
  const form = el && el.closest('form');
  const btn = form && [...form.querySelectorAll('button, input[type=submit]')].find(visible);
  if (btn) { btn.click(); return 'clicked'; }
  if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); return 'submitted'; }
  const near = el && [...(el.parentElement?.querySelectorAll('button, [role=button]') || [])].find(visible);
  if (near) { near.click(); return 'clicked'; }
  return 'none';
}

// ---- result lists: the biggest group of similar links in the main content ----
const SPONSORED = /^(sponsored|ad|ads|advertisement|promoted|patrocinado)\b/i;
function results() {
  const main = document.querySelector('main, [role=main]') || document.body;
  const links = [...main.querySelectorAll('a[href]')].filter((a) => visible(a) && !inChrome(a) && clean(a.innerText).length >= 3 && !/^#|^javascript:/i.test(a.getAttribute('href')));
  const groups = new Map();
  for (const a of links) {
    const card = a.closest('li, article, [role=listitem], [role=article]') || a.parentElement?.parentElement || a.parentElement;
    const sig = [card.tagName, card.parentElement?.tagName, a.querySelector('h1,h2,h3,h4') || a.closest('h1,h2,h3,h4') ? 'H' : ''].join('/');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push({ a, card });
  }
  let best = [];
  // Real result lists name each result in a heading; filter chips, pills and footers don't. So the
  // biggest group of heading links wins outright; only without any, the biggest group with images.
  const headed = (x) => x.a.querySelector('h1,h2,h3,h4') || x.a.closest('h1,h2,h3,h4');
  const withHeads = [...groups.values()].filter((g) => g.length >= 2 && g.filter(headed).length >= g.length / 2);
  const pool = withHeads.length ? withHeads : [...groups.values()].filter((g) => g.length >= 2);
  for (const g of pool) {
    const score = g.length + g.filter((x) => x.card.querySelector('img')).length;
    if (score > (best.score || 0)) { best = g; best.score = score; }
  }
  // One or two results is a real answer too: then the few content links are the list.
  if (!best.length && links.length && links.length <= 3) best = links.map((a) => ({ a, card: a.parentElement }));
  const seen = new Set();
  const mine = new Set(best.map((x) => x.a));
  // A result's own card: climb while the parent holds no other result link.
  const itemRoot = (a) => { let el = a; while (el.parentElement && el.parentElement !== main && [...el.parentElement.querySelectorAll('a[href]')].filter((x) => mine.has(x) && x !== a && x.href !== a.href).length === 0) el = el.parentElement; return el; };
  const sponsored = (root) => root.matches('[class*=ad-slot i], [data-ad], [aria-label*=sponsored i]') || [...root.querySelectorAll('span, div, small, p, a, b')].some((e) => !e.children.length && SPONSORED.test(clean(e.innerText)) && clean(e.innerText).length < 20);
  return best.filter(({ a, card }) => {
    if (SPONSORED.test(clean(card.innerText)) || sponsored(itemRoot(a))) return false;
    if (seen.has(a.href)) return false; seen.add(a.href); return true;
  }).map(({ a }) => ({ ref: ref(a), text: clean((a.querySelector('h1,h2,h3,h4') || a.closest('h1,h2,h3,h4') || a).innerText).slice(0, 90), href: a.href }));
}
function scrollResultsToEnd() {
  const s = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY) && visible(e)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (s) s.scrollTop = s.scrollHeight; else scrollTo(0, document.body.scrollHeight);
  return 'ok';
}

// ---- buttons by meaning ----
/** Rendered but sized to nothing (a see-through control over a styled label): its box is the nearest sized ancestor. */
const shown = (el) => {
  if (visible(el)) return true;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || el.closest('[hidden]')) return false;
  for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) if (visible(p)) return true;
  return false;
};
function findButton(re, { links = true } = {}) {
  // Keyboard-shortcut hints for screen readers ("Add to cart, shift, option, K") aren't the button itself.
  const pool = all(links ? CLICKABLE : 'button, input[type=submit], input[type=button], [role=button]').filter((x) => !x.disabled && re.test(name(x)) && !/,\s*(shift|option|alt|ctrl|control|cmd|command)\b/i.test(name(x)));
  const c = pool.filter(visible).length ? pool.filter(visible) : pool.filter(shown);
  c.sort((a, b) => (inChrome(a) - inChrome(b)) || name(a).length - name(b).length);
  return c[0] ? { ref: ref(c[0]), name: name(c[0]), disabled: false } : null;
}
function cartLink() {
  const a = all('a[href]').filter((x) => visible(x) && /cart|bag|basket|trolley/i.test(new URL(x.href, location.href).pathname) && !/add|remove/i.test(name(x)));
  a.sort((x, y) => inChrome(y) - inChrome(x));
  return a[0] ? { ref: ref(a[0]), name: name(a[0]) } : null;
}
/** A matching button exists but sits in a collapsed section (purchase options, accordions): open that section. */
function reveal(re) {
  for (const el of all('button, input[type=submit], input[type=button], [role=button]')) {
    if (!re.test(name(el)) || /,\s*(shift|option|alt|ctrl)\b/i.test(name(el)) || shown(el)) continue;
    for (let p = el.parentElement, i = 0; p && i < 10; p = p.parentElement, i++) {
      // The section's own header: an expandable control or an option radio just before / around it.
      const header = [p.previousElementSibling, p.parentElement?.querySelector(':scope > [aria-expanded="false"], :scope > * > [aria-expanded="false"]')].filter(Boolean)
        .map((h) => (h.matches('[aria-expanded="false"], input[type=radio], [role=radio]') ? h : h.querySelector('[aria-expanded="false"], input[type=radio], [role=radio], a, [role=button]'))).find((h) => h && visible(h.closest('label') || h));
      if (header) { (header.closest('label') || header).click(); return 'opened: ' + name(header).slice(0, 40); }
    }
  }
  return 'none';
}
function clickRef(k, force) { const el = get(k); if (!el) return 'gone'; return click(el, force); }
/** Best visible clickable whose name contains the words (for "click X" and items in lists). */
function findByWords(words) {
  let best = null, score = 0;
  for (const el of all(CLICKABLE)) {
    if (!visible(el)) continue;
    const n = name(el).toLowerCase();
    if (!n || n.length > 160) continue;
    const hits = words.filter((w) => n.includes(w)).length;
    const s = hits / words.length - n.length / 2000 - (inChrome(el) ? 0.05 : 0);
    if (hits && s > score) { score = s; best = el; }
  }
  return best && score >= 0.99 ? { ref: ref(best), name: name(best) } : best && score >= 0.5 ? { ref: ref(best), name: name(best), partial: true } : null;
}

// ---- product options that must be chosen before "Add" works ----
function options() {
  const groups = [];
  for (const fs of all('fieldset, [role=radiogroup]')) {
    if (!visible(fs)) continue;
    const radios = [...fs.querySelectorAll('input[type=radio], [role=radio]')].filter((r) => visible(r) || visible(r.closest('label')));
    if (!radios.length) continue;
    const chosen = radios.some((r) => r.checked || r.getAttribute('aria-checked') === 'true');
    const label = clean(fs.querySelector('legend')?.innerText || fs.getAttribute('aria-label') || '');
    const values = radios.map((r) => clean(r.closest('label')?.innerText || (r.id && r.ownerDocument.querySelector('label[for="' + CSS.escape(r.id) + '"]')?.innerText) || name(r) || r.value)).map((v) => v.split('\n')[0].slice(0, 60));
    if (/image|thumbnail|gallery|carousel|slide|photo|video/i.test(label) || values.filter(Boolean).length < 2) continue;
    groups.push({ name: label, chosen, values });
  }
  for (const s of all('select')) {
    if (!visible(s) || s.value) continue;
    groups.push({ name: name(s), chosen: false, values: [...s.options].filter((o) => o.value).map((o) => clean(o.text)) });
  }
  return groups;
}
function choose(group, value) {
  for (const fs of all('fieldset, [role=radiogroup]')) {
    const label = clean(fs.querySelector('legend')?.innerText || fs.getAttribute('aria-label') || '');
    if (label !== group) continue;
    const labelOf = (x) => clean(x.closest('label')?.innerText || (x.id && x.ownerDocument.querySelector('label[for="' + CSS.escape(x.id) + '"]')?.innerText) || name(x) || x.value).split('\n')[0].slice(0, 60).toLowerCase();
    const r = [...fs.querySelectorAll('input[type=radio], [role=radio]')].find((x) => !value || labelOf(x) === value.toLowerCase());
    if (r) { (r.closest('label') || r).click(); if (r.type === 'radio' && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } return 'ok'; }
  }
  for (const s of all('select')) {
    if (name(s) !== group) continue;
    const o = [...s.options].find((x) => x.value && (!value || clean(x.text).toLowerCase() === value.toLowerCase()));
    if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; }
  }
  return 'none';
}
/** Current quantity on an item/cart page (first visible quantity field), or null. */
function qtyField() {
  return all('input[type=number], input[name*=qty i], input[id*=qty i], input[name*=quantity i], input[aria-label*=quantity i], select[name*=qty i], select[name*=quantity i], select[id*=quantity i], select[aria-label*=quantity i], [role=spinbutton]').find(visible) || null;
}
function getQty() { const q = qtyField(); if (!q) return null; const v = Number(q.value ?? q.getAttribute('aria-valuenow')); return Number.isFinite(v) ? v : null; }
/** The count a quantity stepper shows: a field's value, or a short text that is only a number. */
function numberIn(box) {
  const f = box.querySelector('input[type=number], input[name*=qty i], input[name*=quantity i], select, [role=spinbutton]');
  if (f) { const v = Number(f.value ?? f.getAttribute('aria-valuenow')); if (Number.isFinite(v) && (f.value !== '' || f.getAttribute('aria-valuenow'))) return v; }
  for (const el of box.querySelectorAll('span, div, output, b, strong')) { const t = (el.innerText || '').trim(); if (/^\d{1,3}$/.test(t) && !el.children.length) return Number(t); }
  return null;
}
function qtyIn(k) { const b = get(k); return b ? numberIn(b) : getQty(); }
/** One more / one fewer: the page's own +/- control first (it updates the cart properly), else the field. */
function stepQty(dir) {
  const re = dir > 0 ? /^(\+|increase|increment|add one|plus|more|add 1)\b|increase quantity|add one more/i : /^(-|−|decrease|decrement|remove one|minus|less|subtract)\b|decrease quantity/i;
  const b = all('button, [role=button]').find((x) => visible(x) && !x.disabled && re.test(name(x)) && !/to cart|to bag|checkout/i.test(name(x)));
  const box = b && (b.closest('[role=group], fieldset, form, li, tr, [class*=quantity i], [class*=qty i], [class*=stepper i]') || b.parentElement?.parentElement);
  const before = box ? numberIn(box) ?? getQty() : getQty();
  if (b) { b.click(); return { how: 'button', before, box: box ? ref(box) : null }; }
  const q = qtyField();
  if (!q || before == null) return { how: 'none', before };
  const n = Math.max(1, before + dir);
  if (q.tagName === 'SELECT') { const o = [...q.options].find((x) => Number(x.value) === n || Number(x.text) === n); if (!o) return { how: 'none', before }; q.value = o.value; }
  else Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(q, String(n));
  q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new Event('change', { bubbles: true }));
  return { how: 'field', before };
}
function setQty(n) {
  const q = all('input[type=number], input[name*=qty i], input[id*=qty i], input[name*=quantity i], select[name*=qty i], select[name*=quantity i]').find(visible);
  if (!q) return 'none';
  const set = Object.getOwnPropertyDescriptor(q.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set;
  set.call(q, String(n)); q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
}

// ---- media ----
function media(action) {
  const m = all('video, audio').filter((x) => x.readyState > 0 || x.currentSrc).sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
  const btn = (re) => { const b = findButton(re, { links: false }); if (b) return click(get(b.ref)); return null; };
  if (action === 'skip_ad') return btn(/^skip( ad| ads)?\b/i) || 'wait';
  if (action === 'next') return btn(/^next( video| song| track)?\b/i) || 'none';
  if (action === 'captions') return btn(/caption|subtitle|\bcc\b/i) || 'none';
  if (!m) return 'wait';
  const A = { play: () => m.play(), pause: () => m.pause(), mute: () => { m.muted = true; }, unmute: () => { m.muted = false; },
    louder: () => { m.muted = false; m.volume = Math.min(1, m.volume + 0.2); }, quieter: () => { m.volume = Math.max(0, m.volume - 0.2); },
    faster: () => { m.playbackRate = Math.min(2, m.playbackRate + 0.25); }, slower: () => { m.playbackRate = Math.max(0.25, m.playbackRate - 0.25); },
    forward: () => { m.currentTime += 10; }, rewind: () => { m.currentTime = Math.max(0, m.currentTime - 10); }, restart: () => { m.currentTime = 0; m.play(); },
    fullscreen: () => m.requestFullscreen?.() };
  if (!A[action]) return 'none';
  A[action]();
  return 'ok: ' + action;
}

// ---- what the page is and offers ----
function identity() {
  const meta = (sel) => document.querySelector(sel)?.content || '';
  return { title: document.title, siteName: meta('meta[property="og:site_name"]'), appName: meta('meta[name="application-name"]'),
    logo: [...document.querySelectorAll('img[alt*=logo i]')].map((i) => i.alt).join(' '), host: location.hostname.replace(/^www\./, ''), url: location.href };
}
function loginWall() { return all('input[type=password]').some(visible); }
/** A store / location / address picker standing between you and the menu or cart. */
function storePicker() {
  if (/store-?locator|locations?|find-a-store|select-?store|choose-?(a-)?(store|location)|restaurants?\/?$/i.test(location.pathname)) return true;
  const h = [...document.querySelectorAll('h1, [role=dialog] h1, [role=dialog] h2, [role=dialog] h3, [aria-modal=true] h2')].filter(visible).map((e) => clean(e.innerText)).join(' | ');
  return /\b(choose|select|find|pick) (a |your )?(store|restaurant|location|pickup|delivery address)\b|\b(where|how) (would you like|do you want) (to )?(get|receive)/i.test(h);
}
function affordances() {
  const bits = [];
  if (searchInputs().some(visible)) bits.push('a search box');
  const names = [];
  for (const el of all('button, [role=button], input[type=submit], a[href]')) {
    if (!visible(el) || inChrome(el)) continue;
    const n = name(el); if (n && n.length < 40 && !names.includes(n)) names.push(n);
    if (names.length >= 12) break;
  }
  if (names.length) bits.push('buttons/links: ' + names.map((n) => '"' + n + '"').join(', '));
  if (loginWall()) bits.push('a sign-in form');
  return bits.join('; ');
}
// Compact indexed list for the fallback agent: visible interactive elements, viewport first.
function elements() {
  const out = [];
  for (const el of all('a[href], button, input, textarea, select, [role=button], [role=link], [role=tab], [role=option], [role=checkbox], [role=radio], [contenteditable=true]')) {
    if (!visible(el)) continue;
    const r = rect(el);
    if (r.top > innerHeight * 2.5 || r.top < -innerHeight) continue;
    // Icon-only buttons have no words: give the model the icon's hints (class/id/svg title/href) too.
    const hint = clean([el.id, typeof el.className === 'string' ? el.className : '', el.querySelector('svg title')?.textContent, el.getAttribute('data-testid'), el.getAttribute('href')?.slice(0, 40)].filter(Boolean).join(' ')).slice(0, 60);
    out.push({ ref: ref(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || el.type || '', name: name(el).slice(0, 70), hint, top: r.top, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), sensitive: Boolean(SENSITIVE(el)) });
  }
  return out.sort((a, b) => (a.top > innerHeight) - (b.top > innerHeight) || a.top - b.top).slice(0, 70);
}
function typeInto(k, text) {
  const el = get(k);
  if (!el) return 'gone';
  if (SENSITIVE(el)) return 'refused: that is a password or payment field, please type it yourself';
  return focus(k);
}
function quiet(ms, max) {
  return new Promise((resolve) => {
    let t = setTimeout(done, ms); const start = Date.now();
    const mo = new MutationObserver(() => { clearTimeout(t); if (Date.now() - start < max) t = setTimeout(done, ms); });
    function done() { mo.disconnect(); resolve('quiet'); }
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(done, max);
  });
}
window.__dx = { findSearch, focus, closeSuggestions, suggesting, valueOf, submitSearch, results, scrollResultsToEnd, findButton, clickRef, findByWords, options, choose, setQty,
  media, identity, loginWall, storePicker, reveal, affordances, elements, getQty, stepQty, cartLink, qtyIn, typeInto, dismissOverlays, quiet, get, name: (k) => name(get(k)) };
})();`;

/** JS that runs window.__dx[fn](...args) in the page, injecting the toolkit first if this page lacks it. */
export const dxCall = (fn, ...args) => `${PAGE_LIB}\nwindow.__dx.${fn}(${args.map((a) => (a instanceof RegExp ? a.toString() : JSON.stringify(a))).join(', ')})`;
