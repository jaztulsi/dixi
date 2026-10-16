// On-device intent model: TF-IDF over words + character trigrams, cosine nearest neighbour.
// The regex rules catch exact phrasings; this catches paraphrases ("put on the top clip") with no
// API call, and it learns: every phrase the AI resolves to a known intent becomes a new example,
// and every AI answer is remembered per site, so saying it again costs no tokens at all.

import { ordinal } from './siteActions.js';

const ORD = /\b(first|1st|top|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\b/g;
const FILLER = /\b(please|can you|could you|would you|will you|um+|uh+|just|for me|now|runic)\b/g;

/** Ordinals become one token, so "play the second video" is as close to the examples as "play the first video". */
export const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(FILLER, ' ')
  .replace(ORD, ' nth ').replace(/\s+/g, ' ').trim();

function features(text) {
  const t = normalize(text), f = new Map();
  const add = (k, w) => f.set(k, (f.get(k) ?? 0) + w);
  for (const w of t.split(' ')) if (w) add(`w:${w}`, 1);
  const p = ` ${t} `;
  for (let i = 0; i < p.length - 2; i++) add(`c:${p.slice(i, i + 3)}`, 0.5);
  return f;
}

/** Canonical command for "play the Nth thing", keeping which one was asked for. */
const nth = (clause) => {
  const n = ordinal(clause.toLowerCase());
  return !n || n.index === 0 ? 'play the first video' : n.index < 0 ? 'play the last video' : `play video number ${n.index + 1}`;
};

/** intent → { say: the phrase the rules understand, examples: how people actually say it }. */
export const INTENTS = {
  play_nth: { say: nth, examples: ['play the first video', 'click the first video', 'open the top result', 'watch the second one', 'put on the first clip', 'start the top video', 'play the first one', 'go to the first result', 'open the third link', 'select the first item', 'tap the first video', 'click on the first one', 'play the top one', 'open the first product'] },
  pause: { say: 'pause', examples: ['pause', 'pause it', 'pause the video', 'pause that', 'stop the music', 'freeze the video', 'hit pause', 'stop playing'] },
  resume: { say: 'play', examples: ['resume', 'keep playing', 'unpause', 'continue the video', 'start playing again', 'resume the video'] },
  mute: { say: 'mute', examples: ['mute', 'mute it', 'mute the video', 'turn the sound off', 'silence it', 'no sound'] },
  unmute: { say: 'unmute', examples: ['unmute', 'unmute it', 'turn the sound on', 'sound back on'] },
  skip_ad: { say: 'skip the ad', examples: ['skip the ad', 'skip this ad', 'get rid of the ad', 'skip ads', 'skip the commercial'] },
  next_video: { say: 'next video', examples: ['next video', 'play the next one', 'skip this video', 'next song', 'skip to the next one', 'play the next video'] },
  scroll_down: { say: 'scroll down', examples: ['scroll down', 'go down', 'move down', 'show me more', 'scroll lower', 'keep scrolling', 'page down', 'scroll down a bit'] },
  scroll_up: { say: 'scroll up', examples: ['scroll up', 'go up', 'move up', 'scroll back up', 'page up'] },
  top: { say: 'go to the top', examples: ['go to the top', 'back to the top', 'scroll to the top', 'top of the page'] },
  back: { say: 'go back', examples: ['go back', 'back', 'previous page', 'take me back', 'go back a page', 'return to the last page'] },
  forward: { say: 'go forward', examples: ['go forward', 'forward a page', 'next page'] },
  reload: { say: 'reload', examples: ['reload', 'refresh', 'reload the page', 'refresh this page', 'refresh the page'] },
  volume_up: { say: 'volume up', examples: ['volume up', 'louder', 'turn it up', 'make it louder', 'increase the volume', 'raise the volume'] },
  volume_down: { say: 'volume down', examples: ['volume down', 'quieter', 'turn it down', 'make it quieter', 'lower the volume', 'decrease the volume'] },
  faster: { say: 'faster', examples: ['faster', 'speed it up', 'play faster', 'increase the speed', 'speed up the video'] },
  slower: { say: 'slower', examples: ['slower', 'slow it down', 'play slower', 'decrease the speed', 'slow down the video'] },
  rewind: { say: 'rewind', examples: ['rewind', 'go back ten seconds', 'rewind a bit', 'back ten seconds', 'rewind the video', 'rewind ten seconds', 'rewind 10 seconds'] },
  skip_ahead: { say: 'skip ahead', examples: ['skip ahead', 'fast forward', 'forward ten seconds', 'jump ahead', 'skip forward'] },
  restart: { say: 'restart', examples: ['restart', 'restart the video', 'start over', 'play from the beginning', 'start it from the beginning'] },
  captions: { say: 'captions', examples: ['captions', 'turn on captions', 'subtitles', 'show captions', 'turn off subtitles', 'toggle captions'] },
  add_to_cart: { say: 'add it to cart', examples: ['add it to my cart', 'add to cart', 'put it in the cart', 'add this to the basket', 'add it to the cart'] },
  new_tab: { say: 'new tab', examples: ['new tab', 'open a new tab', 'make a new tab', 'another tab'] },
  close_tab: { say: 'close tab', examples: ['close tab', 'close this tab', 'close the tab', 'get rid of this tab'] },
  next_tab: { say: 'next tab', examples: ['next tab', 'switch tab', 'go to the next tab', 'switch to the other tab'] },
  prev_tab: { say: 'previous tab', examples: ['previous tab', 'last tab', 'go to the previous tab', 'switch back a tab'] },
  zoom_in: { say: 'zoom in', examples: ['zoom in', 'make it bigger', 'bigger text', 'enlarge the page'] },
  zoom_out: { say: 'zoom out', examples: ['zoom out', 'make it smaller', 'smaller text', 'shrink the page'] },
  zoom_reset: { say: 'reset zoom', examples: ['reset zoom', 'normal zoom', 'normal size', 'actual size'] },
  settings: { say: 'settings', examples: ['settings', 'open settings', 'show settings', 'preferences'] },
  stop_agent: { say: 'cancel', examples: ['cancel', 'stop everything', 'stop the agent', 'never mind stop', 'cancel that'] },
};

/** Canonical phrase for an intent, given what was actually said. */
export const say = (intent, clause) => { const s = INTENTS[intent].say; return typeof s === 'function' ? s(clause) : s; };

/** Maps one AI-chosen step back to an intent, so the model learns that phrasing for next time. */
export function intentForSteps(steps) {
  if (steps?.length !== 1) return null;
  const s = steps[0], t = `${s.target ?? ''} ${s.detail ?? ''}`.toLowerCase();
  if (s.action === 'scroll') return /\bup\b/.test(t) ? 'scroll_up' : 'scroll_down';
  if (s.action === 'go_back') return 'back';
  if (s.action === 'click' && new RegExp(ORD.source).test(t) && /\b(video|result|link|item|one|product)\b/.test(t)) return 'play_nth';
  return null;
}

export const MIN_SCORE = 0.6;   // below this it's not confidently any intent: ask the AI
export const MIN_MARGIN = 0.04; // best intent must beat the runner-up by this much

export class IntentModel {
  /** `store` is localStorage-like (or null for tests); learned phrases persist across launches. */
  constructor(store = null, key = 'runic.learnedIntents') {
    this.store = store; this.key = key;
    let learned = [];
    try { learned = JSON.parse(store?.getItem(key) ?? '[]'); } catch {}
    this.learned = learned.filter(([, intent]) => INTENTS[intent]);
    this.fit();
  }

  fit() {
    this.examples = [
      ...Object.entries(INTENTS).flatMap(([intent, { examples }]) => examples.map((text) => ({ text, intent }))),
      ...this.learned.map(([text, intent]) => ({ text, intent })),
    ];
    const raw = this.examples.map((e) => features(e.text));
    const df = new Map();
    for (const f of raw) for (const k of f.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    const n = raw.length;
    this.idf = (k) => Math.log((n + 1) / ((df.get(k) ?? 0) + 1)) + 1;
    this.vectors = raw.map((f) => this.vectorize(f));
  }

  vectorize(f) {
    const v = new Map();
    let norm = 0;
    for (const [k, tf] of f) { const w = tf * this.idf(k); v.set(k, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    return v;
  }

  /** {intent, score} when confident, else null. */
  predict(text) {
    if (!normalize(text)) return null;
    const q = this.vectorize(features(text));
    const best = new Map();
    this.vectors.forEach((v, i) => {
      let dot = 0;
      for (const [k, w] of q) dot += w * (v.get(k) ?? 0);
      const intent = this.examples[i].intent;
      if (dot > (best.get(intent) ?? 0)) best.set(intent, dot);
    });
    const [[intent, score] = [], [, second = 0] = []] = [...best].sort((a, b) => b[1] - a[1]);
    return intent && score >= MIN_SCORE && score - second >= MIN_MARGIN ? { intent, score } : null;
  }

  learn(text, intent) {
    if (!INTENTS[intent] || this.predict(text)?.intent === intent) return;
    this.learned.push([text, intent]);
    this.learned = this.learned.slice(-300);  // ponytail: refit is O(examples); fine at a few hundred
    try { this.store?.setItem(this.key, JSON.stringify(this.learned)); } catch {}
    this.fit();
  }
}

/** The AI's answer for a clause on a site, remembered: the same command again needs no API call. */
export class ReplyCache {
  constructor(store = null, key = 'runic.replyCache', max = 300) {
    this.store = store; this.key = key; this.max = max;
    try { this.map = new Map(JSON.parse(store?.getItem(key) ?? '[]')); } catch { this.map = new Map(); }
  }
  static keyFor(site, clause) {
    let host = '';
    try { host = new URL(site).hostname.replace(/^www\./, ''); } catch {}
    return `${host}|${clause.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()}`;
  }
  get(site, clause) { return this.map.get(ReplyCache.keyFor(site, clause)) ?? null; }
  set(site, clause, steps) {
    const k = ReplyCache.keyFor(site, clause);
    this.map.delete(k);
    this.map.set(k, steps);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    try { this.store?.setItem(this.key, JSON.stringify([...this.map])); } catch {}
  }
}
