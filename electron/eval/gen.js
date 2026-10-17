// Seeded corpus: templates × entities → spoken commands with gold intents and ground-truth expectations.
// Dev/held-out split is by template AND by entity AND by phrasing (some verbs/fillers only appear in
// held-out), so held-out measures generalization, not memory. Nothing here may be copied into src/.
//
// Gold intent (what the interpreter should produce):
//   {steps: [{act, said, query, item, n, value}], clarify?: true}
//   act ∈ open | search | order | find_item | add_to_cart | checkout | nth | media | scroll | nav | tab | zoom
//         | ask_page | ask_web | stop | none
//   said  = the site/app/product name exactly as spoken ("" = current page / not named)
// Expectation (checked against the fixture server's event log, never the app's own claims):
//   {visit: brandId} {search: {brand, q}} {cart: {brand, item}} {media: type} {watch: {brand, nth}}
//   {checkout: brand} {noNav: true} {clarify: true} {forbid: [brandId...]} {answer: regex source}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWorld, rng } from './world.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Phrasings. The last third of each list is held-out only (never seen while tuning).
const heldTail = (list) => ({ dev: list.slice(0, Math.ceil(list.length * 0.67)), held: list.slice(Math.ceil(list.length * 0.67)) });
const OPEN = heldTail(['open', 'go to', 'open up', 'pull up', 'take me to', 'bring up', 'visit', 'navigate to', 'launch', 'load up', 'get me to', 'fire up', 'head over to', 'jump to', 'hop on']);
const POLITE = heldTail(['', '', 'can you ', 'please ', 'go ahead and ', 'could you ', 'I want to ', 'hey, ', "let's ", 'would you mind, ', 'quickly ']);
const FILLER = heldTail(['', '', '', 'um, ', 'uh ', 'so ', 'okay ', 'like, ', 'alright so ']);
const TAIL = heldTail(['', '', '', ' please', ' for me', ' real quick', ' website', ' app', ' right now', ' thanks']);
const SEARCH = heldTail(['search for', 'search', 'look up', 'find', 'search up', 'look for', 'pull up', 'show me', 'hunt for']);
const BUY = heldTail(['buy me', 'order', 'get me', 'order me', 'I want', 'purchase', 'buy', "I'd like", 'grab me', 'pick up']);
const ORD = [['first', 1], ['second', 2], ['third', 3], ['last', -1], ['top', 1], ['2nd', 2]];
const MEDIA = [['pause', 'pause', 'media_pause'], ['pause the video', 'pause', 'media_pause'], ['mute it', 'mute', 'media_volumechange'], ['turn it up', 'louder', 'media_volumechange'],
  ['make it faster', 'faster', 'media_ratechange'], ['slow it down', 'slower', 'media_ratechange'], ['skip ahead', 'forward', 'media_seeked'], ['go back ten seconds', 'rewind', 'media_seeked'],
  ['start it over', 'restart', 'media_seeked'], ['next video', 'next', 'next'], ['turn on captions', 'captions', 'captions'], ['skip the ad', 'skip_ad', 'skip_ad']];
const OUT_OF_SCOPE = ['turn off the lights in the kitchen', 'call my mom', 'set an alarm for seven', 'what is two plus two equals in my head, never mind', 'remind me to drink water',
  'text Jake that I am running late', 'order an uber to the airport and pay with my card', 'unlock the front door'];
const CHITCHAT = ['thanks', 'that was cool', "I'm just talking to my friend", 'hold on a second', 'hmm', 'okay nice', 'wait what did he say'];
const STOP = ['stop', 'cancel', 'never mind', 'stop everything', 'cancel that'];

/**
 * @returns {cases: [...], world}
 */
