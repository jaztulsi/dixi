// Scores one case from the fixture server's event log (ground truth) plus the final page state.
// Never trusts the app's own "done" claims; app state is used only where the user-visible output IS the
// result (a spoken answer, a clarifying question, a confirmation request).

import { SEARCH_HOST } from './world.js';
import { resultsFor } from './server.js';

const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const stem = (w) => w.replace(/(es|s)$/, '');
const ARTICLES = new Set(['a', 'an', 'the', 'some', 'any']);
const content = (s) => words(s).filter((w) => !ARTICLES.has(w)).map(stem);
const sameQuery = (a, b) => content(a).join(' ') === content(b).join(' ');
// Words that must never appear in a query unless the expected query has them: verbs, particles,
// politeness and filler. Used only to classify a failed search as "contaminated".
const LEAK = new Set(['open', 'up', 'go', 'to', 'pull', 'bring', 'search', 'find', 'look', 'for', 'on', 'me', 'please', 'can', 'you', 'um', 'uh', 'like',
  'take', 'launch', 'visit', 'show', 'website', 'site', 'app', 'and', 'then', 'play', 'buy', 'order', 'get', 'want', 'from', 'at', 'okay', 'so', 'hey']);

export function scoreCase(c, events, world, app = {}) {
  const brandById = Object.fromEntries(world.brands.map((b) => [b.id, b]));
  const ev = events.filter((e) => e.t >= c.tStart);
  const navs = ev.filter((e) => e.type === 'nav' && !e.probe);
  const x = c.expect;
  const checks = {};
  const allowed = new Set([c.startBrand, x.visit, x.search?.brand, x.cart?.brand, x.watch?.brand, x.checkout].filter(Boolean));

  if (x.visit) checks.visit = navs.some((e) => e.brand === x.visit);
  if (x.search) checks.search = ev.some((e) => e.type === 'search' && e.brand === x.search.brand && sameQuery(e.q, x.search.q));
  if (x.cart) {
    const want = content(x.cart.item);
    checks.cart = ev.some((e) => e.type === 'cart_add' && e.brand === x.cart.brand && (() => {
      const it = brandById[e.brand].items.find((i) => i.sku === e.sku);
      return it && want.every((w) => content(it.name).includes(w)) && (!x.cart.qty || Number(e.qty) === x.cart.qty);
    })());
  }
  if (x.watch) {
    const b = brandById[x.watch.brand];
    const { hits } = resultsFor(b, x.watch.q);
    const want = x.watch.nth < 0 ? hits.at(-1) : hits[x.watch.nth - 1];
    checks.watch = Boolean(want) && ev.some((e) => e.type === 'watch' && e.brand === b.id && e.sku === want.sku);
  }
  if (x.media) checks.media = ev.some((e) => e.type === x.media);
  if (x.media2) checks.media2 = ev.some((e) => e.type === x.media2);
  if (x.checkout) checks.checkout = ev.some((e) => e.type === 'checkout' && e.brand === x.checkout);
  if (x.noOrder) checks.noOrder = !ev.some((e) => e.type === 'order_placed');
  if (x.confirmAsked) checks.confirmAsked = Boolean(app.confirm);
  if (x.noNav) checks.noNav = navs.length === 0 && !ev.some((e) => e.type === 'escape');
  if (x.notFound) checks.honest = /couldn'?t find|not find|no (site|website|match)|doesn'?t (seem to )?exist|not sure which/i.test(app.status ?? '');
  if (x.clarify) checks.clarify = Boolean(app.clarify);
  if (x.noNavTo) checks.noNavTo = !navs.some((e) => x.noNavTo.includes(e.brand));
  if (x.answer) checks.answer = new RegExp(x.answer, 'i').test(app.answer ?? '');
  if (x.forbid?.length) checks.forbid = !navs.some((e) => x.forbid.includes(e.brand));

  // Wrong site: any page outside what the request named (another brand, an unknown host, or a silent
  // fallback to a web search engine when a site was named).
  const named = Boolean(x.visit || x.search || x.cart || x.watch);
  const wrong = navs.filter((e) => !allowed.has(e.brand));
  const escapes = ev.filter((e) => e.type === 'escape');
  const searchEngine = ev.filter((e) => e.host === SEARCH_HOST && (e.type === 'web_search' || e.type === 'nav'));
  const wrongSite = wrong.length > 0 || escapes.length > 0 || (named && searchEngine.length > 0) || (x.noNav && navs.length > 0);

  // Contamination: a submitted search whose query carries verb/particle/filler words the expected one doesn't.
  let contamination = false;
  for (const e of ev.filter((y) => y.type === 'search' || y.type === 'web_search')) {
    const expected = new Set(content(x.search?.q ?? x.cart?.item ?? ''));
    if (content(e.q).some((w) => LEAK.has(w) && !expected.has(w))) contamination = true;
    // The site's own name inside its own search is contamination too ("google: up classroom" class).
    const site = brandById[e.brand];
    if (site && content(site.name).some((w) => content(e.q).includes(w) && !expected.has(w))) contamination = true;
  }

  // Duplicates: the same search or cart add issued more than once, or the same page loaded twice in a row.
  const sig = (e) => `${e.type}|${e.brand}|${e.q ?? ''}|${e.sku ?? ''}|${e.path ?? ''}`;
  const counts = {};
  for (const e of ev.filter((y) => ['search', 'cart_add', 'order_placed'].includes(y.type))) counts[sig(e)] = (counts[sig(e)] ?? 0) + 1;
  let dup = Object.values(counts).some((n) => n > 1);
  for (let i = 1; i < navs.length; i++) if (sig(navs[i]) === sig(navs[i - 1]) && navs[i].t - navs[i - 1].t < 4000) dup = true;
  if (app.planDuplicates) dup = true;

  const acts = ev.filter((e) => ['nav', 'search', 'cart_add', 'watch', 'checkout', 'escape', 'web_search'].includes(e.type) || e.type.startsWith('media_') || ['next', 'captions', 'skip_ad'].includes(e.type));
  const firstAction = acts.length ? acts[0].t - c.tSpeechEnd : null;
  const pass = Object.values(checks).every(Boolean) && !wrongSite && Object.keys(checks).length > 0;
  return { pass, checks, wrongSite, contamination, dup, firstActionMs: firstAction, wrongDetail: [...wrong.map((e) => e.host), ...escapes.map((e) => e.host), ...(named ? searchEngine.map(() => SEARCH_HOST) : [])] };
}

/** Aggregate rows → metrics (rates in %, with Wilson 95% interval for success). */
export function summarize(rows) {
  const n = rows.length;
  const pct = (k) => (n ? (100 * rows.filter((r) => r[k]).length) / n : 0);
  const pass = rows.filter((r) => r.pass).length;
  const z = 1.96, p = n ? pass / n : 0;
  const centre = (p + z * z / (2 * n)) / (1 + z * z / n), half = (z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
  const lat = rows.map((r) => r.firstActionMs).filter((v) => v != null).sort((a, b) => a - b);
  const q = (f) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(f * lat.length))] : null);
  const calls = rows.map((r) => r.llmCalls ?? 0);
  return {
    n, success: n ? (100 * pass) / n : 0, ci: n ? [Math.max(0, (centre - half) * 100), Math.min(100, (centre + half) * 100)] : [0, 0],
    wrongSite: pct('wrongSite'), contamination: pct('contamination'), duplicate: pct('dup'),
    firstActionP50: q(0.5), firstActionP95: q(0.95), llmCallsPerTask: calls.reduce((a, b) => a + b, 0) / Math.max(n, 1),
  };
}
