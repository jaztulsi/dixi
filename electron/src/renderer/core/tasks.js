// Whole requests understood in code, in any order, with no AI call:
//   "go to Burger King order me a Whopper", "AirPods, Amazon, add to cart", "play baby shark",
//   "who is the CEO of Tesla", "search for cats on YouTube no wait dogs".
// planTask() turns one spoken clause into steps the voice agent runs in order; [] = understood,
// nothing to do ("search them" right after a search); null = not mine (rules, on-device model, then AI).
// Deterministic: same words + same page → same steps.

import { ordinal } from './siteActions.js';
import { SITE_MAP } from './text.js';

// key → [home page, search URL with {q}] (null search = no search page: the agent finds it on the page).
// Keys are the name with spaces/punctuation removed, so "Chick-fil-A", "chick fil a" and "chickfila" agree.
const SITES = {
  youtube: ['https://www.youtube.com', 'https://www.youtube.com/results?search_query={q}'],
  amazon: ['https://www.amazon.com', 'https://www.amazon.com/s?k={q}'],
  google: ['https://www.google.com', 'https://www.google.com/search?q={q}'],
  googlemaps: ['https://www.google.com/maps', 'https://www.google.com/maps/search/{q}'],
  wikipedia: ['https://en.wikipedia.org', 'https://en.wikipedia.org/wiki/Special:Search?search={q}'],
  reddit: ['https://www.reddit.com', 'https://www.reddit.com/search/?q={q}'],
  github: ['https://github.com', 'https://github.com/search?q={q}&type=repositories'],
  ebay: ['https://www.ebay.com', 'https://www.ebay.com/sch/i.html?_nkw={q}'],
  bestbuy: ['https://www.bestbuy.com', 'https://www.bestbuy.com/site/searchpage.jsp?st={q}'],
  target: ['https://www.target.com', 'https://www.target.com/s?searchTerm={q}'],
  walmart: ['https://www.walmart.com', 'https://www.walmart.com/search?q={q}'],
  nike: ['https://www.nike.com', 'https://www.nike.com/w?q={q}'],
  homedepot: ['https://www.homedepot.com', 'https://www.homedepot.com/s/{q}'],
  doordash: ['https://www.doordash.com', 'https://www.doordash.com/search/store/{q}/'],
  ubereats: ['https://www.ubereats.com', 'https://www.ubereats.com/search?q={q}'],
  x: ['https://x.com', 'https://x.com/search?q={q}'],
  spotify: ['https://open.spotify.com', 'https://open.spotify.com/search/{q}'],
  gmail: ['https://mail.google.com', 'https://mail.google.com/mail/u/0/#search/{q}'],
  netflix: ['https://www.netflix.com', null],
  burgerking: ['https://www.bk.com', null],
  mcdonalds: ['https://www.mcdonalds.com', null],
  chickfila: ['https://www.chick-fil-a.com', null],
  starbucks: ['https://www.starbucks.com', null],
  dominos: ['https://www.dominos.com', null],
  tacobell: ['https://www.tacobell.com', null],
  chipotle: ['https://www.chipotle.com', null],
  wendys: ['https://www.wendys.com', null],
  subway: ['https://www.subway.com', null],
  pizzahut: ['https://www.pizzahut.com', null],
  kfc: ['https://www.kfc.com', null],
};
// How each is said, when it isn't just the key. Longest match wins ("google maps" over "google").
const SPOKEN = {
  googlemaps: ['google maps', 'maps'], bestbuy: ['best buy'], homedepot: ['the home depot', 'home depot'],
  doordash: ['door dash', 'doordash'], ubereats: ['uber eats', 'ubereats'], burgerking: ['burger king'],
  mcdonalds: ["mcdonald's", 'mcdonalds', 'mc donalds', 'mcdonald'], chickfila: ['chick-fil-a', 'chick fil a', 'chickfila'],
  dominos: ["domino's", 'dominos'], tacobell: ['taco bell'], wendys: ["wendy's", 'wendys'], pizzahut: ['pizza hut'],
  x: ['twitter', 'x'],
};
const DISPLAY = { youtube: 'YouTube', googlemaps: 'Google Maps', bestbuy: 'Best Buy', homedepot: 'Home Depot', doordash: 'DoorDash',
  ubereats: 'Uber Eats', burgerking: 'Burger King', mcdonalds: "McDonald's", chickfila: 'Chick-fil-A', dominos: "Domino's",
  tacobell: 'Taco Bell', wendys: "Wendy's", pizzahut: 'Pizza Hut', x: 'X', ebay: 'eBay', github: 'GitHub', kfc: 'KFC' };
