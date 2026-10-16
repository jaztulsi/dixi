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
// YouTube mixes old renderers with the new yt-lockup-view-model (the watch page has only the new one),
// so: every visible /watch link in page order, one per video, minus ads and the video already playing.
const YOUTUBE_VIDEOS = `(() => { const seen = new Set(), here = new URLSearchParams(location.search).get('v');
  return [...document.querySelectorAll('a[href*="/watch?v="]')].filter(a => {
    if (a.offsetParent === null || a.closest('ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, #player')) return false;
    const v = new URL(a.href).searchParams.get('v');
    if (!v || v === here || seen.has(v)) return false;
    seen.add(v); return true; }); })()`;
const AMAZON_RESULTS = `[...document.querySelectorAll('div[data-component-type="s-search-result"]')]
  .map(r => r.querySelector('h2 a, a.a-link-normal.s-link-style, a:has(h2)')).filter(a => a && a.href)`;
// Apple Music search results (songs, albums, playlists, stations), in page order, one per link.
const APPLE_MUSIC_RESULTS = `(() => { const seen = new Set();
  return [...document.querySelectorAll('a[href*="/song/"], a[href*="/album/"], a[href*="/playlist/"], a[href*="/station/"]')]
    .filter(a => a.offsetParent !== null && !seen.has(a.href) && seen.add(a.href)); })()`;
// Without an Apple Music sign-in the web player plays 30-second previews: press Preview (or Play).
const APPLE_MUSIC_PREVIEW = `(() => { const b = [...document.querySelectorAll('button')]
    .find(x => x.offsetParent !== null && /^(preview|play)$/i.test((x.textContent || x.getAttribute('aria-label') || '').trim()));
  if (!b) return 'wait'; b.click(); return 'ok: playing a preview'; })()`;
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
  [/^(volume up|louder|turn it up)$/, 'Louder', 'v.muted = false; v.volume = Math.min(1, v.volume + 0.2)'],
  [/^(volume down|quieter|turn it down)$/, 'Quieter', 'v.volume = Math.max(0, v.volume - 0.2)'],
  [/^(faster|speed (it )?up)$/, 'Faster', 'v.playbackRate = Math.min(2, v.playbackRate + 0.25)'],
  [/^(slower|slow (it )?down)$/, 'Slower', 'v.playbackRate = Math.max(0.25, v.playbackRate - 0.25)'],
  [/^rewind( (it|the video))?$/, 'Back 10 seconds', 'v.currentTime = Math.max(0, v.currentTime - 10)'],
  [/^(skip ahead|fast forward)$/, 'Ahead 10 seconds', 'v.currentTime += 10'],
  [/^(restart|start over)( (the )?video)?$/, 'From the start', 'v.currentTime = 0; v.play()'],
  [/^next (video|song|one)$|^(skip|next)$/, 'Next video', "document.querySelector('.ytp-next-button').click()"],
  [/^(captions|subtitles)( (on|off))?$|^turn (on|off) (captions|subtitles)$/, 'Captions', "document.querySelector('.ytp-subtitles-button').click()"],
];

// Dixi's own controls (tabs, zoom, settings), run by the app, not in the page.
const APP = [
  [/^(open )?(a )?new tab$/, 'New tab', 'newTab'],
  [/^close (this |the )?tab$/, 'Closed tab', 'closeTab'],
  [/^(next|switch) tab$/, 'Next tab', 'nextTab'],
  [/^previous tab$/, 'Previous tab', 'prevTab'],
  [/^zoom in$/, 'Zoomed in', 'zoomIn'],
  [/^zoom out$/, 'Zoomed out', 'zoomOut'],
  [/^reset zoom$/, 'Normal zoom', 'zoomReset'],
  [/^(open )?settings$/, 'Settings', 'settings'],
  [/^(cancel|stop everything|stop the agent)$/, 'Stopped', 'stopAgent'],
];
const clean = (command) => command.toLowerCase().trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');

/** {label, app: name of the app action} or null. */
export function matchAppAction(command) {
  const c = clean(command);
  const hit = APP.find(([re]) => re.test(c));
  return hit ? { label: hit[1], app: hit[2] } : null;
}
const PAGE = [
  [/^scroll( (it|the page))? down$|^(page )?down$/, 'Scrolling down', "window.scrollBy({top: innerHeight * 0.8, behavior: 'smooth'})"],
  [/^scroll( (it|the page))? up$|^(page )?up$/, 'Scrolling up', "window.scrollBy({top: -innerHeight * 0.8, behavior: 'smooth'})"],
  [/^(scroll to the )?top$|^go to the top$/, 'Top of page', "window.scrollTo({top: 0, behavior: 'smooth'})"],
  [/^go back$|^back$/, 'Going back', 'history.back()'],
  [/^go forward$|^forward$/, 'Going forward', 'history.forward()'],
  [/^(reload|refresh)( (the )?page)?$/, 'Reloading', 'location.reload()'],
];

