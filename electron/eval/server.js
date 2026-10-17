// Fixture web for evals: serves every brand of a seeded world (eval/world.js) under its own hostname,
// plus a web search engine and parked/unknown domains. The app is pointed here with Chromium's
// host-resolver-rules (DIXI_EVAL=1), so its real network stack, cookies and iframes behave normally.
//
// Ground truth lives here, never in the app: every navigation, search, cart add, order and media event
// is logged with a timestamp and the case id (x-dixi-case header the app's session adds in eval mode).
//   GET  http://localhost:PORT/__log?case=ID   → events for that case
//   POST http://localhost:PORT/__reset          → clear the log
// One port serves both TLS and plain HTTP (first byte decides).

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeWorld, SEARCH_HOST } from './world.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, '.cache');

function ensureAssets() {
  fs.mkdirSync(cache, { recursive: true });
  const key = path.join(cache, 'key.pem'), cert = path.join(cache, 'cert.pem'), clip = path.join(cache, 'clip.webm');
  if (!fs.existsSync(cert)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=fixture'], { stdio: 'ignore' });
  }
  if (!fs.existsSync(clip)) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=330',
      '-t', '60', '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libopus', clip]);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert), clip: fs.readFileSync(clip) };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const ES = { Search: 'Buscar', 'Accept all': 'Aceptar todo', 'Sign in': 'Iniciar sesión', 'Check out': 'Pagar', 'Place order': 'Realizar pedido', Results: 'Resultados', Cart: 'Carrito' };

