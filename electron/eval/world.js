// A seeded, made-up web for evals: brands that cannot exist in any list, served by eval/server.js under
// realistic hostnames. Same seed → same world. Nothing here may leak into the app (src/ never imports eval/).
//
// Each brand: {id, name, host, kind, quirks, items, parent?, decoyOf?}
//  - kinds cover 15 kinds of sites and apps (shop, grocery, restaurant, video, music, maps, email, calendar,
//    news, social, travel, docs, school, bank, store)
//  - quirks make the generic strategies work for it: how search looks, cookie banners, login walls,
//    result layouts, titles that don't say the name, other languages
//  - product families ("<Parent> Classroom" next to "<Parent>") and near-collisions (one word / one sound
//    apart) are separate sites, so snapping to the wrong one is visible in the event log.

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => { const a2 = [...arr]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; },
  };
  return r;
}

// Pronounceable invented words. Checked against nothing on purpose: collisions with a real brand are
// possible but harmless (the fixture server answers for every host).
const ONSET = ['b', 'br', 'c', 'cl', 'd', 'dr', 'f', 'fl', 'g', 'gr', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'pl', 'qu', 'r', 's', 'sl', 'st', 't', 'tr', 'v', 'w', 'z'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'ai', 'ee', 'oo', 'ou', 'y'];
const CODA = ['', 'n', 'r', 'l', 'm', 'st', 'nd', 'x', 'k', 'th', 'sh', 'ck'];
const ENDING = ['ly', 'io', 'ora', 'ex', 'ia', 'go', 'ster', 'wick', 'ford', 'mart', 'ton', 'ella', 'ify', 'oo', 'za'];

export function inventWord(r) {
  const syll = () => r.pick(ONSET) + r.pick(VOWEL) + r.pick(CODA);
  const w = r.chance(0.5) ? syll() + r.pick(ENDING) : syll() + syll();
  return w[0].toUpperCase() + w.slice(1);
}

/** One sound changed ("Brindle" → "Brendle"): a different entity that sounds close. */
export function oneSoundAway(r, word) {
  const vowels = [...word.matchAll(/[aeiouy]+/gi)];
  if (!vowels.length) return word + 'a';
  const v = r.pick(vowels);
  const repl = r.pick(VOWEL.filter((x) => x !== v[0].toLowerCase()));
  const out = word.slice(0, v.index) + repl + word.slice(v.index + v[0].length);
  return out[0].toUpperCase() + out.slice(1);
}

// Product words for families ("<Parent> Classroom"), like real multi-product brands.
const PRODUCT_WORDS = ['Classroom', 'Music', 'Maps', 'Drive', 'Mail', 'Calendar', 'Docs', 'Video', 'News', 'Market', 'Eats', 'Bank', 'Travel', 'Social', 'Store'];
const KIND_OF_PRODUCT = { Classroom: 'school', Music: 'music', Maps: 'maps', Drive: 'docs', Mail: 'email', Calendar: 'calendar', Docs: 'docs', Video: 'video', News: 'news', Market: 'grocery', Eats: 'restaurant', Bank: 'bank', Travel: 'travel', Social: 'social', Store: 'store' };
export const KINDS = ['shop', 'grocery', 'restaurant', 'video', 'music', 'maps', 'email', 'calendar', 'news', 'social', 'travel', 'docs', 'school', 'bank', 'store'];
const NEEDS_LOGIN = new Set(['email', 'calendar', 'school', 'bank', 'docs']);
const SELLS = new Set(['shop', 'grocery', 'restaurant', 'store']);

// Generic catalog nouns per selling kind (test data, not app knowledge).
const GOODS = {
  shop: ['headphones', 'phone charger', 'desk lamp', 'backpack', 'usb cable', 'water bottle', 'keyboard', 'mouse pad', 'running shoes', 'coffee maker', 'throw blanket', 'yoga mat', 'bluetooth speaker', 'notebook', 'sunglasses'],
  grocery: ['bagel', 'bagels', 'oat milk', 'bananas', 'sourdough bread', 'eggs', 'cheddar cheese', 'orange juice', 'apples', 'greek yogurt', 'peanut butter', 'pasta', 'tomatoes', 'cereal', 'coffee beans'],
  restaurant: ['cheeseburger', 'chicken sandwich', 'fries', 'veggie wrap', 'milkshake', 'chicken nuggets', 'garden salad', 'burrito bowl', 'pepperoni pizza', 'iced coffee', 'onion rings', 'fish tacos'],
  store: ['laptop', 'tablet', 'smartwatch', 'earbuds', 'phone', 'monitor', 'stylus', 'smart speaker', 'tracker tag', 'keyboard case'],
};
const OPTIONS = { store: [['Color', ['Silver', 'Midnight', 'Sky']], ['Storage', ['128GB', '256GB', '512GB']]], restaurant: [['Size', ['Small', 'Medium', 'Large']]] };
const TOPICS = ['lofi beats', 'piano music', 'cooking pasta', 'black holes', 'rain sounds', 'guitar lesson', 'street food tour', 'cat videos', 'chess openings', 'jazz standards', 'mountain hiking', 'origami crane'];

const TLDS = ['com', 'com', 'com', 'io', 'co', 'app', 'net'];

