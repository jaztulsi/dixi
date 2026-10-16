// Pure text helpers for voice + typed commands. Ported from the Swift VoiceAgent; no DOM, so they
// run in unit tests under plain Node.

export const SITE_MAP = {
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

export const NAVIGATE_PATTERN = /(?:open|go to|navigate to|visit)\s+(.+)/i;

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
  const target = trimPunct(m[1].toLowerCase());
  if (SITE_MAP[target]) return SITE_MAP[target];
  return target.includes(' ') ? null : resolveURL(target);
}

// "um", "uh", and "like," / "you know," as filler (with the comma, so "songs like this" stays).
const FILLER = /\b(?:um+|uh+|erm)\b[,.]?|(?<=[\s,])like,|\byou know,/gi;
const CONJUNCTION = /[\s,;]+(?:and then|and|then|also|n)\b[\s,;]*/gi;
// "open youtube search lofi": no "and", but a known site ends the first command.
const SITE_KEYS = Object.keys(SITE_MAP).sort((a, b) => b.length - a.length).join('|');
const SITE_THEN_VERB = new RegExp(`\\b((?:open|go to|navigate to|visit)\\s+(?:${SITE_KEYS})(?:\\.com)?)[\\s,.]+(?=(?:search|look up|find|play|click|watch|add|scroll|skip|pause|type|go back)\\b)`, 'gi');

/** Clauses split on "and"/"then"/"also" (and Deepgram's "n,"), tolerating punctuation, minus fillers. */
export function splitOnConjunctions(text) {
  return text.replace(FILLER, ' ').replace(SITE_THEN_VERB, '$1\u001f').replace(CONJUNCTION, '\u001f').split('\u001f')
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

// Deepgram also hears "Runek"/"Runik"; the keywords boost makes "Runic" most likely.
export const WAKE_PATTERN = /\b(?:runic|runek|runik|runick|ronic|rune ic)\b[\s,.!?]*/i;

/** Text after the wake word, or null if there's no wake word (or nothing after it). */
export function afterWakeWord(text) {
  const m = text.match(WAKE_PATTERN);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  return rest.trim() ? rest : '';
}

const SEARCH_PATTERN = /^(?:(?:can|could|would) you |please )?(?:search(?: for)?|look up)\s+(.+?)(?:\s+on\s+([a-z ]+?))?[\s.?!]*$/i;

/** A query still containing another command means the clause split missed something. */
export const isPlainQuery = (q) => !/\b(?:play|click|open|go to|go back|add|scroll|select|watch|tap|buy)\b/i.test(q);

/** {query, platform} for "search for X [on Y]" when Y (or the current site) has a search URL. */
export function parseSearch(clause, currentURL) {
  const m = clause.match(SEARCH_PATTERN);
  if (!m) return null;
  const query = trimPunct(m[1]);
  const platform = m[2]?.toLowerCase() ?? platformFor(currentURL);
  if (!query || !isPlainQuery(query) || !platform || !hasSearchURL(platform)) return null;
  return { query, platform };
}

const SEARCH_SITES = new Set(['youtube', 'gmail', 'twitter', 'x', 'reddit', 'github', 'amazon', 'wikipedia', 'google maps', 'google', 'facebook marketplace', 'ebay']);
export const hasSearchURL = (platform) => SEARCH_SITES.has(platform.toLowerCase());

export function searchURL(platform, query) {
  const q = encodeURIComponent(query);
  switch (platform.toLowerCase()) {
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
