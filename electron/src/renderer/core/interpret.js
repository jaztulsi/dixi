// Understanding a spoken command: what to do, where (the name exactly as said), with what.
//   fastPath()  generic in-page/app controls and "open <learned name>" in code, no AI call
//   interpret() one strict-JSON-schema AI call, checked by validate(), retried on the strong tier
// No site, brand or product knowledge lives here: names are copied from the words and resolved later
// by evidence (resolve.js). Words like "up" in "open up" are grammar, never part of a name or query.

export const ACTS = ['open', 'search', 'find_item', 'order', 'add_to_cart', 'cart', 'quantity', 'checkout', 'nth', 'media', 'scroll', 'nav', 'tab', 'zoom', 'click', 'ask_page', 'ask_web', 'stop', 'none'];
export const VALUES = {
  media: ['play', 'pause', 'mute', 'unmute', 'louder', 'quieter', 'faster', 'slower', 'forward', 'rewind', 'restart', 'next', 'captions', 'skip_ad', 'fullscreen'],
  quantity: ['up', 'down', 'set'], scroll: ['up', 'down', 'top', 'bottom'], nav: ['back', 'forward', 'reload'], tab: ['new', 'close', 'next', 'previous'], zoom: ['in', 'out', 'reset'],
};

export const INTENT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['steps', 'clarify'],
  properties: {
    clarify: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['act', 'said', 'guess', 'urls', 'query', 'item', 'qty', 'n', 'value'],
        properties: {
          act: { type: 'string', enum: ACTS }, said: { type: 'string' }, guess: { type: 'string' },
          urls: { type: 'array', items: { type: 'string' } }, query: { type: 'string' }, item: { type: 'string' },
          qty: { type: 'integer' }, n: { type: 'integer' }, value: { type: 'string' },
        },
      },
    },
  },
};

// Static prefix first (provider prompt caches key on it); everything per-command goes in the user message.
export const INTERPRET_PROMPT = `You turn one spoken command for a web browser into JSON steps. The words come from speech recognition: expect filler, false starts and misheard names.

Acts:
open: go to a website, web app or online product. A named part of it ("the <site> menu", "<site> deals", "my <site> orders") is open, then click with value = that part's words.
search: search a site for "query".
find_item: only look at / find a product ("item") on a store, no buying words.
order: they want to buy / order / get / grab / "I want" / "can I get" something ("item", qty if said): add it to the cart. "said" = the store, or "" if no store is named (still an order).
add_to_cart: add what is on the current page to the cart.
cart: go to / show the shopping cart or bag.
quantity: change how many of an item. value up (one more), down (one fewer) or set (with qty).
checkout: buy / purchase / check out / go to checkout for what is on the current page (value ""). value "place_order" ONLY when they explicitly ask to place, submit or confirm the order, or to pay.
nth: open, play or click result number n (1 first, 2 second, -1 last); value "play" when they want it played/watched/listened to.
media: control what is playing. value: play, pause, mute, unmute, louder, quieter, faster, slower, forward, rewind, restart, next, captions, skip_ad, fullscreen.
scroll: value up, down, top, bottom. nav: value back, forward, reload. tab: value new, close, next, previous. zoom: value in, out, reset.
click: click the thing named in "value" on the current page.
ask_page: a question about the page on screen. ask_web: a question about the world.
stop: stop or cancel. none: not a browser request (small talk, talking to someone else, things a browser can't do).

Rules:
- "said": the site, app, store or product name EXACTLY as spoken, copied word for word. Leave out verbs, particles like "up", articles, possessives, "website"/"site"/"app" and politeness. "" when they mean the current page or name nothing.
- Keep multi-word names whole. Never shorten a name to a word inside it, never swap it for a more famous name.
- "guess": only if "said" looks misheard by speech recognition: a respelling of the SAME sounds (different spacing or letters), never a different or more famous name. Usually "".
- "urls": up to 3 likely official home page URLs for "said" from your knowledge, [] if unsure.
- "query" / "item": only the words for the thing itself, copied from the command. Never verbs, particles, filler, quantities, "on <site>" or the site's name.
- Corrections ("no wait", "actually", "I mean") and negations ("don't open X, open Y"): only the final intent.
- Several requests: one step each, in the order spoken. Add nothing they did not ask for.
- Unfamiliar names are normal (new or small sites): copy them into "said" and let the app look them up. Never ask about a name just because you don't know it.
- Put the site in the same step as what to do there (search / find_item / order on it): no separate "open" step for that site.
- "clarify": a short question only when the words are too garbled to act on at all; else "".
- Unused fields: "", 0 or [].`;