function hostFor(r, name, parent) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (parent) {
    const p = parent.host.replace(/^www\./, '');
    const word = name.split(' ').pop().toLowerCase();
    return r.pick([`${word}.${p}`, `${p.split('.')[0]}${word}.com`, `${word}.${p}`]);
  }
  const tld = r.pick(TLDS);
  const style = r.int(6);
  if (style === 0) return `get${slug}.${tld}`;
  if (style === 1) return `${slug}app.${tld}`;
  if (style === 2) return `shop${slug}.com`;
  if (style === 3) return `${slug}-online.${tld}`;
  return `${slug}.${tld}`;  // obvious name.tld half the time
}

function quirks(r, kind) {
  const q = {
    search: r.pick(['form', 'form', 'toggle', 'react', 'shadow', 'iframe', 'autocomplete', kind === 'restaurant' ? 'none' : 'form']),
    opensearch: r.chance(0.35),
    cookie: r.chance(0.3),
    login: NEEDS_LOGIN.has(kind) && r.chance(0.6),
    results: r.pick(['headings', 'headings', 'cards', 'virtual']),
    title: r.pick(['plain', 'suffix', 'tagline', 'spa']),
    lang: r.chance(0.08) ? 'es' : 'en',
    addLabel: r.pick(['Add to Cart', 'Add to Bag', 'Add to order', 'Add to basket', 'Add']),
    buyLabel: r.pick(['Buy now', 'Purchase', 'Order now']),
    ad: kind === 'video' && r.chance(0.4),
  };
  if (q.search === 'none' && !SELLS.has(kind)) q.search = 'form';
  return q;
}

function catalog(r, kind) {
  if (SELLS.has(kind)) {
    const goods = r.shuffle(GOODS[kind]).slice(0, 8);
    return goods.map((g, i) => {
      const variants = ['', `Classic ${g}`, `Premium ${g}`, `${g} 2-pack`];
      return { sku: `s${i}`, name: r.pick(variants) || g, base: g, price: Number((2 + r.next() * (kind === 'store' ? 900 : 40)).toFixed(2)), options: OPTIONS[kind] ?? null };
    });
  }
  if (kind === 'video' || kind === 'music') {
    return r.shuffle(TOPICS).slice(0, 6).flatMap((t, i) => [0, 1, 2].map((k) => ({
      sku: `v${i}${k}`, name: `${k === 0 ? '' : ['Best of ', 'Relaxing ', 'Live: '][k]}${t}`.trim(), base: t,
      channel: inventWord(r), subs: `${1 + r.int(900)}K subscribers`, views: `${1 + r.int(99)}M views`, short: r.chance(0.2),
    })));
  }
  return [];
}

/**
 * @param seed number
 * @param opts {brands: how many top-level brands (default 40), families, collisions}
 */
export function makeWorld(seed, { brands = 40, families = 6, collisions = 10 } = {}) {
  const r = rng(seed);
  const out = [];
  const taken = new Set();
  const add = (b) => {
    const key = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (taken.has(key) || out.some((o) => o.host === b.host)) return null;
    taken.add(key);
    b.id = `b${out.length}`;
    out.push(b);
    return b;
  };
  const brand = (name, kind, extra = {}) => add({ name, host: hostFor(r, name, extra.parent), kind, quirks: quirks(r, kind), items: catalog(r, kind), ...extra, parent: extra.parent?.id });

  for (let i = 0; out.length < brands && i < brands * 4; i++) brand(inventWord(r), KINDS[out.length % KINDS.length]);
  // Product families: "<Parent> <Word>" lives on its own host next to "<Parent>" (shadowing tests).
  for (const parent of r.shuffle(out).slice(0, families)) {
    for (const word of r.shuffle(PRODUCT_WORDS).slice(0, 2)) {
      brand(`${parent.name} ${word}`, KIND_OF_PRODUCT[word], { parent });
    }
  }
  // Near-collisions: same product word, different first word ("QL Classroom" vs "<Parent> Classroom"),
  // and one sound away ("Brindle" vs "Brendle").
  const fams = out.filter((b) => b.parent);
  for (let i = 0; i < collisions; i++) {
    if (i % 2 === 0 && fams.length) {
      const f = r.pick(fams), word = f.name.split(' ').pop();
      const other = r.chance(0.5) ? inventWord(r) : `${String.fromCharCode(65 + r.int(26))}${String.fromCharCode(65 + r.int(26))}`;
      brand(`${other} ${word}`, f.kind, { collidesWith: f.id, collision: 'word' });
    } else {
      const b = r.pick(out.filter((x) => !x.parent && !x.collidesWith));
      brand(oneSoundAway(r, b.name), b.kind, { collidesWith: b.id, collision: 'sound' });
    }
  }
  return { seed, brands: out, byHost: Object.fromEntries(out.map((b) => [b.host, b])) };
}

// A web search engine for the resolver's fallback in evals (its host is given to the app by env).
export const SEARCH_HOST = 'search.fixture-web.net';

// node eval/world.js 7 → prints a world summary
if (import.meta.url === `file://${process.argv[1]}`) {
  const w = makeWorld(Number(process.argv[2] ?? 1));
  for (const b of w.brands) console.log(b.id.padEnd(4), b.kind.padEnd(10), b.name.padEnd(24), b.host.padEnd(28), JSON.stringify(b.quirks).slice(0, 90), b.collidesWith ? `≈${b.collidesWith}` : '');
}