const RESTAURANTS = new Set(['burgerking', 'mcdonalds', 'chickfila', 'starbucks', 'dominos', 'tacobell', 'chipotle', 'wendys', 'subway', 'pizzahut', 'kfc']);

const NAMES = Object.keys(SITES).flatMap((k) => (SPOKEN[k] ?? [k]).map((s) => [s, k])).sort((a, b) => b[0].length - a[0].length);
const NAME_RE = new RegExp(`\\b(${NAMES.map(([s]) => s.replace(/[-'.]/g, (c) => `\\${c}`)).join('|')})\\b`, 'i');
// Apple products go to Apple's own buy page (SITE_MAP). Speech spells them loosely ("air pod pros"),
// so compare with spaces and plural s's removed: "air pod pros" = "airpods pro" = "airpodpro".
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).map((w) => w.replace(/s$/, '')).join('');
const APPLE_BUY = Object.entries(SITE_MAP).filter(([, url]) => url.includes('apple.com/shop/buy')).map(([name, url]) => [squash(name), url])
  .sort((a, b) => b[0].length - a[0].length);
/** Apple's buy page for a product said any way ("air pod pros", "a new iPad"), or null. */
export const appleBuyURL = (item) => APPLE_BUY.find(([k]) => squash(item).startsWith(k))?.[1] ?? null;

const keyOf = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const siteKey = (spoken) => NAMES.find(([s]) => s === spoken.toLowerCase())?.[1] ?? keyOf(spoken);
const show = (key) => DISPLAY[key] ?? key[0].toUpperCase() + key.slice(1);

/** The known site a URL belongs to ("https://www.bk.com/menu" → "burgerking"), or null. */
export function siteForURL(url) {
  let host = '', path = '';
  try { ({ hostname: host, pathname: path } = new URL(url)); } catch { return null; }
  host = host.replace(/^www\./, '');
  if (host === 'google.com' && path.startsWith('/maps')) return 'googlemaps';
  return Object.keys(SITES).find((k) => new URL(SITES[k][0]).hostname.replace(/^www\./, '') === host) ?? null;
}

/** Home page for a site name; unknown brands are their name + .com ("Best Buy" is known; "Panda Express" → pandaexpress.com). */
export function homeURL(name) {
  const key = siteKey(name.replace(/^the\s+/i, '').replace(/\s+(website|site|web site|page|homepage|app)$/i, ''));
  if (SITES[key]) return SITES[key][0];
  return /^[a-z0-9-]{2,30}$/.test(key) ? `https://www.${key}.com` : null;
}