export function startServer({ seed = 1, port = 0, world = makeWorld(seed) } = {}) {
  const assets = ensureAssets();
  const events = [];
  const log = (req, type, data = {}) => events.push({ t: Date.now(), case: req.headers['x-dixi-case'] ?? '', type, host: hostOf(req), ...data });
  const hostOf = (req) => (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase().replace(/^www\./, '');

  function handle(req, res) {
    const host = hostOf(req);
    const url = new URL(req.url, `https://${host}`);
    if (host === 'localhost' || host === '127.0.0.1') return control(req, res, url);
    const isDoc = req.headers['sec-fetch-dest'] === 'document';
    const isProbe = Boolean(req.headers['x-dixi-probe']);
    const brand = world.byHost[host];
    if (host === SEARCH_HOST) return searchEngine(req, res, url, isDoc);
    if (!brand) {
      log(req, isDoc && !isProbe ? 'escape' : 'probe', { path: url.pathname });
      // Half the unknown names are parked pages, the rest don't answer usefully.
      if (hash(host) % 2) return send(res, 200, page({ title: `${host} is for sale`, body: `<h1>${esc(host)}</h1><p>This domain may be for sale. <a href="/inquire">Inquire</a></p>` }));
      return send(res, 404, '<h1>Not found</h1>');
    }
    if (isDoc) log(req, 'nav', { brand: brand.id, path: url.pathname + url.search, probe: isProbe });
    return site(req, res, url, brand, isDoc);
  }

  function control(req, res, url) {
    res.setHeader('access-control-allow-origin', '*');
    if (url.pathname === '/__log') {
      const c = url.searchParams.get('case');
      return send(res, 200, JSON.stringify(c ? events.filter((e) => e.case === c) : events), 'application/json');
    }
    if (url.pathname === '/__reset') { events.length = 0; return send(res, 200, 'ok'); }
    if (url.pathname === '/__world') return send(res, 200, JSON.stringify(world), 'application/json');
    return send(res, 404, 'no');
  }

  // ---- the web search engine (resolver fallback in evals) ----
  function rank(q) {
    const want = norm(q).filter((w) => !['official', 'site', 'website', 'the', 'home', 'page', 'login', 'app', 'web'].includes(w));
    return world.brands.map((b) => {
      const name = norm(b.name), hostWords = norm(b.host.replace(/\./g, ' '));
      const hits = want.filter((w) => name.includes(w) || hostWords.some((h) => h.includes(w))).length;
      const exact = name.join(' ') === want.join(' ');
      return { b, score: hits / Math.max(want.length, 1) + (exact ? 1 : 0) - name.length * 0.01 };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  }
  function searchEngine(req, res, url, isDoc) {
    const q = url.searchParams.get('q') ?? '';
    if (isDoc && url.pathname === '/search') log(req, 'web_search', { q });
    const hits = rank(q).map(({ b }) => ({ title: titleOf(b, true), url: `https://${b.host}/`, snippet: `${b.name}: ${tagline(b)}` }));
    if (url.pathname === '/api') return send(res, 200, JSON.stringify({ query: q, results: hits }), 'application/json');
    if (url.pathname === '/search') {
      return send(res, 200, page({ title: `${q} - Fixture Web Search`, body: `<form role="search" action="/search"><input type="search" name="q" value="${esc(q)}" aria-label="Search"><button>Search</button></form>
        <main><div id="results">${hits.map((h) => `<div class="r"><a href="${esc(h.url)}"><h3>${esc(h.title)}</h3><cite>${esc(h.url)}</cite></a><p>${esc(h.snippet)}</p></div>`).join('') || '<p>No results.</p>'}</div></main>` }));
    }
    return send(res, 200, page({ title: 'Fixture Web Search', body: '<form role="search" action="/search"><input type="search" name="q" aria-label="Search"><button>Search</button></form>' }));
  }

  // ---- brand sites ----
  function site(req, res, url, b, isDoc) {
    const p = url.pathname;
    if (p === '/media/clip.webm') return send(res, 200, assets.clip, 'video/webm');
    if (p === '/opensearch.xml' && b.quirks.opensearch) {
      return send(res, 200, `<?xml version="1.0"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>${esc(b.name)}</ShortName><Url type="text/html" template="https://${b.host}/search?q={searchTerms}"/></OpenSearchDescription>`, 'application/opensearchdescription+xml');
    }
    if (p === '/manifest.json') return send(res, 200, JSON.stringify({ name: b.name, short_name: b.name }), 'application/json');
    if (p === '/__event' && req.method === 'POST') return body(req).then((d) => { try { const e = JSON.parse(d); log(req, e.type, { brand: b.id, ...e.data }); } catch {} send(res, 204, ''); });
    if (p === '/api/cart' && req.method === 'POST') return body(req).then((d) => { const e = JSON.parse(d || '{}'); log(req, 'cart_add', { brand: b.id, sku: e.sku, qty: e.qty ?? 1, options: e.options ?? null }); send(res, 200, '{"ok":true}', 'application/json'); });
    if (p === '/api/order' && req.method === 'POST') { log(req, 'order_placed', { brand: b.id }); return send(res, 200, '{"ok":true}', 'application/json'); }
    if (p === '/frame/search') return send(res, 200, `<!doctype html><body style="margin:0">${searchForm(b, 'form', '_top')}</body>`);

    const needsLogin = b.quirks.login && !/signed=1/.test(req.headers.cookie ?? '');
    if (needsLogin && (p === '/' || p === '/checkout' || p === '/review') && ['email', 'calendar', 'school', 'bank', 'docs'].includes(b.kind) || (needsLogin && (p === '/checkout' || p === '/review'))) {
      if (isDoc) log(req, 'login_wall', { brand: b.id });
      return send(res, 200, layout(b, `<main><h1>${t(b, 'Sign in')} – ${esc(b.name)}</h1><form action="/signin" method="post">
        <label>Email <input type="email" name="email" autocomplete="username"></label>
        <label>Password <input type="password" name="password" autocomplete="current-password"></label><button>${t(b, 'Sign in')}</button></form></main>`));
    }
    if (p === '/') return send(res, 200, layout(b, home(b)));
    if (p === '/search') {
      const q = url.searchParams.get('q') ?? '';
      if (isDoc) log(req, 'search', { brand: b.id, q });
      return send(res, 200, layout(b, results(b, q)));
    }
    const item = p.match(/^\/(item|watch)\/(\w+)$/);
    if (item) {
      const it = b.items.find((x) => x.sku === item[2]);
      if (!it) return send(res, 404, layout(b, '<main><h1>Not found</h1></main>'));
      if (isDoc) log(req, item[1] === 'watch' ? 'watch' : 'item', { brand: b.id, sku: it.sku });
      return send(res, 200, layout(b, item[1] === 'watch' ? watch(b, it) : itemPage(b, it)));
    }
    if (p === '/cart') return send(res, 200, layout(b, `<main><h1>${t(b, 'Cart')}</h1><div id="cart-lines"></div><a class="btn" href="/checkout">${t(b, 'Check out')}</a></main>`));
    if (p === '/checkout' || p === '/review') {
      if (isDoc) log(req, 'checkout', { brand: b.id });
      return send(res, 200, layout(b, `<main><h1>Review your order</h1><p>Deliver to: 1 Fixture Way</p><div id="cart-lines"></div>
        <label>Card number <input name="cc" autocomplete="cc-number"></label><label>CVV <input name="cvv" autocomplete="cc-csc"></label>
        <button id="place" onclick="fetch('/api/order',{method:'POST'}).then(()=>{document.querySelector('main').innerHTML='<h1>Order placed</h1>'})">${t(b, 'Place order')}</button></main>`));
    }
    if (p.startsWith('/c/')) return send(res, 200, layout(b, results(b, '', p.slice(3))));
    return send(res, 404, layout(b, '<main><h1>Page not found</h1></main>'));
  }

  const server = net.createServer((socket) => {
    socket.once('data', (buf) => {
      socket.pause();
      socket.unshift(buf);
      (buf[0] === 0x16 ? tls : plain).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });
  const tls = https.createServer({ key: assets.key, cert: assets.cert }, handle);
  const plain = http.createServer(handle);
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    port: server.address().port, world, events,
    close: () => new Promise((r) => server.close(r)),
  })));
}

// ---- page pieces ----
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const t = (b, s) => (b.quirks.lang === 'es' ? ES[s] ?? s : s);
const tagline = (b) => ({ shop: 'Everything you need, delivered', grocery: 'Fresh groceries near you', restaurant: 'Order food for pickup or delivery', video: 'Watch and share videos',
  music: 'Stream songs and playlists', maps: 'Find places and directions', email: 'Your inbox', calendar: 'Plan your days', news: 'Top stories today', social: 'Connect with friends',
  travel: 'Flights and hotels', docs: 'Documents and files', school: 'Your classes and assignments', bank: 'Online banking', store: 'Devices and accessories' }[b.kind]);
function titleOf(b, forSearch = false) {
  const q = b.quirks.title;
  if (q === 'plain' || forSearch) return b.name;
  if (q === 'suffix') return `Home | ${b.name}`;
  if (q === 'tagline') return tagline(b);
  return '';  // spa: set by script
}

function page({ title, head = '', body, lang = 'en' }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>${head}
<style>body{font:15px system-ui;margin:0}header{display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid #ddd;position:sticky;top:0;background:#fff;z-index:5}
main{padding:16px;max-width:900px}.card,.r{padding:8px 0;border-bottom:1px solid #eee}.btn,button{padding:6px 12px}#virt{height:320px;overflow:auto;border:1px solid #ccc}
#cookie{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;display:flex;align-items:center;justify-content:center}#cookie div{background:#fff;padding:24px}
.ad-slot{background:#ffe}</style></head><body>${body}</body></html>`;
}

function searchForm(b, mode, target = '') {
  const ph = `${t(b, 'Search')} ${b.name}`;
  if (mode === 'react') return `<div class="sb"><input id="rq" placeholder="What are you looking for?" aria-label="${t(b, 'Search')}"><button id="rgo">Go</button></div>`;
  if (mode === 'autocomplete') return `<form role="search" id="acf" action="/search"><input type="search" name="q" id="acq" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-label="${t(b, 'Search')}" placeholder="${esc(ph)}" autocomplete="off"><ul role="listbox" id="acl" hidden></ul><button>${t(b, 'Search')}</button></form>`;
  return `<form role="search" action="/search"${target ? ` target="${target}"` : ''}><input type="search" name="q" placeholder="${esc(ph)}" aria-label="${t(b, 'Search')}"><button>${t(b, 'Search')}</button></form>`;
}

function headerSearch(b) {
  const m = b.quirks.search;
  if (m === 'none') return '';
  if (m === 'toggle') return `<button id="stog" aria-label="${t(b, 'Search')}">&#128269;</button><div id="sbox" hidden>${searchForm(b, 'form')}</div>`;
  if (m === 'shadow') return '<dx-search></dx-search>';
  if (m === 'iframe') return `<iframe src="/frame/search" title="${t(b, 'Search')}" style="border:0;height:40px;width:340px"></iframe>`;
  return searchForm(b, m);
}

function layout(b, main) {
  const q = b.quirks;
  const head = `<meta name="viewport" content="width=device-width">${q.title === 'spa' ? '' : `<meta property="og:site_name" content="${esc(b.name)}">`}
<meta name="application-name" content="${esc(b.name)}"><link rel="manifest" href="/manifest.json">${q.opensearch ? `<link rel="search" type="application/opensearchdescription+xml" title="${esc(b.name)}" href="/opensearch.xml">` : ''}`;
  const nav = ['Deals', 'Help', 'About', 'Stores', 'Careers', 'Gift cards'].map((n) => `<a href="/c/${n.toLowerCase().replace(/ /g, '-')}">${n}</a>`).join(' ');
  const body = `<header><a href="/"><img alt="${esc(b.name)} logo" width="24" height="24" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"> <b>${q.title === 'spa' ? '' : esc(b.name)}</b></a>
${headerSearch(b)} <nav>${nav}</nav> ${['shop', 'grocery', 'restaurant', 'store'].includes(b.kind) ? `<a href="/cart" aria-label="${t(b, 'Cart')}">${t(b, 'Cart')} (<span id="cartn">0</span>)</a>` : ''}</header>
${main}
${q.cookie ? `<div id="cookie" role="dialog" aria-label="Cookies"><div><p>We use cookies.</p><button id="cookie-ok">${t(b, 'Accept all')}</button> <button>Manage</button></div></div>` : ''}
<script>${CLIENT(b)}</script>`;
  return page({ title: titleOf(b), head, body, lang: q.lang });
}

function home(b) {
  const list = b.items.slice(0, 6);
  const link = (it) => (b.kind === 'video' || b.kind === 'music' ? `/watch/${it.sku}` : `/item/${it.sku}`);
  return `<main><h1>${esc(tagline(b))}</h1>
${b.quirks.search === 'none' ? `<p><a href="/c/all">Full menu</a></p>` : ''}
<section><h2>Featured</h2>${list.map((it) => `<div class="card"><a href="${link(it)}">${esc(it.name)}</a></div>`).join('') || '<p>Welcome back.</p>'}</section></main>`;
}

/** Items a results page lists for q, in page order, and whether a sponsored row leads (shared with the scorer). */
export function resultsFor(b, q, cat) {
  const words = norm(q);
  let hits = cat ? b.items : b.items.filter((it) => words.length && words.every((w) => norm(it.name).some((n) => n.startsWith(w.replace(/s$/, '')))));
  if (!cat && !hits.length && words.length) hits = b.items.filter((it) => words.some((w) => norm(it.name).includes(w)));
  return { hits, sponsored: b.quirks.results === 'headings' && hits.length > 0 && hash(b.host + q) % 3 === 0 };
}

function results(b, q, cat) {
  const { hits, sponsored } = resultsFor(b, q, cat);
  const isMedia = b.kind === 'video' || b.kind === 'music';
  const href = (it) => (isMedia ? `/watch/${it.sku}` : `/item/${it.sku}`);
  const row = (it, i) => {
    const extra = isMedia ? `<p>${esc(it.channel)} · ${esc(it.views)}${it.short ? ' · Short' : ''}</p>` : `<p>$${it.price}</p>`;
    if (b.quirks.results === 'cards') return `<div class="card"><a href="${href(it)}"><div class="t">${esc(it.name)}</div></a>${extra}</div>`;
    return `<li><h3><a href="${href(it)}">${esc(it.name)}</a></h3>${extra}</li>`;
  };
  // Some result pages lead with a sponsored item (an "nth result" must skip it).
  const ad = sponsored ? `<li class="ad-slot"><span>Sponsored</span><h3><a href="${href(b.items.at(-1))}">${esc(b.items.at(-1).name)}</a></h3></li>` : '';
  const rows = hits.map(row).join('');
  const listHTML = b.quirks.results === 'virtual'
    ? `<div id="virt" role="list" data-rows='${esc(JSON.stringify(hits.map((it) => [href(it), it.name])))}'></div>`
    : b.quirks.results === 'cards' ? `<div id="results">${rows}</div>` : `<ol id="results">${ad}${rows}</ol>`;
  return `<main><h1>${t(b, 'Results')}${q ? ` for “${esc(q)}”` : ''}</h1>${hits.length ? listHTML : '<p>No results found.</p>'}</main>`;
}

function itemPage(b, it) {
  const opts = (it.options ?? []).map(([name, values]) => `<fieldset><legend>${esc(name)}</legend>${values.map((v) => `<label><input type="radio" name="${esc(name)}" value="${esc(v)}"> ${esc(v)}</label>`).join(' ')}</fieldset>`).join('');
  return `<main><h1>${esc(it.name)}</h1><p class="price">$${it.price}</p>${opts}
<label>Qty <input type="number" id="qty" value="1" min="1"></label>
<button id="add" ${it.options ? 'disabled' : ''}>${t(b, b.quirks.addLabel)}</button> <button id="buy">${esc(b.quirks.buyLabel)}</button>
<p><a href="/">Continue shopping</a></p></main>`;
}

function watch(b, it) {
  const tag = b.kind === 'music' ? 'audio' : 'video';
  return `<main><${tag} id="player" src="/media/clip.webm" ${tag === 'video' ? 'width="480" height="270"' : ''} autoplay></${tag}>
<h1>${esc(it.name)}</h1><p><span class="channel">${esc(it.channel)}</span> · <span>${esc(it.subs)}</span> · <span>${esc(it.views)}</span></p>
<div class="controls"><button aria-label="Play">Play</button><button aria-label="Pause">Pause</button>${b.kind === 'music' ? '<button>Preview</button>' : ''}<button aria-label="Mute">Mute</button>
<button aria-label="Subtitles/closed captions (c)">CC</button><button aria-label="Next video">Next</button></div>
${b.quirks.ad && tag === 'video' ? '<div id="ad" class="ad-showing">Ad · <button id="skip">Skip ad</button></div>' : ''}
<section><h2>Up next</h2>${b.items.filter((x) => x.sku !== it.sku).slice(0, 5).map((x) => `<h3><a href="/watch/${x.sku}">${esc(x.name)}</a></h3>`).join('')}</section></main>`;
}

// Page-side behavior of the quirks, plus media/cart events reported to the log.
const CLIENT = (b) => `(() => {
const ev = (type, data) => fetch('/__event', {method: 'POST', body: JSON.stringify({type, data})});
${b.quirks.title === 'spa' ? `setTimeout(() => { document.title = ${JSON.stringify(b.name)}; }, 300);` : ''}
const ck = document.getElementById('cookie'); if (ck) { if (document.cookie.includes('ck=1')) ck.remove(); else document.getElementById('cookie-ok').onclick = () => { document.cookie = 'ck=1;path=/'; ck.remove(); ev('cookie_accept', {}); }; }
const stog = document.getElementById('stog'); if (stog) stog.onclick = () => { document.getElementById('sbox').hidden = false; document.querySelector('#sbox input').focus(); };
customElements.define('dx-search', class extends HTMLElement { connectedCallback() { const r = this.attachShadow({mode: 'open'});
  r.innerHTML = '<form role="search" action="/search"><input type="search" name="q" aria-label="${t(b, 'Search')}" placeholder="${t(b, 'Search')}"><button>${t(b, 'Search')}</button></form>'; } });
// React-style controlled input: only real input events update state; synthetic Enter is ignored.
const rq = document.getElementById('rq'); if (rq) { let state = ''; rq.addEventListener('input', () => { state = rq.value; });
  const go = () => { location.href = '/search?q=' + encodeURIComponent(state); };
  rq.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.isTrusted) go(); }); document.getElementById('rgo').onclick = go; }
// Autocomplete that highlights its first suggestion: a bare Enter picks the suggestion, not what you typed.
const acq = document.getElementById('acq'); if (acq) { const l = document.getElementById('acl'); let active = null;
  acq.addEventListener('input', () => { const v = acq.value.trim(); if (!v) { l.hidden = true; return; }
    l.innerHTML = [v + ' deals', v + ' near me', 'best ' + v].map((s, i) => '<li role="option" id="o' + i + '">' + s + '</li>').join(''); l.hidden = false;
    acq.setAttribute('aria-expanded', 'true'); active = l.firstChild.textContent; acq.setAttribute('aria-activedescendant', 'o0'); });
  acq.addEventListener('keydown', (e) => { if (e.key === 'Escape') { l.hidden = true; active = null; acq.setAttribute('aria-expanded', 'false'); acq.removeAttribute('aria-activedescendant'); }
    if (e.key === 'Enter' && active) { e.preventDefault(); location.href = '/search?q=' + encodeURIComponent(active); } });
  l.addEventListener('click', (e) => { location.href = '/search?q=' + encodeURIComponent(e.target.textContent); }); }
// Virtualized results: only rows in view exist in the DOM.
const virt = document.getElementById('virt'); if (virt) { const rows = JSON.parse(virt.dataset.rows); const H = 48;
  const inner = document.createElement('div'); inner.style.height = rows.length * H + 'px'; inner.style.position = 'relative'; virt.appendChild(inner);
  const draw = () => { const a = Math.floor(virt.scrollTop / H), z = Math.min(rows.length, a + Math.ceil(320 / H) + 1);
    inner.innerHTML = rows.slice(a, z).map((r, i) => '<div role="listitem" style="position:absolute;top:' + (a + i) * H + 'px;height:' + H + 'px"><h3><a href="' + r[0] + '">' + r[1].replace(/</g, '&lt;') + '</a></h3></div>').join(''); };
  virt.addEventListener('scroll', draw); draw(); }
// Cart: options must be chosen before Add is enabled (store pickers).
const add = document.getElementById('add'); if (add) { const sku = location.pathname.split('/').pop();
  const opts = () => Object.fromEntries([...document.querySelectorAll('fieldset')].map((f) => [f.querySelector('legend').textContent, (f.querySelector('input:checked') || {}).value || null]));
  document.querySelectorAll('fieldset input').forEach((i) => i.addEventListener('change', () => { add.disabled = Object.values(opts()).some((v) => !v); }));
  const put = () => fetch('/api/cart', {method: 'POST', body: JSON.stringify({sku, qty: Number(document.getElementById('qty').value) || 1, options: document.querySelector('fieldset') ? opts() : null})});
  add.onclick = () => put().then(() => { const n = document.getElementById('cartn'); if (n) n.textContent = Number(n.textContent) + 1; add.textContent = 'Added'; });
  document.getElementById('buy').onclick = () => put().then(() => { location.href = '/checkout'; }); }
// Media: report what the player does.
const pl = document.getElementById('player'); if (pl) {
  for (const t of ['play', 'pause', 'ratechange', 'volumechange', 'seeked']) pl.addEventListener(t, () => ev('media_' + t, {paused: pl.paused, muted: pl.muted, volume: pl.volume, rate: pl.playbackRate, time: Math.round(pl.currentTime)}));
  const by = (re) => [...document.querySelectorAll('.controls button')].find((x) => re.test(x.getAttribute('aria-label') || x.textContent));
  by(/^Play/).onclick = () => pl.play(); by(/^Pause/).onclick = () => pl.pause(); by(/^Mute/).onclick = () => { pl.muted = !pl.muted; };
  by(/captions/).onclick = () => ev('captions', {}); by(/^Next/).onclick = () => { const n = document.querySelector('section a'); ev('next', {}); if (n) location.href = n.href; };
  const pv = by(/^Preview/); if (pv) pv.onclick = () => { pl.play(); ev('preview', {}); };
  const skip = document.getElementById('skip'); if (skip) skip.onclick = () => { document.getElementById('ad').remove(); ev('skip_ad', {}); }; }
})();`;

const send = (res, status, data, type = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(data); };
const body = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d)); });

// node eval/server.js [seed] [port] → serve a world until killed
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer({ seed: Number(process.argv[2] ?? 1), port: Number(process.argv[3] ?? 8443) });
  console.log(`fixture web (seed ${s.world.seed}, ${s.world.brands.length} brands) on 127.0.0.1:${s.port}`);
}
