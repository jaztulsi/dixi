// Pure text helpers for voice + typed commands. Ported from the Swift VoiceAgent; no DOM, so they
// run in unit tests under plain Node.

export const SITE_MAP = {
  // Apple first: these are the examples Dixi shows.
  apple: 'https://www.apple.com', 'apple.com': 'https://www.apple.com', 'apple store': 'https://www.apple.com/store',
  'apple music': 'https://music.apple.com', 'apple tv': 'https://tv.apple.com', 'apple tv plus': 'https://tv.apple.com',
  'apple podcasts': 'https://podcasts.apple.com', podcasts: 'https://podcasts.apple.com',
  'apple support': 'https://support.apple.com', 'apple maps': 'https://maps.apple.com',
  'app store': 'https://apps.apple.com', icloud: 'https://www.icloud.com',
  // "buy AirPods Pro" goes straight to the product's buy page (each URL checked; old models redirect to current).
  // Dixi stops there: options, bag and payment stay with you.
  'airpods pro': 'https://www.apple.com/shop/buy-airpods/airpods-pro-3', 'airpods max': 'https://www.apple.com/shop/buy-airpods/airpods-max',
  airpods: 'https://www.apple.com/shop/buy-airpods/airpods-4', 'iphone air': 'https://www.apple.com/shop/buy-iphone/iphone-air',
  'iphone 17': 'https://www.apple.com/shop/buy-iphone/iphone-17', iphone: 'https://www.apple.com/shop/buy-iphone',
  'macbook air': 'https://www.apple.com/shop/buy-mac/macbook-air', 'macbook pro': 'https://www.apple.com/shop/buy-mac/macbook-pro',
  'ipad pro': 'https://www.apple.com/shop/buy-ipad/ipad-pro', 'ipad air': 'https://www.apple.com/shop/buy-ipad/ipad-air',
  ipad: 'https://www.apple.com/shop/buy-ipad/ipad', 'apple watch': 'https://www.apple.com/shop/buy-watch/apple-watch',
  'vision pro': 'https://www.apple.com/shop/buy-vision/apple-vision-pro', 'apple vision pro': 'https://www.apple.com/shop/buy-vision/apple-vision-pro',
  google: 'https://www.google.com', 'google maps': 'https://www.google.com/maps',
  youtube: 'https://www.youtube.com', gmail: 'https://mail.google.com', email: 'https://mail.google.com',
  mail: 'https://mail.google.com', calendar: 'https://calendar.google.com', drive: 'https://drive.google.com',
  docs: 'https://docs.google.com', sheets: 'https://sheets.google.com', slides: 'https://slides.google.com',
  spotify: 'https://open.spotify.com', twitter: 'https://x.com', x: 'https://x.com',
  reddit: 'https://www.reddit.com', github: 'https://github.com', amazon: 'https://www.amazon.com',
  wikipedia: 'https://www.wikipedia.org', netflix: 'https://www.netflix.com', linkedin: 'https://www.linkedin.com',
  facebook: 'https://www.facebook.com', 'facebook marketplace': 'https://www.facebook.com/marketplace',
  marketplace: 'https://www.facebook.com/marketplace', instagram: 'https://www.instagram.com',
  twitch: 'https://www.twitch.tv', slack: 'https://slack.com', notion: 'https://www.notion.so',
  chatgpt: 'https://chat.openai.com', craigslist: 'https://www.craigslist.org', ebay: 'https://www.ebay.com',
  tiktok: 'https://www.tiktok.com',
};

export const NAVIGATE_PATTERN = /(?:open|go to|navigate to|visit|buy|shop for)\s+(.+)/i;

const trimPunct = (s) => s.trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');

