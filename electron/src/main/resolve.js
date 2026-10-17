// Resolving a spoken site/app/store name to a real website, by evidence. No hand-written list of sites:
//   1. learned registry (exact name only; entries are written after a page proved it is that site)
//   2. the interpreter's own URL guesses, checked by fetching them
//   3. a web search (Brave API if keyed, else the configured HTML search) + Wikidata's "official website"
// A candidate passes only if every word of the name appears on the page (title, site name, app name,
// logo text) or in its host. A page titled "Zentora" never passes for "Zentora Classroom"; an exact
// name match beats a longer one; two different sites that fit equally → ask the user.

import fs from 'node:fs';
import path from 'node:path';
import { ENDPOINTS } from './providers.js';

const words = (s) => String(s ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
export const nameKey = (s) => words(s).join(' ');
const GENERIC = new Set(['the', 'a', 'an', 'website', 'site', 'app', 'online', 'official', 'home', 'page', 'my', 'www', 'com']);
const content = (s) => words(s).filter((w) => !GENERIC.has(w));
const plain = (w) => w.replace(/s$/, '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

/** What a page says it is: title, site/app name, logo text, manifest link, host labels; parked-domain signs. */
export function evidenceFrom(html, finalURL) {
  const meta = (re) => decode((html.match(re)?.[1] ?? '').trim());
  const host = new URL(finalURL).hostname.replace(/^www\./, '');
  const sameSite = (html.match(/<a\s[^>]*href="(\/[^/"][^"]*|\/|https?:\/\/[^"]*)"/gi) ?? [])
    .filter((a) => !/href="https?:/i.test(a) || a.includes(host)).length;
  return {
    title: meta(/<title[^>]*>([^<]*)<\/title>/i),
    siteName: meta(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)/i) || meta(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name/i),
    appName: meta(/<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']*)/i),
    logo: [...html.matchAll(/<img[^>]+alt=["']([^"']*logo[^"']*)["']/gi)].map((m) => decode(m[1])).join(' '),
    manifest: html.match(/<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)/i)?.[1] ?? null,
    opensearch: html.match(/<link[^>]+type=["']application\/opensearchdescription\+xml["'][^>]+href=["']([^"']+)/i)?.[1]
      ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/opensearchdescription\+xml/i)?.[1] ?? null,
    host,
    links: sameSite,
    // App-style sites ship few links before their JavaScript runs, so "few links" alone proves nothing;
    // parked pages say so, or are tiny shells with no name of their own.
    parked: /\b(domain (is |may be )?for sale|buy this domain|parked free|this domain (has been|is) (registered|parked)|domain parking)\b/i.test(html) || (html.length < 1500 && sameSite < 3),
  };
}

/**
 * How well a page proves it is `name`: null = not at all; else {exact, extra} (exact name match, and how
 * many extra words the best field has: "Zentora" vs a page called "Zentora Classroom" → extra 1).
 */
export function matchEvidence(name, ev) {
  const want = content(name).map(plain);
  if (!want.length || ev.parked) return null;
  const fields = [ev.siteName, ev.appName, ev.manifestName, ev.title, ev.logo].filter(Boolean);
  const hostLabels = ev.host.split('.').slice(0, -1);
  const have = new Set([...fields.flatMap((f) => content(f).map(plain)), ...hostLabels.flatMap((h) => h.split('-')).map(plain)]);
  const joined = want.join('');
  const inHost = hostLabels.some((h) => h.replace(/-/g, '').includes(joined));
  const allWords = want.every((w) => have.has(w) || [...have].some((h) => h.length > 3 && h === w));
  if (!allWords && !inHost && !fields.some((f) => content(f).join('').includes(joined))) return null;
  // Closest field: the one that names it with the fewest extra words.
  let best = 99, exact = false;
  for (const f of fields) {
    const fw = content(f.replace(/\s[|–—:·-]\s.*$/, '')).map(plain);   // "Home | Brand" → first segment, then whole
    for (const cand of [fw, content(f).map(plain)]) {
      if (!cand.length) continue;
      if (cand.join('') === joined) exact = true;
      if (want.every((w) => cand.includes(w) || cand.join('').includes(joined))) best = Math.min(best, cand.length - want.length);
    }
  }
  // A host label alone ("zentora" in classroom.zentora.io) is exact only when no field names something longer.
  if (!exact && best === 99 && hostLabels.some((h) => h.replace(/-/g, '') === joined)) exact = true;
  return { exact, extra: best === 99 ? 5 : Math.max(0, best) };
}

const hostWords = (host, names) => { const labels = host.split('.').slice(0, -1).flatMap((l) => l.split('-')); return Math.max(...names.map((n) => content(n).filter((w) => labels.some((l) => l === w || l.includes(w))).length)); };
const extraHostWords = (host, names) => {
  const labels = host.replace(/^www\./, '').split('.').slice(0, -2);   // subdomain labels only
  const said = new Set(names.flatMap((n) => content(n).map(plain)));
  return labels.flatMap((l) => l.split('-')).filter((l) => l && !said.has(plain(l)) && ![...said].some((w) => l.includes(w))).length;
};
const regDomain = (h) => h.replace(/^www\./, '').split('.').slice(-2).join('.');
const display = (ev, said) => {
  const f = [ev.siteName, ev.appName, ev.manifestName].find(Boolean) ?? ev.title.split(/\s[|–—:·-]\s/).find((p) => content(p).length) ?? said;
  return f.trim().slice(0, 60) || said;
};

export class Resolver {
  /**
   * @param fetchPage (url, {probe}) => Promise<{ok, status, url (final), html}> — Chromium network stack
   * @param file registry JSON path (null = memory only)
   * @param env {DIXI_SEARCH_URL, BRAVE key via keys}
   */
  constructor({ fetchPage, file = null, env = {}, keys = {}, now = () => Date.now() }) {
    Object.assign(this, { fetchPage, file, env, keys, now });
    this.entries = {};
    try { this.entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }

  save() {
    if (!this.file) return;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 1)); } catch {}
  }

  names() { return [...new Set(Object.values(this.entries).filter((e) => e.fail < 2).flatMap((e) => [e.name, ...(e.said ?? [])]))]; }
  lookup(name) { const e = this.entries[nameKey(name)]; return e && e.fail < 2 ? e : null; }
  byHost(host) { const h = host.replace(/^www\./, ''); return Object.values(this.entries).find((e) => e.host === h || e.finalHost === h) ?? null; }

  remember(said, hit) {
    const e = this.byHost(hit.host) ?? { name: hit.name, url: hit.url, host: hit.host, said: [], ok: 0, fail: 0, searchTemplate: null, opensearch: hit.opensearch ?? null };
    Object.assign(e, { url: hit.url, finalHost: hit.finalHost ?? hit.host, ts: this.now(), fail: 0, source: hit.source });
    if (e.name === e.host) e.name = hit.name;  // first learned from a search (by host): now it has a real name
    e.ok = (e.ok ?? 0) + 1;
    for (const k of [nameKey(said), nameKey(hit.name)]) if (k) { this.entries[k] = e; if (!e.said.includes(k)) e.said.push(k); }
    this.save();
    return e;
  }

  /** A fast (host-match) landing that the tab verified: learn it like any other. */
  confirm(said, hit) { return this.remember(said, { ...hit, source: 'host-match' }); }

  /** The landing page didn't match after all (or the site broke): two strikes and it's out. */
  outcome(host, ok) {
    const e = this.byHost(host);
    if (!e) return;
    if (ok) { e.ok++; e.fail = 0; } else e.fail++;
    this.save();
  }

  setSearchTemplate(host, template) {
    const h = String(host).replace(/^www\./, '');
    const e = this.byHost(host) ?? (this.entries[h] = { name: h, url: `https://${host}/`, host: h, said: [], ok: 0, fail: 0, searchTemplate: null });
    if (e && /^https?:\/\/[^{]+\{q-?\}/.test(template)) { e.searchTemplate = template; this.save(); }
  }

  async probe(url, said, source) {
    try {
      // One fetch per address per resolve, however many name variants are checked against it.
      this.pages ??= new Map();
      if (!this.pages.has(url)) this.pages.set(url, this.fetchPage(url, { probe: true }).catch(() => null));
      const r = await this.pages.get(url);
      if (!r || !r.ok || !r.html) return null;
      const ev = evidenceFrom(r.html, r.url);
      if (!ev.title && !ev.siteName && !ev.appName && ev.manifest) {
        try { const m = await this.fetchPage(new URL(ev.manifest, r.url).href, { probe: true }); ev.manifestName = JSON.parse(m.html).name; } catch {}
      }
      let m = matchEvidence(said, ev);
      const u = new URL(r.url);
      // A web app that sends signed-out visitors to its own sign-in page (same registrable domain):
      // the address you asked for is the evidence ("classroom.<company>.com" → that company's accounts page).
      if (!m && /sign[ -]?in|log[ -]?in|account/i.test(`${ev.title} ${u.pathname}`) && regDomain(u.hostname) === regDomain(new URL(url).hostname)) {
        const asked = matchEvidence(said, { host: new URL(url).hostname, title: '', links: 9 });
        if (asked) { const a = new URL(url); return { url: a.href, host: a.hostname.replace(/^www\./, ''), finalHost: u.hostname.replace(/^www\./, ''), name: said, opensearch: null, ...asked, signIn: true, source }; }
      }
      if (!m) return null;
      // Keep the address that proved itself (products often live under a path, or behind a redirect that
      // depends on whether you're signed in); the site decides where it lands each time.
      const asked = new URL(url);
      return { url: asked.href, host: asked.hostname.replace(/^www\./, ''), finalHost: u.hostname.replace(/^www\./, ''), name: display(ev, said), opensearch: ev.opensearch ? new URL(ev.opensearch, r.url).href : null, ...m, source };
    } catch { return null; }
  }

  /** Candidate result URLs from a web search: Brave API if keyed, else the HTML search page. */
  async searchCandidates(query) {
    const out = [];
    try {
      if (this.keys.brave) {
        const r = await fetch(`${ENDPOINTS.brave.url}?q=${encodeURIComponent(query)}&count=8`, { headers: { 'X-Subscription-Token': this.keys.brave, Accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
        for (const x of (await r.json()).web?.results ?? []) out.push(x.url);
      } else {
        const tpl = this.env.DIXI_SEARCH_URL || ENDPOINTS.websearch.url;
        const engine = new URL(tpl.replace('{q}', 'x')).hostname;
        const r = await this.fetchPage(tpl.replace('{q}', encodeURIComponent(query)), { probe: true });
        for (const m of (r?.html ?? '').matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) {
          let href = decode(m[1]);
          if (/\/y\.js|aclick|ad_domain|ad_provider/i.test(href)) continue;   // ads are never the site you named
          if (href.startsWith('//')) href = `https:${href}`;
          try {
            const u = new URL(href, `https://${engine}/`);
            const wrapped = [...u.searchParams.values()].find((v) => /^https?:\/\//.test(v));   // redirect wrappers (?uddg=...)
            const target = new URL(wrapped ?? u.href);
            const base = (h) => h.split('.').slice(-2).join('.');
            if (/^https?:$/.test(target.protocol) && base(target.hostname) !== base(engine)) out.push(target.href);
          } catch {}
        }
      }
    } catch {}
    const hosts = new Set();
    return out.filter((u) => { const h = new URL(u).hostname; if (hosts.has(h)) return false; hosts.add(h); return true; }).slice(0, 5);
  }

  /** Wikidata's "official website" for an entity with this exact name (keyless public knowledge base). */
  async wikidataCandidates(name) {
    try {
      const api = ENDPOINTS.wikidata.url;
      const s = await this.fetchPage(`${api}?action=wbsearchentities&format=json&language=en&limit=3&search=${encodeURIComponent(name)}`, { probe: true });
      const ids = (JSON.parse(s.html).search ?? []).filter((x) => nameKey(x.label) === nameKey(name)).map((x) => x.id).slice(0, 2);
      if (!ids.length) return [];
      const c = await this.fetchPage(`${api}?action=wbgetclaims&format=json&property=P856&entity=${ids[0]}`, { probe: true });
      return (JSON.parse(c.html).claims?.P856 ?? []).map((x) => x.mainsnak?.datavalue?.value).filter(Boolean).slice(0, 2);
    } catch { return []; }
  }

  /**
   * @param said the name as spoken; guess = likely intended name if misheard; urls = interpreter's guesses
   * @returns {status:'ok', url, host, name, source, ms, entry} | {status:'ambiguous', options} | {status:'notfound'}
   */
  async resolve({ said, guess = '', urls = [], fast = false }) {
    const t0 = this.now();
    this.pages = new Map();
    const done = (r) => ({ ...r, ms: this.now() - t0 });
    for (const n of [said, guess].filter(Boolean)) {
      const e = this.lookup(n);
      if (e) return done({ status: 'ok', url: e.url, host: e.host, finalHost: e.finalHost, name: e.name, source: 'registry', entry: e, searchTemplate: e.searchTemplate, opensearch: e.opensearch });
    }
    const names = [...new Set([said, guess].filter(Boolean))];
    // Fast: the proposed address already carries every word of the name ("classroom.<brand>.com" for
    // "<Brand> Classroom"): go now, the landing page is checked in the tab, and a miss falls back here.
    if (fast) {
      for (const u of urls) {
        let h;
        try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { continue; }
        const labels = h.split('.').slice(0, -1).flatMap((l) => [l, ...l.split('-')]);
        const want = content(said);
        if (want.length && (want.every((w) => labels.includes(w) || labels.includes(plain(w))) || labels.includes(want.join('')))) {
          return done({ status: 'ok', url: u, host: h, name: said, source: 'host-match', optimistic: true });
        }
      }
    }
    const tryAll = async (list, source) => {
      const hits = (await Promise.all(list.flatMap((u) => names.map((n) => this.probe(u, n, source))))).filter(Boolean);
      const byHost = new Map();
      for (const h of hits) { const prev = byHost.get(h.host); if (!prev || rank(h) < rank(prev)) byHost.set(h.host, h); }
      return [...byHost.values()].sort((a, b) => rank(a) - rank(b));
    };
    // Exact names first, then fewer extra words, then the address that carries the name itself
    // (the product's own site "music.<brand>.com" over the brand's page about it).
    // ...and the fewest host words you didn't say ("selection.<brand>.com" for just "<Brand>").
    const rank = (h) => (h.exact ? 0 : 10) + h.extra - 0.4 * hostWords(h.host, names) + 0.6 * extraHostWords(h.host, names) + (h.signIn ? 0.5 : 0);
    // The name run together as a .com is the commonest home: one evidence-checked fetch instead of a ~2 s
    // web search when the model offered no address. A page that doesn't name itself so is still rejected.
    // ponytail: .com only; other TLDs come from the model's urls or the search fallback.
    const joined = names.map((n) => content(n).join('')).filter((j) => /^[a-z0-9]{3,30}$/.test(j)).map((j) => `https://www.${j}.com/`);
    const first = [...new Set([...urls, ...joined])];
    let hits = first.length ? await tryAll(first, 'model') : [];
    if (!hits.length || !hits[0].exact) {
      const more = await Promise.all(names.flatMap((n) => [this.searchCandidates(`${n} official site`), this.wikidataCandidates(n)]));
      const found = await tryAll([...new Set(more.flat())].filter((u) => !hits.some((h) => u.includes(h.host))), 'search');
      hits = [...hits, ...found].sort((a, b) => rank(a) - rank(b));
    }
    // A multi-word product that only proved itself on its parent's site ("<Brand> Music" on <brand>.com):
    // also try the product's own subdomain there ("music.<brand>.com"), checked the same way.
    if (hits.length && content(said).length >= 2 && hostWords(hits[0].host, names) < content(said).length) {
      const dom = regDomain(hits[0].host);
      const extra = content(said).map(plain).filter((w) => !dom.includes(w)).map((w) => `https://${w}.${dom}/`);
      const sub = await tryAll(extra, hits[0].source);
      if (sub.length) hits = [...hits, ...sub].sort((x, y) => rank(x) - rank(y));
    }
    if (!hits.length) return done({ status: 'notfound' });
    const [a, b] = hits;
    // Two different sites that fit equally well and neither is exact: don't guess.
    if (b && rank(a) === rank(b) && !a.exact && nameKey(a.name) !== nameKey(b.name)) {
      return done({ status: 'ambiguous', options: hits.filter((h) => rank(h) === rank(a)).slice(0, 3).map((h) => ({ name: h.name, url: h.url, host: h.host })) });
    }
    const entry = this.remember(guess && a.exact && !matchEvidence(said, { title: a.name, host: a.host }) ? guess : said, a);
    return done({ status: 'ok', url: a.url, host: a.host, finalHost: a.finalHost, name: a.name, source: a.source, entry, opensearch: a.opensearch });
  }
}
