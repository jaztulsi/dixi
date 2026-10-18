// The demo, hard-coded on purpose (the user asked for it on 2026-10-18; the second sanctioned exception
// after the Apple catalog). A sentence like one of these lines becomes these exact steps at once, with
// no AI call, and goes straight to fixed addresses: Apple products open on their exact configuration's
// page, searches open their results page.
//
// "Like" = the same things named, in any order, with any filler: every key word is said, and nothing
// else that matters is (no other product, colour, number or site), with a verb of the same kind. So
// "get me a black iPhone 17, 256 gigs, and AirPods Pro" is a line, but "...in white" or "...and an
// AirTag" is not, and goes to the normal understanding. No imports: interpret.js imports this file.

const words = (s) => String(s ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// How speech recognition spells the demo's names and units.
const JOINS = [
  [/\bair ?pods?\b/g, 'airpods'], [/\bair ?tags?\b/g, 'airtag'], [/\bmac ?books?\b/g, 'macbook'], [/\bi ?phones?\b/g, 'iphone'],
  [/\bi ?pads?\b/g, 'ipad'], [/\byou ?tube\b/g, 'youtube'], [/\b(lo|low) ?fi\b/g, 'lofi'], [/\bear ?buds?\b/g, 'earbuds'],
  [/\b(\d+) ?(gb|gigs?|gigabytes?)\b/g, '$1 gb'], [/\b(\d+) ?(tb|terabytes?)\b/g, '$1tb'], [/\bamazon( dot)? com\b/g, 'amazon'],
];
const NUMBER = { two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', sixteen: '16', seventeen: '17', eighteen: '18' };
const VERB = {};
for (const [kind, list] of Object.entries({
  buy: 'buy by bye get order grab purchase want need add', look: 'show find look see search browse',
  open: 'open launch visit pull bring load head navigate', remove: 'remove delete drop ditch take',
  make: 'make set change update bump increase', play: 'play watch listen',
})) for (const w of list.split(' ')) VERB[w] = kind;
const FILLER = new Set(('a an the me my i im id we us our please so um umm uh uhh hmm okay ok hey yo yeah yes alright can could would will you '
  + 'just now like thanks thank for to on in at with and then also plus of up out too some real quick really actually maybe dixi dixie it this '
  + 'that these those there here from into go store website site app page dot com bag cart basket shopping new latest color colour version '
  + 'gb one quantity amount number item pair').split(' '));
const sing = (w) => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

/** {verbs: kinds said, words: everything else that matters, seq: those words in order}, spelled one way. */
function canon(text) {
  let s = words(text);
  for (const [re, to] of JOINS) s = s.replace(re, to);
  const raw = s.split(' ').filter(Boolean).map((w) => NUMBER[w] ?? w);
  // "make the AirTag to": speech recognition's spelling of "two".
  if (raw.some((w) => VERB[w] === 'make') && /^(to|too)$/.test(raw.at(-1) ?? '')) raw[raw.length - 1] = '2';
  const verbs = new Set(), seq = [];
  for (const w of raw) if (VERB[w]) verbs.add(VERB[w]); else if (!FILLER.has(w)) seq.push(sing(w));
  const end = raw.at(-1) ?? '';
  return { verbs, words: new Set(seq), seq, last: VERB[end] || FILLER.has(end) ? '' : sing(end) };
}

const S = (act, extra = {}) => ({ act, said: '', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '', ...extra });
const APPLE = ['apple'];
const YT = 'https://www.youtube.com/results?search_query=lofi+beats';
const AMAZON = 'https://www.amazon.com/s?k=wireless+earbuds';
const IPHONE_COMPARED = 'The iPhone 17 has a bigger 6.3-inch ProMotion display that runs up to 120 hertz and is always on; the iPhone 16 has a 6.1-inch display at 60 hertz. '
  + 'The 17 has the newer A19 chip instead of the A18, a 48-megapixel ultra wide camera instead of 12, an 18-megapixel Center Stage front camera, '
  + 'and it starts at 256 gigabytes of storage instead of 128.';

// The iPhone 18 is sold only as the iPhone 18 Pro (6.3-inch) and Pro Max (6.9-inch): what was said picks
// the model, colour and storage (Black, 256 GB unless said).
const I18 = { colors: ['black', 'burgundy', 'glacier', 'silver'], storage: { 256: ['256gb', '256 gigabytes'], 512: ['512gb', '512 gigabytes'], '1tb': ['1tb', '1 terabyte'], '2tb': ['2tb', '2 terabytes'] } };
const I18_WORDS = ['pro', 'max', ...I18.colors, ...Object.keys(I18.storage)];
const i18 = (ws) => ({ max: ws.includes('max'), color: I18.colors.find((x) => ws.includes(x)) ?? 'black', size: Object.keys(I18.storage).find((x) => ws.includes(x)) ?? '256' });
const iphone18 = (ws) => { const o = i18(ws); return `iPhone 18 Pro${o.max ? ' Max' : ''} in ${o.color} with ${I18.storage[o.size][1]}`; };
/** The words said about `a`, up to where `b` is named ("iPhone 18 Pro Max and AirPods Pro"). */
const about = (seq, a, b) => { const i = seq.indexOf(a), j = seq.indexOf(b); return i < 0 ? [] : seq.slice(i, j > i ? j : undefined); };

// verbs: the kinds of verb the line takes ('' = it can be said with none). keys: all must be said.
// also: other words it may have. steps: what it does (or a function of what was said).
const LINES = [
  // Apple: iPhone 18 and AirPods, in the order said
  { verbs: ['buy'], keys: 'iphone 18 airpods', also: [...APPLE, ...I18_WORDS], steps: (c) => {
    const phone = S('order', { item: iphone18(about(c.seq, 'iphone', 'airpod')) });
    const pods = S('order', { item: about(c.seq, 'airpod', 'iphone').includes('max') ? 'AirPods Max' : 'AirPods Pro' });
    return c.seq.indexOf('airpod') < c.seq.indexOf('iphone') ? [pods, phone] : [phone, pods];
  } },
  { verbs: ['buy'], keys: 'iphone 18', also: [...APPLE, ...I18_WORDS], steps: (c) => [S('order', { item: iphone18(c.seq) })] },
  { verbs: ['make'], keys: 'iphone 2', also: [...APPLE, '17', '18', 'pro', 'max'], steps: [S('quantity', { value: 'set', qty: 2, item: 'iPhone' })] },
  { verbs: ['remove'], keys: 'airpods', also: [...APPLE, 'pro', '3', 'max'], steps: [S('remove', { item: 'AirPods' })] },
  // Apple: iPhone 17 and AirPods
  { verbs: ['buy'], keys: 'iphone 17 black 256 airpods pro', also: APPLE, steps: [S('order', { item: 'iPhone 17 in black with 256 gigabytes' }), S('order', { item: 'AirPods Pro' })] },
  { verbs: ['buy'], keys: 'iphone 17 black 256', also: APPLE, steps: [S('order', { item: 'iPhone 17 in black with 256 gigabytes' })] },
  { verbs: [''], keys: 'difference iphone 17 16', also: ['what', 'whats', 'between', 'compare', 'versus', 'vs', 'different', 'differ', 'how', 'is', 'are', 'does', 'tell', 'explain', 'better'],
    steps: [S('ask_page', { answer: IPHONE_COMPARED })] },
  { verbs: [''], keys: 'compare iphone 17 16', also: ['what', 'whats', 'between', 'versus', 'vs', 'how', 'does'], steps: [S('ask_page', { answer: IPHONE_COMPARED })] },
  // Apple: AirTag and MacBook
  { verbs: ['buy'], keys: 'airtag', also: APPLE, steps: [S('order', { item: 'AirTag' })] },
  { verbs: ['buy'], keys: 'macbook air midnight', also: APPLE, steps: [S('order', { item: 'MacBook Air in midnight' })] },
  { verbs: ['buy'], keys: 'airtag macbook air midnight', also: APPLE, steps: [S('order', { item: 'AirTag' }), S('order', { item: 'MacBook Air in midnight' })] },
  { verbs: ['make'], keys: 'airtag 2', also: APPLE, steps: [S('quantity', { value: 'set', qty: 2, item: 'AirTag' })] },
  { verbs: ['remove'], keys: 'macbook air', also: APPLE, steps: [S('remove', { item: 'MacBook Air' })] },
  // Apple: browse, ask, then buy
  { verbs: ['look'], keys: 'airpods apple', also: [], steps: [S('find_item', { said: 'Apple Store', item: 'AirPods', url: 'https://www.apple.com/us/search/AirPods?src=globalnav' })] },
  { verbs: ['buy'], keys: 'airpods pro', also: APPLE, steps: [S('order', { item: 'AirPods Pro' })] },
  { verbs: ['buy'], keys: 'ipad', also: APPLE, steps: [S('order', { item: 'iPad' })] },
  { verbs: ['', 'buy'], keys: 'ipad air', also: APPLE, steps: [S('order', { item: 'iPad Air' })] },
  // Amazon: search, check, buy
  { verbs: ['look'], keys: 'wireless earbuds amazon', also: [], steps: [S('search', { said: 'Amazon', query: 'wireless earbuds', url: AMAZON })] },
  { verbs: ['look', 'open'], keys: 'wireless earbuds amazon first', also: ['result', 'product', 'listing'], steps: [S('search', { said: 'Amazon', query: 'wireless earbuds', url: AMAZON }), S('nth', { n: 1 })] },
  { verbs: ['buy'], keys: 'wireless earbuds amazon', also: ['first', 'result', 'product', 'listing'], steps: [S('search', { said: 'Amazon', query: 'wireless earbuds', url: AMAZON }), S('add_to_cart', { n: 1 })] },
  // YouTube: find, play, control
  { verbs: ['', 'open'], keys: 'youtube', also: [], steps: [S('open', { said: 'YouTube', url: 'https://www.youtube.com/' })] },
  { verbs: ['look'], keys: 'lofi beats', also: [], steps: [S('search', { said: 'YouTube', query: 'lofi beats', url: YT })] },
  { verbs: ['', 'look', 'open'], keys: 'youtube lofi beats', also: [], steps: [S('search', { said: 'YouTube', query: 'lofi beats', url: YT })] },
  { verbs: ['play'], keys: 'lofi beats', also: ['youtube', 'music', 'video', 'song', 'mix', 'first'], steps: [S('search', { said: 'YouTube', query: 'lofi beats', url: YT }), S('nth', { n: 1, value: 'play' })] },
].map((l) => {
  const keys = canon(l.keys).words;
  return { ...l, keys, allow: new Set([...keys, ...canon(l.also.join(' ')).words]), verbs: new Set(l.verbs) };
});

// Nothing said that the line doesn't have; a whole line also needs its kind of verb (or none, if it takes none).
const fits = (l, c, whole = true) => [...c.words].every((w) => l.allow.has(w)) && [...c.verbs].every((v) => l.verbs.has(v)) && (!whole || c.verbs.size > 0 || l.verbs.has(''));
const said = (l, c) => [...l.keys].filter((k) => c.words.has(k)).length;

/** The demo line this sentence is (fresh copies of its steps), or null. */
export function demoSteps(text) {
  const c = canon(text);
  const hit = LINES.filter((l) => fits(l, c) && said(l, c) === l.keys.size).sort((a, b) => b.keys.size - a.keys.size)[0];
  if (!hit) return null;
  return typeof hit.steps === 'function' ? hit.steps(c) : hit.steps.map((s) => ({ ...s }));
}

/** The start of a demo line, not the whole of one yet ("buy me an iPhone 17 in black…"): wait for the rest. */
export function demoPartial(text) {
  const c = canon(text);
  if (demoSteps(text)) return false;
  return LINES.some((l) => {
    // The last word may still be arriving ("make the Air…" → AirTag): the start of one of the line's words.
    const growing = c.last && !l.allow.has(c.last) && [...l.allow].some((w) => w.startsWith(c.last));
    const d = growing ? { ...c, words: new Set([...c.words].filter((w) => w !== c.last)) } : c;
    return (growing || said(l, d) > 0) && fits(l, d, false);
  });
}

// Each demo product's exact configuration page (Apple's own links), so only the questions left
// (trade-in, AppleCare, engraving) are answered on the page.
const PAGES = [
  ['iphone 17 black 256', 'https://www.apple.com/shop/buy-iphone/iphone-17/6.3-inch-display-256gb-black-unlocked'],
  ['macbook air midnight', 'https://www.apple.com/shop/buy-mac/macbook-air/13-inch-midnight-m5-chip-10-core-cpu-8-core-gpu-16gb-memory-512gb-storage'],
  ['ipad air', 'https://www.apple.com/shop/buy-ipad/ipad-air/11-inch-display-128gb-space-gray-wifi-unlocked'],
].map(([k, url]) => ({ keys: canon(k).words, url }));
const I18_ALLOWED = new Set(['iphone', '18', ...canon(I18_WORDS.join(' ')).words]);

/** A demo product's configuration page for these item words (all of its words, nothing else), or null. */
export function productPage(item) {
  const c = canon(item), w = c.words;
  if (w.has('iphone') && w.has('18') && [...w].every((x) => I18_ALLOWED.has(x))) {
    const o = i18(c.seq);
    return `https://www.apple.com/shop/buy-iphone/iphone-18-pro/${o.max ? '6.9' : '6.3'}-inch-display-${I18.storage[o.size][0]}-${o.color}-unlocked`;
  }
  return PAGES.find((p) => w.size === p.keys.size && [...p.keys].every((k) => w.has(k)))?.url ?? null;
}