/** {label, js, patience (s)} or null. js returns "ok: <message>" or "wait" (page not ready yet). */
// Any site: click the visible link/button whose text best matches the words ("whopper", "chicken burger").
// Deterministic and AI-free; "wait" until something matches at least half the words.
const pickByText = (words) => `(() => { const want = ${JSON.stringify(words)};
  let best = null, bestScore = 0;
  for (const el of document.querySelectorAll('a[href], button, [role="link"], [role="button"], [role="option"]')) {
    if (el.offsetParent === null) continue;
    const text = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().replace(/\\s+/g, ' ').trim();
    if (!text || text.length > 140) continue;
    const hits = want.filter((w) => text.includes(w)).length;
    const score = hits / want.length - text.length / 2000;
    if (hits && score > bestScore) { bestScore = score; best = el; }
  }
  if (!best || bestScore < 0.5) return 'wait';
  const label = (best.innerText || best.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  best.scrollIntoView({ block: 'center' }); best.click(); return 'ok: ' + label; })()`;
// Any site: the item page's own "Add to order / bag / cart" button.
const ADD_TO_ORDER = `(() => { const re = /^(add to (cart|bag|order|basket|meal)|add item|add to my order|order now|add)\\b/i;
  const b = [...document.querySelectorAll('button, [role="button"], input[type="submit"], a')]
    .find((e) => e.offsetParent !== null && !e.disabled && re.test((e.innerText || e.value || e.getAttribute('aria-label') || '').trim()));
  if (!b) return 'wait';
  b.click(); return 'ok: added to your order'; })()`;
const STOP_WORDS = new Set(['a', 'an', 'the', 'some', 'with', 'no', 'without', 'extra', 'please', 'me', 'my', 'and', 'large', 'small', 'medium', 'of']);
/** "chicken burger with no pickles" → ["chicken", "burger"]: the words that name the item, not how it's made. */
export const itemWords = (item) => item.toLowerCase().split(/\s+(?:with|without|no|extra)\s+/)[0].split(/\s+/).filter((w) => w && !STOP_WORDS.has(w));

export function matchSiteAction(command, url) {
  const c = clean(command);
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const onYouTube = host.endsWith('youtube.com'), onAmazon = host.includes('amazon.');
  const onGoogle = host.endsWith('google.com') && url.includes('/search');
  const onAppleMusic = host === 'music.apple.com';

  if (/\bskip\b.*\bads?\b/.test(c)) return { label: 'Skipping ad', js: SKIP_AD, patience: 8 };

  const n = ordinal(c);
  if (n && /\b(play|open|watch|click|tap|go to|select)\b/.test(c) && /\b(video|result|one|link|item|product|song)\b/.test(c)) {
    if (onYouTube) return { label: `Playing video ${n.label}`, js: openNth(YOUTUBE_VIDEOS, n.index), patience: 6, navigates: true };
    if (onAmazon) return { label: `Opening result ${n.label}`, js: openNth(AMAZON_RESULTS, n.index), patience: 6, navigates: true };
    if (onGoogle) return { label: `Opening result ${n.label}`, js: openNth(GOOGLE_RESULTS, n.index), patience: 6, navigates: true };
    if (onAppleMusic) return { label: `Playing result ${n.label}`, js: openNth(APPLE_MUSIC_RESULTS, n.index), patience: 8, navigates: true,
      then: { label: 'Playing a preview', js: APPLE_MUSIC_PREVIEW, patience: 10 } };
  }

  if (onAmazon && /\badd\b.*\bto\b.*\bcart\b/.test(c)) return { label: 'Adding to cart', js: amazonAddToCart(n?.index), patience: 6 };
  const find = c.match(/^(?:find|open|select) (.+) on (?:the|this) (?:page|menu)$/);
  if (find && itemWords(find[1]).length) return { label: `Found “${find[1]}”`, js: pickByText(itemWords(find[1])), patience: 10, navigates: true };
  if (/^add (?:it|this|that) to (?:the |my )?(?:order|bag|cart|basket)$/.test(c)) return { label: 'Added to your order', js: ADD_TO_ORDER, patience: 8 };

  if (onAppleMusic && /^(play|play it|play this|play the (song|album|playlist)|preview( it)?)$/.test(c)) return { label: 'Playing a preview', js: APPLE_MUSIC_PREVIEW, patience: 10 };
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
  // No waiting for the whole page: the script says "wait" until what it needs exists, then acts.
  const deadline = Date.now() + match.patience * 1000;
  for (;;) {
    const r = String(await tabs.executeJS(match.js));
    if (r.startsWith('ok')) {
      // The next command ("...and how many subs?") must see the new page, not the old one.
      if (match.navigates && !r.startsWith('ok: only')) { await sleep(300); await tabs.waitUntilLoaded(); }
      if (match.then && !r.startsWith('ok: only')) return runSiteAction(match.then, tabs);  // e.g. open the song, then press Preview
      return r.slice(3).trim();
    }
    if (r !== 'wait') return `Couldn't do that here (${r.slice(0, 60)})`;
    if (Date.now() >= deadline) return "Couldn't find that on this page";
    await sleep(150);
  }
}
