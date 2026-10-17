import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, evidenceFrom, matchEvidence } from '../../src/main/resolve.js';

// A tiny fake web: host → page. Invented names only.
const page = (title, { site = '', links = 6, parked = false } = {}) => `<html><head><title>${title}</title>${site ? `<meta property="og:site_name" content="${site}">` : ''}</head><body>
${parked ? 'This domain may be for sale.' : ''}${Array.from({ length: links }, (_, i) => `<a href="/p${i}">x</a>`).join('')}</body></html>`;
function web(pages, search = {}) {
  return async (url) => {
    const u = new URL(url);
    if (u.hostname === 'search.test') {
      const q = u.searchParams.get('q');
      return { ok: true, status: 200, url, html: (search[q] ?? []).map((h) => `<a href="https://${h}/">r</a>`).join('') };
    }
    const html = pages[u.hostname];
    return html ? { ok: true, status: 200, url: `https://${u.hostname}/`, html } : { ok: false, status: 404, url, html: '' };
  };
}
const env = { DIXI_SEARCH_URL: 'https://search.test/?q={q}' };

test('evidence: every word of the name must be on the page; a shorter page name never counts for a longer one', () => {
  const ev = (t, h) => evidenceFrom(page(t), `https://${h}/`);
  assert.ok(matchEvidence('Zentora Classroom', ev('Zentora Classroom', 'classroom.zentora.io')));
  assert.equal(matchEvidence('Zentora Classroom', ev('Zentora', 'zentora.io')), null);
  assert.ok(matchEvidence('Zentora', ev('Zentora Classroom', 'classroom.zentora.io')), 'superset passes, but not exact');
  assert.equal(matchEvidence('Zentora', ev('Zentora Classroom', 'classroom.zentora.io')).exact, false);
  assert.equal(matchEvidence('Zentora', ev('Home | Zentora', 'zentora.io')).exact, true);
  assert.equal(matchEvidence('Brindle Mart', ev('Brindlemart', 'shopbrindle.com')).exact, true, 'spacing variants are the same name');
  assert.equal(matchEvidence('Quillmart', evidenceFrom(page('quillmart.com', { parked: true, links: 1 }), 'https://quillmart.com/')), null, 'parked pages never count');
});

test('resolve: the model\'s guess is checked, the real site is found by search when the guess is wrong', async () => {
  const r = new Resolver({ fetchPage: web({ 'faistnuk.co': page('Faistnuk') }, { 'Faistnuk official site': ['faistnuk.co'] }), env });
  const out = await r.resolve({ said: 'Faistnuk', urls: ['https://faistnuk.com/'] });
  assert.equal(out.status, 'ok');
  assert.equal(out.host, 'faistnuk.co');
  assert.equal(r.lookup('faistnuk').host, 'faistnuk.co', 'learned for next time');
  assert.equal((await r.resolve({ said: 'Faistnuk' })).source, 'registry');
});

test('resolve: exact name beats a longer one that contains it (no shadowing either way)', async () => {
  const pages = { 'zentora.io': page('Zentora'), 'classroom.zentora.io': page('Zentora Classroom') };
  const search = { 'Zentora official site': ['classroom.zentora.io', 'zentora.io'], 'Zentora Classroom official site': ['zentora.io', 'classroom.zentora.io'] };
  const r = new Resolver({ fetchPage: web(pages, search), env });
  assert.equal((await r.resolve({ said: 'Zentora' })).host, 'zentora.io');
  assert.equal((await r.resolve({ said: 'Zentora Classroom' })).host, 'classroom.zentora.io');
});

test('resolve: an invented name that exists nowhere is "not found", never the nearest known one', async () => {
  const r = new Resolver({ fetchPage: web({ 'zentora.io': page('Zentora') }, { 'Zqombrix official site': ['zentora.io'] }), env });
  r.remember('zentora', { host: 'zentora.io', url: 'https://zentora.io/', name: 'Zentora' });
  assert.equal((await r.resolve({ said: 'Zqombrix', urls: ['https://zqombrix.com/'] })).status, 'notfound');
});

test('resolve: two different sites that fit a bare word equally → ambiguous (ask), not a guess', async () => {
  const pages = { 'music.bykkar.com': page('Bykkar Music'), 'ejmusic.com': page('EJ Music') };
  const r = new Resolver({ fetchPage: web(pages, { 'Music official site': ['music.bykkar.com', 'ejmusic.com'] }), env });
  const out = await r.resolve({ said: 'Music' });
  assert.equal(out.status, 'ambiguous');
  assert.deepEqual(out.options.map((o) => o.name).sort(), ['Bykkar Music', 'EJ Music']);
});

test('registry: two failed landings invalidate an entry; registry removal degrades to lookup', async () => {
  const r = new Resolver({ fetchPage: web({ 'faza.app': page('Faza') }, { 'Faza official site': ['faza.app'] }), env });
  await r.resolve({ said: 'Faza' });
  r.outcome('faza.app', false); r.outcome('faza.app', false);
  assert.equal(r.lookup('Faza'), null);
  r.entries = {};
  assert.equal((await r.resolve({ said: 'Faza' })).status, 'ok');
});