export function resolveURL(target) {
  const key = trimPunct(target.toLowerCase());
  if (SITE_MAP[key]) return SITE_MAP[key];
  if (/^https?:\/\//.test(key)) return key;
  if (/\.\w{2,}/.test(key)) return `https://${key}`;
  // Longest site key first, so "facebook marketplace" wins over "facebook".
  const prefix = Object.keys(SITE_MAP).sort((a, b) => b.length - a.length).find((k) => key.startsWith(k));
  return prefix ? SITE_MAP[prefix] : null;
}

/** "go to amazon" / "open youtube.com" → URL with no LLM call; null for anything more than a bare site. */
export function directNavigationURL(command) {
  const m = command.match(NAVIGATE_PATTERN);
  if (!m || m.index !== 0) return null;
  // "open the App Store", "buy a new iPad on apple.com"
  const target = trimPunct(m[1].toLowerCase()).replace(/^(?:(?:the|an?|some|new|my)\s+)+/, '').replace(/\s+(?:on|from|at)\s+(?:apple(?:\.com)?|the apple store)$/, '');
  if (SITE_MAP[target]) return SITE_MAP[target];
  return target.includes(' ') ? null : resolveURL(target);
}

// "um", "uh", and "like," / "you know," as filler (with the comma, so "songs like this" stays).
const FILLER = /\b(?:um+|uh+|erm)\b[,.]?|(?<=[\s,])like,|\byou know,/gi;
const CONJUNCTION = /[\s,;]+(?:and then|and|then|also|n)\b[\s,;]*/gi;
// "open youtube search lofi": no "and", but a known site ends the first command.
const SITE_KEYS = Object.keys(SITE_MAP).sort((a, b) => b.length - a.length).join('|');
const SITE_THEN_VERB = new RegExp(`\\b((?:open|go to|navigate to|visit)\\s+(?:${SITE_KEYS})(?:\\.com)?)[\\s,.]+(?=(?:search|look up|find|play|click|watch|add|scroll|skip|pause|type|go back)\\b)`, 'gi');
// Flux punctuates as you talk ("open YouTube, search lofi beats. Play the first video"): a comma or
// period followed by a command word starts a new command.
const COMMAND_WORD = '(?:open|go to|go back|navigate to|visit|search|look up|find|play|pause|stop|resume|unpause|click|tap|select|watch|scroll|skip|mute|unmute|add|close|zoom|turn|next|rewind|restart|reload|refresh|show|type|buy|cancel)';
const PUNCT_THEN_COMMAND = new RegExp(`\\s*[,;.!?]\\s+(?=${COMMAND_WORD}\\b)`, 'gi');
// With no punctuation at all, only phrases that can't be part of a search query start a new command
// ("search lofi beats play the first video"; but "search how to play guitar" stays one search).
const ORD_WORD = '(?:first|second|third|fourth|fifth|last|next|top|1st|2nd|3rd)';
const BARE_COMMAND = new RegExp(`\\s+(?=(?:play (?:the )?${ORD_WORD}|play (?:the )?video|play it|pause (?:it|the video)|scroll (?:down|up)|go back|skip the ad|click (?:on )?the ${ORD_WORD}|add (?:it|this|that) to|turn it (?:up|down)|next video|zoom (?:in|out))\\b)`, 'gi');

/** Clauses split on "and"/"then"/"also" (and Deepgram's "n,"), punctuation before a command, minus fillers. */
export function splitOnConjunctions(text) {
  return text.replace(FILLER, ' ').replace(SITE_THEN_VERB, '$1\u001f').replace(PUNCT_THEN_COMMAND, '\u001f')
    .replace(BARE_COMMAND, '\u001f').replace(CONJUNCTION, '\u001f').split('\u001f')
    .map((s) => s.trim().replace(/^,+|,+$/g, '').trim())
    .filter(Boolean);
}

export const clauseKey = (clause) => trimPunct(clause.toLowerCase());

/** "who made this video?" → answer from the page. "can you open YouTube" is a polite command. */
export function isQuestion(text) {
  const t = trimPunct(text.toLowerCase());
  if (/^(can|could|would|will) you (please )?(open|go|search|play|click|add|scroll|skip|pause|type|navigate|show|find|buy|watch)\b/.test(t)) return false;
  return /^(who|whose|what|what's|whats|when|where|why|how|which|is|are|was|were|does|do|did|can|could|will|would|should|tell me|explain)\b/.test(t);
}

/** true = yes, false = no, null = neither (treat as a new command). */
export function yesOrNo(text) {
  const t = trimPunct(text.toLowerCase());
  if (/^(yes|yeah|yep|yup|sure|correct|right|exactly|do it|go ahead|confirm|ok|okay|please do|that's right)\b/.test(t)) return true;
  if (/^(no|nope|nah|cancel|stop|never ?mind|don'?t|wrong)\b/.test(t)) return false;
  return null;
}

// Deepgram spells the wake word "Dixie" more often than "Dixi" (even with the keyterm boost), and sometimes
// "Dixy"/"Dixey"/"Dicksy": accept them all.
export const WAKE_PATTERN = /\b(?:dixi|dixie|dixy|dixey|dixee|dicksy|dicksie)\b[\s,.!?]*/i;

/** Text after the wake word, or null if there's no wake word (or nothing after it). */
export function afterWakeWord(text) {
  const m = text.match(WAKE_PATTERN);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  return rest.trim() ? rest : '';
}

const SEARCH_PATTERN = /^(?:(?:can|could|would) you |please )?(?:search(?: for)?|look up)\s+(.+?)(?:\s+on\s+([a-z .]+?))?[\s.?!]*$/i;  // "on apple.com" too

/** A query still containing another command means the clause split missed something. */
export const isPlainQuery = (q) => !/\b(?:play|click|open|go to|go back|add|scroll|select|watch|tap|buy)\b/i.test(q);

/** {query, platform} for "search for X [on Y]" when Y (or the current site) has a search URL. */
export function parseSearch(clause, currentURL) {
  const m = clause.match(SEARCH_PATTERN);
  if (!m) return null;
  const query = trimPunct(m[1]);
  const platform = m[2]?.toLowerCase().replace(/^the /, '') ?? platformFor(currentURL);  // "on the App Store"
  if (!query || !isPlainQuery(query) || !platform || !hasSearchURL(platform)) return null;
  return { query, platform };
}

const SEARCH_SITES = new Set(['apple', 'apple.com', 'apple store', 'apple music', 'apple tv', 'apple tv plus', 'apple podcasts', 'podcasts', 'apple support', 'apple maps', 'app store', 'youtube', 'gmail', 'twitter', 'x', 'reddit', 'github', 'amazon', 'wikipedia', 'google maps', 'google', 'facebook marketplace', 'ebay']);
export const hasSearchURL = (platform) => SEARCH_SITES.has(platform.toLowerCase());

export function searchURL(platform, query) {
  const q = encodeURIComponent(query);
  switch (platform.toLowerCase()) {
    case 'apple': case 'apple.com': case 'apple store': return `https://www.apple.com/us/search/${q}?src=globalnav`;
    case 'apple music': return `https://music.apple.com/us/search?term=${q}`;
    case 'apple tv': case 'apple tv plus': return `https://tv.apple.com/us/search?term=${q}`;
    case 'apple podcasts': case 'podcasts': return `https://podcasts.apple.com/us/search?term=${q}`;
    case 'apple support': return `https://www.apple.com/us/search/${q}?src=globalnav&tab=support`;
    case 'apple maps': return `https://maps.apple.com/search?query=${q}`;
    case 'app store': return `https://apps.apple.com/us/iphone/search?term=${q.toLowerCase()}`;  // capitalised terms error on Apple's side
    case 'youtube': return `https://www.youtube.com/results?search_query=${q}`;
    case 'gmail': return `https://mail.google.com/mail/u/0/#search/${q}`;
    case 'twitter': case 'x': return `https://x.com/search?q=${q}`;
    case 'reddit': return `https://www.reddit.com/search/?q=${q}`;
    case 'github': return `https://github.com/search?q=${q}`;
    case 'amazon': return `https://www.amazon.com/s?k=${q}`;
    case 'wikipedia': return `https://en.wikipedia.org/wiki/Special:Search?search=${q}`;
    case 'google maps': return `https://www.google.com/maps/search/${q}`;
    case 'facebook marketplace': return `https://www.facebook.com/marketplace/search/?query=${q}`;
    case 'ebay': return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
    default: return `https://www.google.com/search?q=${q}`;
  }
}

/** Known search platform for a URL, matched on the host ("netflix.com" is not "x.com"). */
export function platformFor(url) {
  let u;
  try { u = new URL(url.includes('://') ? url : `https://${url}`); } catch { return null; }
  const host = u.hostname.toLowerCase(), p = u.pathname.toLowerCase();
  const on = (d) => host === d || host.endsWith('.' + d);
  if (on('google.com') && p.startsWith('/maps')) return 'google maps';
  if (on('facebook.com') && p.startsWith('/marketplace')) return 'facebook marketplace';
  if (on('mail.google.com')) return 'gmail';
  // Apple subdomains before apple.com itself.
  const apple = [['music.apple.com', 'apple music'], ['tv.apple.com', 'apple tv'], ['podcasts.apple.com', 'apple podcasts'],
    ['support.apple.com', 'apple support'], ['maps.apple.com', 'apple maps'], ['apps.apple.com', 'app store'], ['apple.com', 'apple']];
  const a = apple.find(([d]) => on(d));
  if (a) return a[1];
  const sites = [['youtube.com', 'youtube'], ['amazon.com', 'amazon'], ['reddit.com', 'reddit'], ['github.com', 'github'],
    ['x.com', 'x'], ['twitter.com', 'x'], ['wikipedia.org', 'wikipedia'], ['ebay.com', 'ebay'], ['google.com', 'google']];
  return sites.find(([d]) => on(d))?.[1] ?? null;
}

export function stepFingerprint(step) {
  if (step.action === 'open' || step.action === 'navigate') return `navigate:${resolveURL(step.target) ?? step.target}`;
  if (step.action === 'go_back') return 'go_back';
  return `${step.action}:${(step.detail || step.target || '').toLowerCase()}`;
}

export function friendlyStatus(step) {
  const what = step.detail || step.target;
  switch (step.action) {
    case 'open': { let host = step.target; try { host = new URL(step.target).hostname; } catch {} return `Opening ${step.detail || host}`; }
    case 'search': return `Searching for “${step.detail}”`;
    case 'click': return `Clicking ${step.target || what}`;
    case 'type': return `Typing “${step.detail}”`;
    case 'scroll': return `Scrolling ${step.detail}`;
    case 'go_back': return 'Going back';
    default: return `${step.action[0]?.toUpperCase()}${step.action.slice(1)} ${what}`;
  }
}

/** Plain-language task for the browser agent (not "click current page in first video"). */
export function agentTask(step, said) {
  const junk = new Set(['', 'page', 'current page', 'current site', 'browser']);
  const target = junk.has((step.target || '').toLowerCase()) ? '' : step.target;
  const detail = junk.has((step.detail || '').toLowerCase()) ? '' : step.detail;
  let what;
  if (step.action === 'type') what = `Type "${detail}" into ${target || 'the right field'}`;
  else if (step.action === 'click') what = `Click ${[target, detail].filter(Boolean).join(', ')}`;
  else what = [step.action[0].toUpperCase() + step.action.slice(1), target, detail].filter(Boolean).join(' ');
  return said ? `${what}. (The user said: "${said}")` : what;
}

export function looksLikeURL(text) {
  if (/^https?:\/\//.test(text)) return true;
  const parts = text.split('.');
  return !text.includes(' ') && parts.length >= 2 && parts.at(-1).length >= 2;
}
