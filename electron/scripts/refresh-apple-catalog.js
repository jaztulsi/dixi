// Builds data/apple-catalog.json (the ONE sanctioned site-specific exception: the Apple product shortcut)
// from Apple's live online store, never from memory: product family names come from the store's own
// "buy" pages and accessories page. Keeps the previous catalog if anything fails.
//   npm run refresh-apple-catalog
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/apple-catalog.json');
const STORE = 'https://www.apple.com/store';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.text(); };
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

try {
  const home = await get('https://www.apple.com/');
  const names = new Set();
  const buyURL = new Map();  // raw product name → its store "buy" page (a direct order skips search)
  const buyLinks = (html) => {
    for (const m of html.matchAll(/<a\b[^>]*data-analytics-title="(?:buy|pre-?order) - ([^"]{2,40})"[^>]*>/gi)) {
      names.add(m[1]);
      const href = m[0].match(/href="([^"]+)"/)?.[1]?.trim();
      if (href && !buyURL.has(m[1])) buyURL.set(m[1], new URL(href, 'https://www.apple.com').href);
    }
  };
  // 1. Footer directory links to top-level product pages (/mac/, /airpods/...); services are filtered below.
  const familyLinks = [...home.matchAll(/ac-gf-directory-column-section-link[^>]*href="(\/[a-z-]+\/)"[^>]*>([^<]{2,30})<|href="(\/[a-z-]+\/)"[^>]*ac-gf-directory-column-section-link[^>]*>([^<]{2,30})</g)]
    .map((m) => [m[1] ?? m[3], text(m[2] ?? m[4])]).filter(([h]) => !/apple-(music|tv-plus|one|pay|card|cash|arcade|books|podcasts|news|fitness)|app-store|icloud|store|gift|wallet|account|retail|business|education|healthcare|government|support|newsroom|environment|privacy|accessibility|leadership|careers|investor|ethics|events|contact|legal|sitemap|shop/.test(h));
  const GENERIC = new Set(['Home', 'Watch', 'Vision', 'Accessories', 'Store', 'Gift Cards', 'Mac']);
  for (const [, n] of familyLinks) if (!GENERIC.has(n)) names.add(n);
  // 2. Each family page: its product strip, title and "buy" links.
  for (const [href] of familyLinks) {
    const html = await get(`https://www.apple.com${href}`).catch(() => '');
    for (const m of html.matchAll(/chapternav-label[^>]*>([^<]{2,40})</g)) names.add(text(m[1]));
    // Product links on the family page that start with the family's own word ("Mac" page → "MacBook Air").
    const lead = (familyLinks.find(([h]) => h === href)?.[1] ?? '').split(' ')[0];
    if (lead) for (const m of html.matchAll(/<a\b[^>]*>\s*([^<]{3,25})\s*<\/a>/g)) { const t = text(m[1]); if (new RegExp(`^i?${lead}\\w*\\b`, 'i').test(t) && !/\b(shop|buy|learn|compare|explore|why|switch|support|accessories)\b/i.test(t)) names.add(t); }
    // The family page's own "buy - <product>" / "pre-order - <product>" links, with where they go.
    buyLinks(html);
    const title = text(html.match(/<title>([^<]+)/)?.[1] ?? '').replace(/\s*-\s*Apple.*$/, '');
    if (title && title.length <= 25 && !/\s(and|&)\s/.test(title)) names.add(title);
  }
  // 3. "buy - <product>" links anywhere on the home page.
  buyLinks(home);
  const isProduct = (n) => /^(i[A-Z]|Mac|Air|Apple (Watch|Vision|Pencil|TV|Home[A-Z]\w*)|Home[A-Z]\w*|Magic|Studio Display|Beats)/.test(n) || /^(iphone|ipad|imac|mac|airpods|airtag|apple watch|apple vision|apple pencil|homepod|homeview|studio display)/i.test(n);
  const SERVICES = /^(iOS|iPadOS|macOS|watchOS|visionOS|tvOS)\b|^Mac$|^Apple (Music|TV\+|One|Pay|Card|Cash|Arcade|Books|Podcasts|News|Fitness)|^App Store|^iCloud/i;
  // Sizes and generations aren't part of the name ("macbook air 13 and 15 inch", "homepod 2nd gen").
  const tidy = (n) => n.replace(/&nbsp;/g, ' ').trim().replace(/\s+(\d+(\s*(and|&)\s*\d+)?[- ]?inch(es)?|\d+(st|nd|rd|th) gen(eration)?)$/i, '');
  const clean = [...names].map(tidy).filter((n) => isProduct(n) && !SERVICES.test(n) && !/^Compare|Accessories$/i.test(n));
  const titleCase = (n) => n.replace(/\b(iphone|ipad|imac|airpods|airtag|macbook|homepod|homeview|xdr)\b/gi, (w) => ({ iphone: 'iPhone', ipad: 'iPad', imac: 'iMac', airpods: 'AirPods', airtag: 'AirTag', macbook: 'MacBook', homepod: 'HomePod', homeview: 'HomeView', xdr: 'XDR' }[w.toLowerCase()])).replace(/\b(apple|watch|series|ultra|pro|max|air|mini|pencil|vision|magic|keyboard|mouse|trackpad|studio|display|duo|mac|neo)\b/g, (w) => w[0].toUpperCase() + w.slice(1));
  const names2 = new Set(clean.map(titleCase));
  // "Apple HomeView" also answers to "HomeView" (a made-up brand word, never a generic one like "Watch").
  const urlOf = new Map([...buyURL].map(([raw, u]) => [titleCase(tidy(raw)).toLowerCase(), u]));
  const families = [...names2].filter((n) => /[a-z]/i.test(n)).sort().map((name) => {
    const rest = name.replace(/^Apple /, '');
    const f = rest !== name && /^[A-Z][a-z]+[A-Z]\w*$/.test(rest) ? { name, aliases: [rest] } : { name };
    const url = urlOf.get(name.toLowerCase());
    return url ? { ...f, url } : f;
  });
  if (families.length < 5) throw new Error(`only ${families.length} product names found`);
  const catalog = {
    _notice: 'SANCTIONED EXCEPTION: the only site-specific data in Dixi (the Apple product shortcut, spec Phase 2G). Generated by scripts/refresh-apple-catalog.js from the live Apple Store; do not edit by hand.',
    refreshed: new Date().toISOString().slice(0, 10), source: STORE, storeURL: STORE, families,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(catalog, null, 1));
  console.log(`${families.length} product families → ${path.relative(process.cwd(), out)}`);
  console.log(families.map((f) => f.name).join(' | '));
} catch (err) {
  console.error('Apple catalog refresh failed, keeping the previous one:', err.message);
  process.exitCode = 1;
}