const FOOD = /\b(burgers?|whopper|big mac|fries|pizza|pepperoni|tacos?|burritos?|bowl|sushi|chicken|nuggets?|wings?|sandwich|salad|coffee|latte|frappuccino|mcflurry|shake|milkshake|breakfast|lunch|dinner|meal|food|noodles|ramen|pho|donuts?|bagel)\b/i;
const FILLER = /\b(um+|uh+|erm|you know|please|can you|could you|would you|will you|for me|i'?m hungry|real quick|right now|just)\b|\blike,|\blike\b(?=\s+(find|search|play|open|order|get|go|show|look))/gi;
const CORRECTION = /[,.\s]+(?:no wait|no no|wait no|actually|i mean|sorry|scratch that|make that|rather)[,.\s]+/i;
const PAGE_WORDS = /\b(this|that|these|it|he|she|him|her|they|them|his|its|their|here|page|video|article|post|product|item|channel|ingredients|price|views|stars|subscribers)\b/i;
const QUESTION = /^(who|whose|what|what's|whats|when|where|why|how|which|is|are|was|were|does|do|did|can|could|should|will|would|tell me|explain|summari[sz]e|describe)\b/i;
const PRONOUN_ONLY = /^(it|this|that|them|those|these|there|one|the first one)$/;
const ARTICLES = /\b(a|an|the|some|my|me)\b/g;

const clean = (s) => s.replace(FILLER, ' ').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().replace(/^[\s,.;!?]+|[\s,.;!?]+$/g, '');
const strip = (s, ...res) => clean(res.reduce((t, re) => t.replace(re, ' '), s)).replace(/^(and|then|of|for|to)\s+|\s+(and|then|of|for|to|on|in|at)$/g, '').trim();

/**
 * @param clause one spoken command (already split from the sentence)
 * @param ctx {site: URL the page is on (or will be, after what's queued), lastQuery, lastCommand}
 * @returns steps: {do: 'open'|'search', url, label, query?} | {do: 'command', text, label}
 *          | {do: 'order', item, label} | {do: 'ask', question, label}; [] = nothing to do; null = not understood here
 */
export function planTask(clause, ctx = {}) {
  const t = clean(clause);
  if (!t) return clause.trim() ? [] : null;  // "I'm hungry": nothing to do (and no AI call)

  // "search cats on YouTube no wait dogs", "open Amazon actually open Best Buy", "the first, I mean the second one"
  const fix = t.split(CORRECTION);
  if (fix.length > 1) return correct(fix[0], fix.at(-1), ctx);

  const lower = t.toLowerCase();
  const named = lower.match(NAME_RE);
  const key = named ? siteKey(named[1]) : null;
  const rest = named ? clean(lower.replace(named[0], ' ')) : lower;   // the words that aren't the site's name
  const here = siteForURL(ctx.site ?? '');
  const hasPage = /^https?:/.test(ctx.site ?? '');
  const n = ordinal(rest);

  // ---- Dixi's own controls, mixed into a request: "new tab, Wikipedia, black holes" ----
  const tab = rest.match(/^(?:open\s+)?(?:a\s+)?new tab\b[,\s]*(?:and\s+|then\s+)?(.*)$/);
  if (tab && tab[1]) return [{ do: 'command', text: 'new tab', label: 'New tab' }, ...(planTask(named ? `${tab[1]} ${named[1]}` : tab[1], { ...ctx, site: '' }) ?? [])];
  if (/^switch (back )?to the (first|previous|last|other) tab$/.test(rest)) return [{ do: 'command', text: 'previous tab', label: 'Previous tab' }];
  if (/^zoom (back )?out$/.test(rest)) return [{ do: 'command', text: 'zoom out', label: 'Zoomed out' }];
  if (/^(go |scroll )?(back )?(up )?to the top( of the page)?$/.test(rest)) return [{ do: 'command', text: 'go to the top', label: 'Top of page' }];

  // ---- questions: about the page in front of you, or about the world (a web search) ----
  const tailQuestion = lower.match(/^(.+?),\s*((?:what|who|how|where|when)\b.*)$/);   // "the weather in New York, what is it"
  if (QUESTION.test(lower) || tailQuestion) {
    const aboutPage = /^(summari[sz]e|describe|explain)\b/.test(lower) || (hasPage && here !== 'google' && PAGE_WORDS.test(lower) && !key);
    if (aboutPage) return [{ do: 'ask', question: clause.trim(), label: 'Answering from the page' }];
    if (!hasPage || here === 'google' || !PAGE_WORDS.test(lower) || /\b(weather|time in|stock|price of)\b/.test(lower)) {
      return [search('google', tailQuestion ? `${tailQuestion[1]}` : strip(t, /^tell me\s+/i))];
    }
    return null;
  }

  // ---- pronoun-only follow-ups: "search them", "open it", "play it" right after doing that ----
  const verbOnly = rest.match(/^(search|find|look up|open|play|watch|click|select)\s+(.+)$/);
  if (verbOnly && PRONOUN_ONLY.test(verbOnly[2].replace(/\s+on$/, ''))) {
    if (/^(search|find|look up)$/.test(verbOnly[1])) return [];                                   // already searched
    if (/^(play|watch)$/.test(verbOnly[1]) && /^play/.test(ctx.lastCommand ?? '')) return [];     // already playing
    if (here === 'youtube' && /\/results/.test(ctx.site)) return [{ do: 'command', text: 'play the first video', label: 'Playing video 1' }];
    if (/^open|click|select$/.test(verbOnly[1]) && /[?&](k|q|search_query|st|_nkw)=/.test(ctx.site ?? '')) {
      return [{ do: 'command', text: 'open the first result', label: 'Opening result 1' }];
    }
    return null;
  }

  // ---- "<site> menu", "<topic> Wikipedia page" ----
  if (key && /\bmenu\b/.test(rest) && !/\b(order|get|buy)\b/.test(rest)) return [{ do: 'open', url: `${SITES[key][0]}/menu`, label: `${show(key)} menu` }];
  const wiki = lower.match(/^(?:open|show me|go to|pull up)?\s*(?:the\s+)?(.+?)\s+wikipedia\s+(?:page|article)$/);
  if (wiki) return [search('wikipedia', wiki[1])];

  // ---- the cart: "AirPods, Amazon, add to cart", "to my Amazon cart add a phone charger" ----
  if (/\b(cart|basket)\b/.test(rest)) {
    const item = strip(rest, /\b(add(ed)?|put|place|them|it|this|that|to|into|in|cart|basket|on|from|at|and|i want|i'?d like|get|buy|one)\b/g,
      /\b(first|second|third|fourth|fifth|last|top|1st|2nd|3rd)\b/g, ARTICLES);
    const where = key && SITES[key][1] ? key : here && SITES[here][1] && !item ? here : 'amazon';
    const add = { do: 'command', text: n && n.index !== 0 ? `add result ${n.index < 0 ? 'last' : n.index + 1} to cart` : 'add it to cart', label: 'Adding to cart' };
    if (!item) return [add];
    // Amazon: the product page's own Add to Cart works for far more items than the results page does.
    return where === 'amazon' && (!n || n.index === 0) ? [search(where, item), { do: 'command', text: 'open the first result', label: 'Opening it' }, add] : [search(where, item), add];
  }

  // ---- near me: "I'm hungry, find burger places near me", "find the nearest Starbucks" ----
  if (/\b(near me|nearby|nearest|closest|around here)\b/.test(lower) && !(key && SITES[key][1] && key !== 'googlemaps')) {
    const q = strip(lower, /\b(find|show me|look for|search for|search|where is|where are|nearest|closest|near me|nearby|around here|on google maps|on maps)\b/g, ARTICLES);
    if (q) return [search('googlemaps', q)];
  }

  // ---- ordering food / buying things ----
  const orderVerb = /\b(order|buy|purchase|get me|grab me|get|grab|i want|i'?d like|i need)\b/;
  const fromSite = rest.match(/\b(?:from|at)\s+(?:the\s+)?([a-z0-9'&.\- ]{2,30}?)(?:\s+(?:website|site|app))?$/);
  const restaurantHere = here && RESTAURANTS.has(here);
  if (orderVerb.test(rest) || (key && RESTAURANTS.has(key) && FOOD.test(rest))) {
    const where = key ?? (fromSite ? siteKey(fromSite[1]) : restaurantHere ? here : null);
    // The site's name is already out of `rest`; only an unknown "from <place>" at the end still needs cutting.
    const fromTail = key ? /\b(?:from|at)\b(?=\s|$)/ : /\b(?:from|at)\s+(?:the\s+)?[a-z0-9'&.\- ]+?(?:\s+(?:website|site|app))?$/;
    const item = strip(rest, fromTail, /\b(?:from|at)\b(?=\s*$)/g,
      new RegExp(orderVerb.source, 'g'), /\b(go to|open it|open|it|website|site|and order|order)\b/g, ARTICLES);
    if (!item || /^(that|this|it|them|something|stuff|one)( thing| stuff)?$|^(that|this|the) thing$/.test(item)) return where && !item ? [open(where)] : null;
    if (where && SITES[where]?.[1]) return [search(where, item)];        // Amazon, DoorDash...: their own search
    if (where) {
      // On the restaurant's own site, without the AI: its menu, the dish by name, its add button.
      const steps = [{ do: 'command', text: `find ${item} on the menu`, label: `Finding “${item}”` },
        { do: 'command', text: 'add it to the order', label: `Adding “${item}” to the order` }];
      const menu = { do: 'open', url: `${SITES[where]?.[0] ?? homeURL(where)}/menu`, label: `${show(where)} menu` };
      return key || !restaurantHere ? [menu, ...steps] : steps;
    }
    const apple = !where && appleBuyURL(strip(item, /\b(new|the|an?)\b/g));
    if (apple) return [{ do: 'open', url: apple, label: `Apple: ${item}` }];
    return [FOOD.test(item) ? search('doordash', item) : search('amazon', item)];
  }

  // ---- "show it on Google Maps": "it" = what was just looked up ----
  if (key && SITES[key][1] && /\b(it|them|that|there)\b/.test(rest) && /\b(show|find|search|look|open|see)\b/.test(rest) && ctx.lastQuery) {
    return [search(key, ctx.lastQuery)];
  }

  // ---- play something: "play baby shark", "lofi beats YouTube play", "YouTube, lofi, first video" ----
  const mediaWords = /\b(play|watch|put on|listen to|video|videos|song|music|first|second|third|last|top)\b/;
  if ((/\b(play|watch|put on|listen to)\b/.test(rest) && (!key || key === 'youtube')) || (key === 'youtube' && mediaWords.test(rest))) {
    const q = strip(rest, /\b(play|watch|put on|listen to|on|in|it|video|videos|one|that|this|number \w+|and|then)\b/g,
      /\b(first|second|third|fourth|fifth|last|top|1st|2nd|3rd)\b/g, ARTICLES);
    if (!q) return null;                                                   // "play the first video": the rules
    if (/^(next|again|music|song|the next one)$/.test(q)) return null;
    const which = n && n.index !== 0 ? (n.index < 0 ? 'play the last video' : `play video number ${n.index + 1}`) : 'play the first video';
    return [search('youtube', q), { do: 'command', text: which, label: 'Playing it' }];
  }
  // "find the latest Mr Beast video": videos live on YouTube
  if (!key && /\b(find|search|look up|show me)\b/.test(rest) && /\bvideos?\b/.test(rest)) {
    return [search('youtube', strip(rest, /\b(find|search for|search|look up|show me|on youtube)\b/g, ARTICLES))];
  }

  // ---- "check the weather", flights, compare: the web ----
  if (/\b(weather|flights?|compare|recipe|how to)\b/.test(rest) && !key) {
    return [search('google', strip(lower, /\b(find|look up|search for|search|show me|check|tell me)\b/g, ARTICLES))];
  }

  // ---- search, in any order: "find AirPods on Amazon", "Amazon search headphones", "search Amazon for X",
  //      "headphones on Amazon", "AirPods, Amazon", and "search jazz" on the site you're on ----
  const searchVerb = /\b(search|look up|look for|find|show me|search for)\b/.test(rest);
  const target = key && SITES[key][1] ? key : !key && searchVerb ? (here && SITES[here]?.[1] && here !== 'googlemaps' ? here : 'google') : null;
  if (target) {
    const cheapest = /\b(cheapest|lowest price|least expensive)\b/.test(rest);
    let q = strip(rest, /\b(search for|search|look up|look for|find|show me|me|on|in|at|for|the cheapest one|cheapest|and|open it|open|go to|take me to|pull up|then|repo|repository)\b/g, ARTICLES);
    if (q && !/^(website|site|page|homepage|app)$/.test(q)) {
      const step = search(target, q);
      if (cheapest && target === 'amazon') step.url += '&s=price-asc-rank';
      const steps = [step];
      if (target === 'github' && /\b(repo|repository)\b/.test(rest)) steps.push({ do: 'command', text: 'open the first result', label: 'Opening the repo' });
      return steps;
    }
    if (key && !q) return [open(key)];
  }

  // ---- go somewhere: "take me to GitHub", "pull up Reddit", "Burger King website", "launch Spotify" ----
  const go = lower.match(/^(?:open|go to|navigate to|visit|take me to|bring me to|pull up|bring up|launch|load|show me|i want to go to)\s+(?:the\s+)?(.+?)(?:\s+(?:website|site|homepage|page|app))?$/)
    ?? lower.match(/^(?:the\s+)?(.+?)\s+(?:website|site|homepage)$/);
  if (go && !PRONOUN_ONLY.test(go[1]) && !/\b(first|second|third|last|next|new tab|tab|top|bottom|result|video|link|settings|cart|back)\b/.test(go[1])) {
    const name = go[1].trim();
    if (key && clean(name.replace(NAME_RE, '')) === '') return [open(key)];
    if (!key && name.split(' ').length <= 3 && /^[a-z0-9'&\-. ]+$/.test(name)) {
      const url = homeURL(name);
      if (url) return [{ do: 'open', url, label: `Opening ${name.replace(/\b\w/g, (c) => c.toUpperCase())}` }];
    }
  }
  if (key && clean(rest) === '') return [open(key)];   // just "YouTube"
  return null;
}

function correct(before, after, ctx) {
  const b = clean(before).toLowerCase(), a = clean(after).toLowerCase();
  const nb = ordinal(b), na = ordinal(a);
  if (na && nb) return [{ do: 'command', text: na.index < 0 ? 'play the last video' : `play video number ${na.index + 1}`, label: `Video ${na.label}` }];
  const fresh = planTask(after, ctx);
  if (fresh?.length) return fresh;
  const s = planTask(before, ctx);
  if (s?.length === 1 && s[0].do === 'search' && s[0].query) {       // "search cats on YouTube" + "dogs"
    return [{ ...s[0], url: s[0].url.replace(encodeURIComponent(s[0].query), encodeURIComponent(a)), query: a, label: s[0].label.replace(s[0].query, a) }];
  }
  if (s?.[0]?.do === 'open') return planTask(`open ${a}`, ctx);
  return fresh;
}

function open(key) {
  return { do: 'open', url: SITES[key][0], label: `Opening ${show(key)}` };
}
function search(key, q) {
  const query = q.replace(/\s+/g, ' ').trim();
  return { do: 'search', url: SITES[key][1].replace('{q}', encodeURIComponent(query)), query, label: `${show(key)}: “${query}”` };
}