// ---- words ----
/** Lowercase word tokens; "Chick-fil-A" → chick fil a; possessive 's dropped. */
export const tokens = (s) => String(s ?? '').toLowerCase().replace(/[’']s\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
export const normName = (s) => tokens(s).join(' ');

// Closed-class English words: grammar, not content. Never the start or end of a query or name.
const FUNCTION = new Set(['a', 'an', 'the', 'some', 'any', 'my', 'me', 'up', 'on', 'to', 'for', 'of', 'in', 'at', 'from', 'with', 'and', 'then', 'so', 'please',
  'can', 'could', 'would', 'will', 'you', 'go', 'open', 'pull', 'bring', 'search', 'find', 'look', 'show', 'get', 'take', 'launch', 'visit', 'navigate', 'load',
  'fire', 'head', 'over', 'jump', 'hop', 'um', 'uh', 'like', 'okay', 'ok', 'hey', 'just', 'now', 'really', 'quick', 'real', 'website', 'site', 'app', 'page', 'thanks']);
// A question opener (grammar, not content): answered once the sentence is whole, never from half of it.
export const QUESTION = /^(?:(?:hey|ok|okay|so|um|uh|and|now|dixi)[\s,]+)*(?:(?:can|could|would|will) you (?:please )?(?:tell|explain|describe|compare|summari[sz]e|let me know)|tell me|describe|explain|compare|summari[sz]e|what|what's|whats|how|why|when|where|who|whose|which|is|are|does|do|did|was|were|should|i (?:want|wanna|need) to know)\b/i;
// ...unless it asks Dixi to do something on the way ("what's on Amazon, open it").
const DOING = /\b(open|go to|search|buy|order|add|play|pause|click|scroll|navigate|take me|pull up|bring up|checkout|check out)\b/i;
/** Words so far that can't be a whole command yet ("can you", "…the features of", "uh"). */
export function incomplete(text) {
  const t = tokens(text);
  if (fastPath(text) && !QUESTION.test(String(text).trim())) return false;
  return t.length < 2 || FUNCTION.has(t.at(-1)) || DANGLING.has(t.at(-1));
}
const DANGLING = new Set(['or', 'but', 'is', 'are', 'was', 'were', 'be', 'your', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'about', 'between', 'than', 'as', 'if', 'this', 'that', 'these', 'those', 'er', 'hmm', 'mm', 'tell', 'give', 'buy', 'order', 'add', 'play', 'want', 'need', 'i', 'we']);
// Verbs and particles of the command itself; a query or item never starts with one.
const LEAD_PARTICLE = new Set(['up', 'on', 'to', 'for', 'open', 'go', 'search', 'find', 'look', 'pull', 'bring', 'take', 'launch', 'visit', 'navigate', 'load']);
const OPENING = /\b(open|go to|pull up|bring up|launch|visit|take me to|load up|navigate to|head to|fire up)\b/i;
const LOOKING = /\b(search|find|look|show me|buy|order|get me|purchase|want|play|watch|listen)\b/i;
const trimFunction = (words) => {
  let a = 0, z = words.length;
  while (a < z && FUNCTION.has(words[a])) a++;
  while (z > a && FUNCTION.has(words[z - 1]) && !/^\d/.test(words[z - 1])) z--;
  return words.slice(a, z);
};
/** "up classroom" → "classroom"; keeps the original spelling of the words that stay. */
export function cleanSpan(s, { keepEnd = false } = {}) {
  const orig = String(s ?? '').trim().split(/\s+/).filter(Boolean);
  const low = orig.map((w) => tokens(w).join(' '));
  let a = 0, z = orig.length;
  while (a < z && (!low[a] || FUNCTION.has(low[a]))) a++;
  while (!keepEnd && z > a && (!low[z - 1] || FUNCTION.has(low[z - 1]))) z--;
  return orig.slice(a, z).join(' ').replace(/^[\s,.;!?]+|[\s,.;!?]+$/g, '');
}

/**
 * Where `span`'s words occur in `words`: an exact run first (spaced/joined forms count, "class room" ↔
 * "classroom"), else in order with ≤2 extra words between. `avoid` = a [from, to] range to stay out of
 * (the same word can be in the item and in the name: "a burger from Burger King").
 */
export function findSpan(words, span, avoid = null) {
  const want = tokens(span);
  if (!want.length) return null;
  const joined = want.join('');
  const clear = (a, b) => !avoid || b < avoid[0] || a > avoid[1];
  for (let i = 0; i < words.length; i++) {
    for (let j = i; j < Math.min(words.length, i + want.length + 3); j++) {
      if (words.slice(i, j + 1).join('') === joined && clear(i, j)) return [i, j];
    }
  }
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== want[0]) continue;
    let k = 1, j = i + 1, gaps = 0;
    for (; j < words.length && k < want.length && gaps <= 2; j++) {
      if (words[j] === want[k]) k++; else gaps++;
    }
    if (k === want.length && clear(i, j - 1)) return [i, j - 1];
  }
  return null;
}

const squashed = (s) => tokens(s).join('');
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Same name, spelled or spaced differently ("Brindle mart" / "Brindlemart", "Faza" / "Fazza"). */
export const closeSpelling = (a, b) => { const x = squashed(a), y = squashed(b); return editDistance(x, y) <= Math.max(1, Math.round(Math.max(x.length, y.length) * 0.25)); };

// ---- fast path: no AI ----
const OPEN_VERBS = ['open up', 'open', 'go to', 'pull up', 'bring up', 'take me to', 'launch', 'visit', 'navigate to', 'load up', 'fire up', 'head to', 'switch to'];
const LEAD = /^(?:(?:um+|uh+|so|okay|ok|hey|please|can you|could you|would you|go ahead and|i want to|let'?s)[\s,]+)*/i;
const TAIL = /(?:[\s,]+(?:please|for me|now|real quick|thanks|thank you))*[\s,.!?]*$/i;
const ORDINAL = { first: 1, '1st': 1, top: 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, last: -1 };
const CONTROLS = [
  [/^pause( (the )?(video|it|music|song|playback|this))?$|^stop (the )?(video|music|song|playback)$/, 'media', 'pause'],
  [/^(play|resume|unpause|continue)( (the )?(video|it|music|song|playback))?$/, 'media', 'play'],
  [/^(unmute|sound on)( (the )?(video|it))?$/, 'media', 'unmute'],
  [/^(mute|sound off)( (the )?(video|it|this))?$/, 'media', 'mute'],
  [/^(volume up|louder|turn it up|make it louder)$/, 'media', 'louder'],
  [/^(volume down|quieter|turn it down|make it quieter)$/, 'media', 'quieter'],
  [/^(faster|speed (it )?up|make it faster)$/, 'media', 'faster'],
  [/^(slower|slow (it )?down|make it slower)$/, 'media', 'slower'],
  [/^(rewind( (it|the video))?|go back (ten|10) seconds|back (ten|10) seconds)$/, 'media', 'rewind'],
  [/^(skip ahead|fast forward|forward (ten|10) seconds)$/, 'media', 'forward'],
  [/^(restart|start (it )?over)( (the )?video)?$/, 'media', 'restart'],
  [/^(next video|next song|skip (this )?(video|song))$/, 'media', 'next'],
  [/^(skip|skip the ads?|skip this ad|skip ads)$/, 'media', 'skip_ad'],
  [/^((turn )?(on|off) )?(captions|subtitles)( (on|off))?$/, 'media', 'captions'],
  [/^(full ?screen|make it full ?screen)$/, 'media', 'fullscreen'],
  [/^scroll( it| the page)? down( a bit)?$|^(page )?down$/, 'scroll', 'down'],
  [/^scroll( it| the page)? up( a bit)?$|^(page )?up$/, 'scroll', 'up'],
  [/^(scroll |go )?(back )?(up )?to the top( of the page)?$|^top$/, 'scroll', 'top'],
  [/^(scroll |go )?to the bottom( of the page)?$|^bottom$/, 'scroll', 'bottom'],
  [/^go back$|^back$|^previous page$/, 'nav', 'back'],
  [/^go forward$|^forward$/, 'nav', 'forward'],
  [/^(reload|refresh)( (the |this )?page)?$/, 'nav', 'reload'],
  [/^(open )?(a )?new tab$/, 'tab', 'new'],
  [/^close (this |the )?tab$/, 'tab', 'close'],
  [/^(next|switch) tab$|^go to the next tab$/, 'tab', 'next'],
  [/^previous tab$|^go to the previous tab$/, 'tab', 'previous'],
  [/^zoom in$/, 'zoom', 'in'], [/^zoom out$/, 'zoom', 'out'], [/^(reset zoom|normal zoom)$/, 'zoom', 'reset'],
  [/^(stop|cancel|never ?mind|stop everything|cancel that|stop that)$/, 'stop', ''],
  [/^((go to|open|show( me)?|view|check) )?(my |the )?(shopping )?(cart|bag|basket)$/, 'cart', ''],
  [/^((go|proceed|continue) (to|with) )?(the )?(purchase|checkout|check out)$|^(check out|checkout|buy it|purchase it|buy this|purchase this)$/, 'checkout', ''],
  [/^(increase|raise|bump up) the (quantity|amount|number)$|^(add )?one more( of (these|this|them|it))?$/, 'quantity', 'up'],
  [/^(decrease|lower|reduce) the (quantity|amount|number)$|^one (less|fewer)$/, 'quantity', 'down'],
];
const NTH = /^(?:(play|open|click(?: on)?|watch|listen to|select|tap|go to|choose)\s+)?(?:the\s+)?(first|1st|top|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\s*(?:one|video|result|link|item|song|product|option)?$/;

const step = (act, extra = {}) => ({ act, said: '', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '', ...extra });

/**
 * @param text the command (wake word already removed)
 * @param ctx {names: learned site names (normalized) → true}
 * @returns intent or null
 */
export function fastPath(text, ctx = {}) {
  const t = String(text).toLowerCase().replace(LEAD, '').replace(TAIL, '').replace(/[“”"]/g, '').trim();
  if (!t) return null;
  for (const [re, act, value] of CONTROLS) if (re.test(t)) return { steps: [step(act, { value })], clarify: '' };
  // A plain question (no command in it) needs no parse: it goes straight to the answerer.
  if (QUESTION.test(t) && !DOING.test(t)) return { steps: [step('ask_page', { value: String(text).trim() })], clarify: '' };
  const nth = t.match(NTH);
  if (nth) return { steps: [step('nth', { n: ORDINAL[nth[2]], value: /^(play|watch|listen to)$/.test(nth[1] ?? '') ? 'play' : '' })], clarify: '' };
  // "open up <exact learned name>": the whole rest must be the name, else the AI decides.
  for (const verb of OPEN_VERBS) {
    if (!t.startsWith(`${verb} `)) continue;
    const rest = t.slice(verb.length + 1).replace(/^(the )/, '').replace(/ (website|site|app|homepage)$/, '');
    if (ctx.names?.has(normName(rest))) return { steps: [step('open', { said: rest })], clarify: '' };
    break;
  }
  return null;
}

// ---- AI parse ----
/** Context block for the user message: only what helps resolve this command. */
export function contextBlock(ctx = {}) {
  const lines = [];
  if (ctx.url) lines.push(`Page: ${ctx.url}${ctx.title ? ` "${String(ctx.title).slice(0, 80)}"` : ''}`);
  else lines.push('Page: none open');
  if (ctx.tabs) lines.push(`Tabs: ${ctx.tabs}`);
  if (ctx.recent?.length) lines.push(`Recent: ${ctx.recent.slice(-3).join(' | ')}`);
  if (ctx.candidates?.length) lines.push(`Names the user has used before that sound close: ${ctx.candidates.join(', ')}`);
  if (ctx.affordances) lines.push(`On this page: ${ctx.affordances}`);
  if (ctx.unsure?.length) lines.push(`Speech recognition was unsure of: ${ctx.unsure.join(', ')}`);
  return lines.join('\n');
}

/**
 * Checks an AI parse against the words actually said, and cleans spans. Returns {intent, errors}.
 * The model may only copy names and queries from the transcript, so it can't snap to another name.
 */
export function validate(raw, text) {
  const errors = [];
  if (!raw || !Array.isArray(raw.steps)) return { intent: null, errors: ['not an intent'] };
  const words = tokens(text);
  const steps = [];
  for (const s0 of raw.steps) {
    const s = { ...step(s0.act), ...s0 };
    if (!ACTS.includes(s.act)) { errors.push(`unknown act ${s.act}`); continue; }
    // Grammar words leading a query ("up classroom", "on Zentora") mean the model mixed the command
    // into the content: reject (retry/escalate) rather than quietly trim to something still wrong.
    for (const k of ['query', 'item']) if (LEAD_PARTICLE.has(tokens(s[k])[0])) errors.push(`${k} "${s[k]}" starts with "${tokens(s[k])[0]}"`);
    s.said = cleanSpan(s.said);
    s.query = cleanSpan(s.query);
    s.item = cleanSpan(s.item);
    s.urls = (s.urls ?? []).filter((u) => /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u)).slice(0, 3);
    // A guess may only respell what was said (same sounds), never swap in another, better-known name.
    if (s.guess && s.said && !closeSpelling(s.said, s.guess)) s.guess = '';
    let saidAt = s.said ? findSpan(words, s.said) : null;
    // A site the user never said (the model borrowed it from the page or its own guess) is dropped;
    // only "open" can't do without one.
    if (s.said && !saidAt && s.act !== 'open') { s.said = ''; s.guess = ''; s.urls = []; saidAt = null; }
    if (s.said && !saidAt) errors.push(`"${s.said}" was not said`);
    for (const k of ['query', 'item']) {
      if (!s[k]) continue;
      const at = findSpan(words, s[k], saidAt) ?? findSpan(words, s[k]);
      if (!at) { errors.push(`${k} "${s[k]}" was not said`); continue; }
      // A query that swallowed the site's own name or its verb is the "up classroom" bug.
      if (saidAt && at[0] <= saidAt[1] && saidAt[0] <= at[1]) errors.push(`${k} "${s[k]}" overlaps the name "${s.said}"`);
      // Right next to the name with nothing between ("Zentora | classroom"): they are one name.
      else if (saidAt && (at[0] === saidAt[1] + 1 || at[1] === saidAt[0] - 1) && OPENING.test(text) && !LOOKING.test(text)) errors.push(`${k} "${s[k]}" runs into the name "${s.said}"`);
    }
    // An act squeezed into "value" ("open the first one and add it" → nth + add_to_cart): make it its own step.
    if (ACTS.includes(s.value) && !VALUES[s.act] && s.value !== s.act) { steps.push(s); steps.push({ ...step(s.value), said: '' }); s.value = ''; continue; }
    if (s.act === 'nth' && s.value && s.value !== 'play') s.value = '';
    if (VALUES[s.act] && !VALUES[s.act].includes(s.value)) errors.push(`${s.act} needs a value`);
    if (s.act === 'open' && !s.said && !s.guess) errors.push('open needs a name');
    if (s.act === 'search' && !s.query) errors.push('search needs a query');
    if ((s.act === 'order' || s.act === 'find_item') && !s.item) errors.push(`${s.act} needs an item`);
    if (s.act === 'nth' && !s.n) errors.push('nth needs n');
    // What to click comes from the words, not from a button the model saw on the page.
    if (s.act === 'click' && s.value && !findSpan(words, s.value)) errors.push(`click "${s.value}" was not said`);
    // "the Burger King menu": a part of the site squeezed into the open step becomes open, then click it.
    const part = s.act === 'open' && (s.query || s.item || s.value);
    if (part) { steps.push({ ...s, query: '', item: '', value: '' }); steps.push({ ...step('click'), value: part }); continue; }
    steps.push(s);
  }
  return { intent: { steps, clarify: String(raw.clarify ?? '').trim() }, errors };
}

/**
 * @param text command words (no wake word)
 * @param ctx see contextBlock + {names}
 * @param deps {llm, tiers, signal, cache}
 * @returns {intent, source: fast|cache|llm|strong, errors, ms}
 */
export async function interpret(text, ctx = {}, { llm, tiers, signal = null, cache = null } = {}) {
  const t0 = performance.now();
  const done = (intent, source, errors = []) => ({ intent, source, errors, ms: Math.round(performance.now() - t0) });
  const fast = fastPath(text, ctx);
  if (fast) return done(fast, 'fast');
  const key = cache && `${ctx.host ?? ''}|${normName(text)}`;
  const hit = key && cache.get(key);
  if (hit) return done(hit, 'cache');
  const user = `${contextBlock(ctx)}\nSaid: "${text}"`;
  let last = { intent: null, errors: ['no answer'] };
  for (const [tier, models] of [['llm', tiers.fast], ['strong', tiers.strong]]) {
    if (!models?.length || signal?.aborted) continue;
    const content = await llm.json(INTERPRET_PROMPT, user, models, 400, { schema: INTENT_SCHEMA, signal, hedgeMs: tier === 'llm' ? 450 : 0 });
    let raw = null;
    try { raw = JSON.parse(content); } catch {}
    const v = validate(raw, text);
    // A question the model filed as "not a browser request": answer it (from the page if one is open).
    if (v.intent && v.intent.steps.length && v.intent.steps.every((x) => x.act === 'none') && /\?\s*$|^(what|who|whose|how|when|where|why|which|is|are|does|do|did|can|tell me)\b/i.test(text.trim())) {
      v.intent.steps = [step(ctx.url ? 'ask_page' : 'ask_web')];
    }
    // A question instead of steps on the fast tier: let the stronger tier try to act first.
    if (v.intent && !v.intent.steps.length && v.intent.clarify && tier === 'llm' && tiers.strong?.length) { last = v; continue; }
    if (v.intent && !v.errors.length) return done(v.intent, tier);
    if (v.intent) last = v;
  }
  // Still not clean: keep only the steps that passed (never act on words that weren't said).
  if (last.intent) {
    const bad = new Set(last.errors);
    const ok = last.intent.steps.filter((s) => !(s.said && [...bad].some((e) => e.includes(`"${s.said}"`))));
    return done({ ...last.intent, steps: ok }, 'partial', last.errors);
  }
  return done(null, 'failed', last.errors);
}