export function generate(seed, { worldSeed = seed, perTemplate = 8 } = {}) {
  const world = makeWorld(worldSeed);
  const r = rng(seed * 7919 + 13);
  // Entity split: ~30% of brands are held-out only.
  const heldBrand = new Set(r.shuffle(world.brands.map((b) => b.id)).slice(0, Math.round(world.brands.length * 0.3)));
  const pool = (split, pred) => world.brands.filter((b) => (split === 'heldout') === heldBrand.has(b.id) && pred(b));
  const cases = [];
  const say = (...parts) => parts.join('').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  const pickP = (list, split) => r.pick(split === 'heldout' ? [...list.dev, ...list.held] : list.dev);
  const nameOf = (b) => b.name;
  const kindOf = (...ks) => (b) => ks.includes(b.kind);
  const sellable = kindOf('shop', 'grocery', 'restaurant', 'store');
  const searchable = (b) => b.quirks.search !== 'none';

  // Templates: [id, category, split, builder(split) → case | null]
  const T = [];
  const tpl = (id, cat, split, build) => T.push({ id, cat, split, build });
  const both = (id, cat, build, heldShare = 0.3) => { tpl(id, cat, r.chance(heldShare) ? 'heldout' : 'dev', build); };

  // ---- open ----
  for (const [id, cat, pred, extra] of [
    ['open.plain', 'open_site', () => true, ''],
    ['open.phrasal', 'open_phrasal', () => true, ''],
    ['open.polite', 'open_polite', () => true, ''],
    ['open.family', 'open_multiword_product', (b) => Boolean(b.parent), ''],
    ['open.collide', 'open_near_collision', (b) => Boolean(b.collidesWith), ''],
  ]) {
    for (const split of ['dev', 'heldout']) {
      tpl(`${id}.${split}`, cat, split, () => {
        const b = r.pick(pool(split, pred));
        if (!b) return null;
        const verb = id === 'open.phrasal' ? r.pick(['open up', 'pull up', 'bring up', 'load up', 'fire up']) : pickP(OPEN, split);
        const pre = id === 'open.polite' ? pickP(POLITE, split) || 'can you ' : '';
        const tail = pickP(TAIL, split).replace(/^ (website|app)$/, extra);
        const parentOrTwin = world.brands.find((x) => x.id === b.parent || x.id === b.collidesWith);
        return { text: say(pickP(FILLER, split), pre, verb, ' ', nameOf(b), tail, extra), gold: { steps: [{ act: 'open', said: nameOf(b) }] },
          expect: { visit: b.id, forbid: parentOrTwin ? [parentOrTwin.id] : [] }, entities: [b.id] };
      });
    }
  }
  // Shadowing: the parent alone must still open the parent ("<Parent>" not "<Parent> Classroom").
  for (const split of ['dev', 'heldout']) {
    tpl(`open.parent.${split}`, 'open_parent_not_child', split, () => {
      const child = r.pick(pool(split, (b) => Boolean(b.parent)));
      const parent = child && world.brands.find((x) => x.id === child.parent);
      if (!parent) return null;
      return { text: say(pickP(OPEN, split), ' ', parent.name), gold: { steps: [{ act: 'open', said: parent.name }] }, expect: { visit: parent.id, forbid: [child.id] }, entities: [parent.id] };
    });
  }
  // Compounds: "Brindle Mart" (STT spacing) is still Brindlemart.
  for (const split of ['dev', 'heldout']) {
    tpl(`open.spacing.${split}`, 'open_spacing_variant', split, () => {
      const b = r.pick(pool(split, (x) => !x.parent && x.name.length >= 7));
      if (!b) return null;
      const cut = 3 + r.int(b.name.length - 5);
      const spaced = `${b.name.slice(0, cut)} ${b.name.slice(cut).toLowerCase()}`;
      return { text: say(pickP(OPEN, split), ' ', spaced), gold: { steps: [{ act: 'open', said: spaced, guess: b.name }] }, expect: { visit: b.id }, entities: [b.id] };
    });
  }
  // Invented names that exist nowhere: must say "not found", never snap.
  for (const split of ['dev', 'heldout']) {
    tpl(`open.missing.${split}`, 'open_nonexistent', split, () => {
      const fake = `${'Zq'}${r.pick(['uillo', 'ombrix', 'avvet', 'ennox', 'irtle'])}${r.pick(['', ' Classroom', ' Market', ' Music'])}`;
      return { text: say(pickP(OPEN, split), ' ', fake), gold: { steps: [{ act: 'open', said: fake }] }, expect: { noNav: true, notFound: true }, entities: [] };
    });
  }

  // ---- search ----
  for (const split of ['dev', 'heldout']) {
    tpl(`search.on.${split}`, 'search_on_site', split, () => {
      const b = r.pick(pool(split, (x) => searchable(x) && x.items.length));
      if (!b) return null;
      const q = r.pick(b.items).base;
      return { text: say(pickP(FILLER, split), pickP(SEARCH, split), ' ', q, ' on ', b.name), gold: { steps: [{ act: 'search', said: b.name, query: q }] }, expect: { search: { brand: b.id, q } }, entities: [b.id] };
    });
    tpl(`search.sitefirst.${split}`, 'search_site_first', split, () => {
      const b = r.pick(pool(split, (x) => searchable(x) && x.items.length));
      if (!b) return null;
      const q = r.pick(b.items).base;
      const form = r.pick([`go to ${b.name} and search for ${q}`, `on ${b.name}, look up ${q}`, `${b.name}, search ${q}`, `open ${b.name} then find ${q}`, `pull up ${b.name} and look for ${q}`]);
      return { text: say(/^(go|open|pull)/.test(form) ? pickP(POLITE, split) : "", form), gold: { steps: [{ act: 'search', said: b.name, query: q }] }, expect: { search: { brand: b.id, q } }, entities: [b.id] };
    });
    tpl(`search.website.${split}`, 'find_on_named_website', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && searchable(x)));
      if (!b) return null;
      const q = r.pick(b.items).base;
      return { text: say(r.pick(['find me ', 'find ', 'look for ', 'show me ']), r.pick(['a ', 'some ', '']), q, ' on the ', b.name, r.pick([' website', ' site', ' app'])), gold: { steps: [{ act: 'find_item', said: b.name, item: q }] },
        expect: { search: { brand: b.id, q } }, entities: [b.id] };
    });
    tpl(`search.current.${split}`, 'search_current_site', split, () => {
      const b = r.pick(pool(split, (x) => searchable(x) && x.items.length));
      if (!b) return null;
      const q = r.pick(b.items).base;
      return { start: b.id, text: say(pickP(SEARCH, split), ' ', q), gold: { steps: [{ act: 'search', said: '', query: q }] }, expect: { search: { brand: b.id, q } }, entities: [b.id] };
    });
    tpl(`search.family.${split}`, 'search_on_multiword_product', split, () => {
      const b = r.pick(pool(split, (x) => Boolean(x.parent) && searchable(x) && x.items.length));
      if (!b) return null;
      const q = r.pick(b.items).base;
      return { text: say(pickP(SEARCH, split), ' ', q, ' on ', b.name), gold: { steps: [{ act: 'search', said: b.name, query: q }] }, expect: { search: { brand: b.id, q }, forbid: [b.parent] }, entities: [b.id] };
    });
  }

  // ---- buying ----
  for (const split of ['dev', 'heldout']) {
    tpl(`buy.from.${split}`, 'order_item_from_store', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && !x.items.some((i) => i.options)));
      if (!b) return null;
      const it = r.pick(b.items);
      return { text: say(pickP(BUY, split), ' ', r.pick(['a ', 'some ', '']), it.base, ' ', r.pick(['from', 'at', 'on']), ' ', b.name), gold: { steps: [{ act: 'order', said: b.name, item: it.base }] },
        expect: { cart: { brand: b.id, item: it.base }, noOrder: true }, entities: [b.id] };
    });
    tpl(`buy.sitefirst.${split}`, 'order_site_first', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && !x.items.some((i) => i.options)));
      if (!b) return null;
      const it = r.pick(b.items);
      return { text: say(r.pick(['go to ', 'open ', 'pull up ']), b.name, r.pick([' and ', ', ', ' then ']), pickP(BUY, split), ' ', r.pick(['a ', '']), it.base), gold: { steps: [{ act: 'order', said: b.name, item: it.base }] },
        expect: { cart: { brand: b.id, item: it.base }, noOrder: true }, entities: [b.id] };
    });
    tpl(`buy.qty.${split}`, 'order_quantity', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && !x.items.some((i) => i.options)));
      if (!b) return null;
      const it = r.pick(b.items), [w, n] = r.pick([['two', 2], ['three', 3], ['2', 2]]);
      return { text: say(pickP(BUY, split), ' ', w, ' ', it.base, ' from ', b.name), gold: { steps: [{ act: 'order', said: b.name, item: it.base, qty: n }] },
        expect: { cart: { brand: b.id, item: it.base, qty: n }, noOrder: true }, entities: [b.id] };
    });
    tpl(`buy.options.${split}`, 'order_with_required_options', split, () => {
      const b = r.pick(pool(split, (x) => x.items.some((i) => i.options)));
      if (!b) return null;
      const it = r.pick(b.items.filter((i) => i.options));
      return { text: say(pickP(BUY, split), ' ', r.pick(['a ', 'the ']), it.base, ' from ', b.name, ', any color and storage is fine'), gold: { steps: [{ act: 'order', said: b.name, item: it.base }] },
        expect: { cart: { brand: b.id, item: it.base }, noOrder: true }, entities: [b.id] };
    });
    tpl(`buy.checkout.${split}`, 'go_to_purchase_on_item_page', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && !x.items.some((i) => i.options)));
      if (!b) return null;
      const it = r.pick(b.items);
      return { start: `${b.id}/item/${it.sku}`, text: r.pick(['go to purchase', 'buy it now', 'purchase this', 'check out', 'buy this one', "let's buy it"]),
        gold: { steps: [{ act: 'checkout', said: '' }] }, expect: { checkout: b.id, noOrder: true }, entities: [b.id] };
    });
    tpl(`cart.add.${split}`, 'add_to_cart_current', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && !x.items.some((i) => i.options)));
      if (!b) return null;
      const it = r.pick(b.items);
      return { start: `${b.id}/item/${it.sku}`, text: r.pick(['add it to my cart', 'add this to the cart', 'put it in my cart', 'add to cart', 'throw this in the cart']),
        gold: { steps: [{ act: 'add_to_cart', said: '' }] }, expect: { cart: { brand: b.id, item: it.base }, noOrder: true }, entities: [b.id] };
    });
    tpl(`place.order.${split}`, 'place_order_must_gate', split, () => {
      const b = r.pick(pool(split, (x) => sellable(x) && !x.quirks.login));
      if (!b) return null;
      return { start: `${b.id}/review`, text: r.pick(['place the order', 'confirm my order', 'pay for it', 'submit the order']),
        gold: { steps: [{ act: 'checkout', said: '', value: 'place_order' }] }, expect: { noOrder: true, confirmAsked: true }, entities: [b.id] };
    });
  }

  // ---- results, media, page ----
  for (const split of ['dev', 'heldout']) {
    tpl(`nth.${split}`, 'nth_result', split, () => {
      const b = r.pick(pool(split, (x) => (x.kind === 'video' || x.kind === 'music') && x.items.length));
      if (!b) return null;
      const topic = r.pick(b.items).base, [w, n] = r.pick(ORD);
      return { start: `${b.id}/search?q=${encodeURIComponent(topic)}`, text: r.pick([`play the ${w} video`, `open the ${w} one`, `click the ${w} result`, `play the ${w} one`, `watch the ${w} video`]),
        gold: { steps: [{ act: 'nth', said: '', n }] }, expect: { watch: { brand: b.id, nth: n, q: topic } }, entities: [b.id] };
    });
    tpl(`media.${split}`, 'media_control', split, () => {
      const b = r.pick(pool(split, (x) => x.kind === 'video' && x.items.length));
      if (!b) return null;
      const [text, value, ev] = r.pick(MEDIA.filter((m) => m[1] !== 'skip_ad' || b.quirks.ad));
      return { start: `${b.id}/watch/${b.items[0].sku}`, text, gold: { steps: [{ act: 'media', said: '', value }] }, expect: { media: ev }, entities: [b.id] };
    });
    tpl(`chain.${split}`, 'multi_step_chain', split, () => {
      const b = r.pick(pool(split, (x) => x.kind === 'video' && searchable(x) && x.items.length));
      if (!b) return null;
      const topic = r.pick(b.items).base, [w, n] = r.pick(ORD.slice(0, 3));
      return { text: say(pickP(OPEN, split), ' ', b.name, r.pick([', ', ' and ']), r.pick(['search ', 'look up ', 'search for ']), topic, r.pick([' and ', ', then ', ' then ']), `play the ${w} one`),
        gold: { steps: [{ act: 'search', said: b.name, query: topic }, { act: 'nth', said: '', n }] }, expect: { search: { brand: b.id, q: topic }, watch: { brand: b.id, nth: n, q: topic } }, entities: [b.id] };
    });
    tpl(`chain.media.${split}`, 'multi_step_media', split, () => {
      const b = r.pick(pool(split, (x) => x.kind === 'video' && x.items.length));
      if (!b) return null;
      const [m1, v1, e1] = r.pick(MEDIA.slice(0, 2)), [m2, v2, e2] = r.pick(MEDIA.slice(2, 6));
      return { start: `${b.id}/watch/${b.items[0].sku}`, text: `${m1} and ${m2}`, gold: { steps: [{ act: 'media', said: '', value: v1 }, { act: 'media', said: '', value: v2 }] },
        expect: { media: e1, media2: e2 }, entities: [b.id] };
    });
    tpl(`ask.page.${split}`, 'question_about_page', split, () => {
      const b = r.pick(pool(split, (x) => x.kind === 'video' && x.items.length));
      if (!b) return null;
      const it = b.items[0];
      const [q, ans] = r.pick([[`how many subscribers does this channel have`, it.subs.split(' ')[0]], [`how many views does this have`, it.views.split(' ')[0]], [`who made this video`, it.channel]]);
      return { start: `${b.id}/watch/${it.sku}`, text: q, gold: { steps: [{ act: 'ask_page', said: '' }] }, expect: { answer: ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), noNav: true }, entities: [b.id] };
    });
    tpl(`correction.${split}`, 'mid_sentence_correction', split, () => {
      const [a, b] = r.shuffle(pool(split, (x) => searchable(x) && x.items.length));
      if (!a || !b) return null;
      const q = r.pick(b.items).base;
      const form = r.pick([[`open ${a.name}, no wait, open ${b.name}`, [{ act: 'open', said: b.name }], { visit: b.id, forbid: [a.id] }],
        [`search ${q} on ${a.name} actually on ${b.name}`, [{ act: 'search', said: b.name, query: q }], { search: { brand: b.id, q }, forbid: [a.id] }],
        [`go to ${a.name}, I mean ${b.name}`, [{ act: 'open', said: b.name }], { visit: b.id, forbid: [a.id] }]]);
      return { text: form[0], gold: { steps: form[1] }, expect: form[2], entities: [a.id, b.id] };
    });
    tpl(`negation.${split}`, 'negation', split, () => {
      const [a, b] = r.shuffle(pool(split, () => true));
      if (!a || !b) return null;
      return { text: `don't open ${a.name}, open ${b.name}`, gold: { steps: [{ act: 'open', said: b.name }] }, expect: { visit: b.id, forbid: [a.id] }, entities: [a.id, b.id] };
    });
    tpl(`nav.${split}`, 'page_navigation', split, () => {
      const b = r.pick(pool(split, (x) => x.items.length));
      if (!b) return null;
      return { start: b.id, text: r.pick(['scroll down', 'scroll down a bit', 'go to the bottom', 'scroll up']), gold: { steps: [{ act: 'scroll', said: '' }] }, expect: { noNav: true }, entities: [b.id] };
    });
    tpl(`oos.${split}`, 'out_of_scope', split, () => ({ text: r.pick(OUT_OF_SCOPE), gold: { steps: [{ act: 'none', said: '' }] }, expect: { noNav: true }, entities: [] }));
    tpl(`chat.${split}`, 'small_talk', split, () => ({ text: r.pick(CHITCHAT), gold: { steps: [{ act: 'none', said: '' }] }, expect: { noNav: true }, entities: [] }));
    tpl(`stop.${split}`, 'stop_cancel', split, () => ({ text: r.pick(STOP), gold: { steps: [{ act: 'stop', said: '' }] }, expect: { noNav: true }, entities: [] }));
    tpl(`ambiguous.${split}`, 'ambiguous_target', split, () => {
      const b = r.pick(pool(split, (x) => x.collision === 'word'));
      if (!b) return null;
      const word = b.name.split(' ').pop();
      return { text: say(pickP(OPEN, split), ' ', word), gold: { steps: [{ act: 'open', said: word }], clarify: true }, expect: { clarify: true, noNavTo: [b.id, b.collidesWith] }, entities: [b.id] };
    });
    tpl(`web.${split}`, 'question_about_world', split, () => {
      const b = r.pick(pool(split, () => true));
      if (!b) return null;
      return { text: r.pick([`what is ${b.name}`, `who owns ${b.name}`, `what does ${b.name} do`]), gold: { steps: [{ act: 'ask_web', said: b.name }] }, expect: { noNavTo: [b.id] }, entities: [b.id] };
    });
  }

  // Build: perTemplate cases per template, deduped by text.
  const seen = new Set();
  for (const tp of T) {
    // ~70/30: every category has a dev and a held-out template; held-out ones get fewer draws.
    const n = tp.split === 'heldout' ? Math.ceil(perTemplate * 0.43) : perTemplate;
    for (let k = 0; k < n; k++) {
      const c = tp.build(tp.split);
      if (!c || seen.has(c.text.toLowerCase())) continue;
      seen.add(c.text.toLowerCase());
      cases.push({ id: `${tp.split === 'heldout' ? 'h' : 'd'}${cases.length}`, split: tp.split, cat: tp.cat, tpl: tp.id, ...c });
    }
  }
  return { cases, world, heldBrands: [...heldBrand] };
}

// node eval/gen.js [seed] [perTemplate] → writes eval/out/corpus-<seed>.jsonl and prints a summary
if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number(process.argv[2] ?? 1);
  const { cases } = generate(seed, { perTemplate: Number(process.argv[3] ?? 8) });
  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  const file = path.join(here, 'out', `corpus-${seed}.jsonl`);
  fs.writeFileSync(file, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  const by = (k) => Object.entries(cases.reduce((m, c) => ((m[c[k]] = (m[c[k]] ?? 0) + 1), m), {}));
  console.log(`${cases.length} cases → ${path.relative(process.cwd(), file)}`);
  console.log('split:', JSON.stringify(Object.fromEntries(by('split'))));
  console.log(`categories (${by('cat').length}):`, by('cat').map(([k, v]) => `${k}=${v}`).join(' '));
}
