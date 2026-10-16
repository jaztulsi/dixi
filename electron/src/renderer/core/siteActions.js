// Common commands done directly in the page: instant, no AI call, no tokens, no flaky multi-step
// agent loop. "play the first video", "skip the ad", "add it to my cart", "pause", "scroll down"...
// Anything not covered here still goes to the AI agent. Ported from SiteActions.swift.

const ORDINALS = [['first', 0], ['1st', 0], ['top', 0], ['second', 1], ['2nd', 1], ['third', 2], ['3rd', 2],
  ['fourth', 3], ['4th', 3], ['fifth', 4], ['5th', 4], ['last', -1]];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** {index (0-based, -1 = last), label} or null. */
export function ordinal(text) {
  for (const [word, i] of ORDINALS) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return { index: i, label: i < 0 ? '(last)' : String(i + 1) };
  }
  const m = text.match(/\b(?:video|result|number|item)\s+(?:number\s+)?(\d|one|two|three|four|five)\b/);
  if (m) {
    const n = Number(m[1]) || NUMBER_WORDS[m[1]];
    if (n > 0) return { index: n - 1, label: String(n) };
  }
  return null;
}

// Visible result links in page order; ads are excluded by the selectors.
const YOUTUBE_VIDEOS = `[...document.querySelectorAll('ytd-video-renderer a#video-title, ytd-rich-item-renderer a#video-title-link, ytd-compact-video-renderer a#thumbnail')]
  .filter(a => a.href && a.href.includes('/watch') && a.offsetParent !== null)`;
const AMAZON_RESULTS = `[...document.querySelectorAll('div[data-component-type="s-search-result"]')]
  .map(r => r.querySelector('h2 a, a.a-link-normal.s-link-style, a:has(h2)')).filter(a => a && a.href)`;
const GOOGLE_RESULTS = `[...document.querySelectorAll('#search a:has(h3)')].filter(a => a.href && a.offsetParent !== null)`;

/** Navigates to the nth link (more reliable than a synthetic click on single-page apps like YouTube). */
const openNth = (listJS, index) => `(() => { const list = ${listJS};
  if (list.length === 0) return 'wait';
  const a = ${index} < 0 ? list[list.length - 1] : list[${index}];
  if (!a) return 'ok: only ' + list.length + ' results here';
  location.href = a.href; return 'ok: ' + (a.textContent || '').trim().slice(0, 80); })()`;

const SKIP_AD = `(() => { const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button[id^="skip-button"]');
  if (b && b.offsetParent !== null) { b.click(); return 'ok: ad skipped'; }
  return document.querySelector('.ad-showing') ? 'wait' : 'ok: no ad playing'; })()`;

const amazonAddToCart = (index) => `(() => { const page = document.querySelector('#add-to-cart-button');
  if (page && ${index == null}) { page.click(); return 'ok: added to cart'; }
  const results = [...document.querySelectorAll('div[data-component-type="s-search-result"]')]
    .map(r => r.querySelector('button[name="submit.addToCart"], [aria-label^="Add to cart"], [aria-label^="Add to Cart"]'))
    .filter(Boolean);
  if (page) { page.click(); return 'ok: added to cart'; }
  if (results.length === 0) return 'wait';
  const i = ${index ?? 0}; const b = i < 0 ? results[results.length - 1] : results[i];
  if (!b) return 'ok: only ' + results.length + ' results with an Add to cart button';
  b.click(); return 'ok: added result ' + (i < 0 ? 'last' : i + 1) + ' to cart'; })()`;

const MEDIA = [
  [/^(pause|stop)( (the )?(video|it|music))?$/, 'Paused', 'v.pause()'],
  [/^(play|resume|unpause)( (the )?(video|it|music))?$/, 'Playing', 'v.play()'],
  [/^(unmute|sound on)( (the )?(video|it))?$/, 'Unmuted', 'v.muted = false'],
  [/^(mute|sound off)( (the )?(video|it))?$/, 'Muted', 'v.muted = true'],
];
const PAGE = [
  [/^scroll( (it|the page))? down$|^(page )?down$/, 'Scrolling down', "window.scrollBy({top: innerHeight * 0.8, behavior: 'smooth'})"],
  [/^scroll( (it|the page))? up$|^(page )?up$/, 'Scrolling up', "window.scrollBy({top: -innerHeight * 0.8, behavior: 'smooth'})"],
  [/^(scroll to the )?top$|^go to the top$/, 'Top of page', "window.scrollTo({top: 0, behavior: 'smooth'})"],
  [/^go back$|^back$/, 'Going back', 'history.back()'],
  [/^go forward$|^forward$/, 'Going forward', 'history.forward()'],
  [/^(reload|refresh)( (the )?page)?$/, 'Reloading', 'location.reload()'],
];

/** {label, js, patience (s)} or null. js returns "ok: <message>" or "wait" (page not ready yet). */
export function matchSiteAction(command, url) {
  const c = command.toLowerCase().trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const onYouTube = host.endsWith('youtube.com'), onAmazon = host.includes('amazon.');
  const onGoogle = host.endsWith('google.com') && url.includes('/search');

  if (/\bskip\b.*\bads?\b/.test(c)) return { label: 'Skipping ad', js: SKIP_AD, patience: 8 };

  const n = ordinal(c);
  if (n && /\b(play|open|watch|click|tap|go to|select)\b/.test(c) && /\b(video|result|one|link|item|product|song)\b/.test(c)) {
    if (onYouTube) return { label: `Playing video ${n.label}`, js: openNth(YOUTUBE_VIDEOS, n.index), patience: 6 };
    if (onAmazon) return { label: `Opening result ${n.label}`, js: openNth(AMAZON_RESULTS, n.index), patience: 6 };
    if (onGoogle) return { label: `Opening result ${n.label}`, js: openNth(GOOGLE_RESULTS, n.index), patience: 6 };
  }

  if (onAmazon && /\badd\b.*\bto\b.*\bcart\b/.test(c)) return { label: 'Adding to cart', js: amazonAddToCart(n?.index), patience: 6 };

  for (const [re, label, call] of MEDIA) {
    if (re.test(c)) return { label, patience: 3, js: `(() => { const v = [...document.querySelectorAll('video')].find(v => v.offsetWidth > 0);
      if (!v) return 'wait'; ${call}; return 'ok: ${label}'; })()` };
  }
  for (const [re, label, call] of PAGE) {
    if (re.test(c)) return { label, patience: 0, js: `(() => { ${call}; return 'ok: ${label}'; })()` };
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs a match, retrying while the page says "wait". Returns a short message for the caption. */
export async function runSiteAction(match, tabs) {
  // A navigation dispatched a moment ago ("search lofi and play the first video") has to land
  // first, or the *old* page's first video gets played.
  await sleep(300);
  await tabs.waitUntilLoaded();
  const deadline = Date.now() + match.patience * 1000;
  for (;;) {
    const r = String(await tabs.executeJS(match.js));
    if (r.startsWith('ok')) return r.slice(3).trim();
    if (r !== 'wait') return `Couldn't do that here (${r.slice(0, 60)})`;
    if (Date.now() >= deadline) return "Couldn't find that on this page";
    await sleep(400);
  }
}
