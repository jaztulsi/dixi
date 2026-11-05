// The voice agent: acts WHILE you speak. Each finished clause ("go to Amazon", "and search for
// headphones") is understood and done in spoken order as soon as the next clause starts; the last one
// goes when you pause. Speech arrives as TurnInfo events (Deepgram Flux, or ElevenLabs translated by
// the main process): Update (words so far), EagerEndOfTurn, TurnResumed, EndOfTurn.
// A new command cancels whatever was still running (it never waits behind an old task).
// UI-free: deepgram (speech bridge), mic, tabs, speaker, llm, executor are injected.

import { interpret, fastPath, normName, tokens, incomplete, QUESTION, SHOPPING, isDixi, splitClauses } from './interpret.js';
import { demoSteps, demoPartial } from './demo.js';
import { HIVE } from './everywhere-words.js';

export { splitClauses };

// ---- the wake word ("Dixi"): isDixi (interpret.js) matches it by sound ----
const GREET = new Set(['hey', 'hi', 'ok', 'okay', 'yo', 'hello', 'so', 'um', 'uh']);
// "Dixi browser, just save…", "Dixi is getting activated": talking ABOUT Dixi. With a pause after the name
// ("Dixi, is it raining?") or a greeting before it ("hey Dixi…"), it's talking TO Dixi.
const MENTION = /^\s+(?:browser|app|window|dashboard|button|thing|code|voice|overlay|website|site|extension|project|features?|team|version|mascot|is|was|has|had|does|did|keeps|kept|isn'?t|wasn'?t|doesn'?t|didn'?t|should|would|could|can'?t|will|won'?t|just|always|never|still|gets?|getting|got|activat\w*|said|says|heard|hears|thinks|works|worked|needs)\b/i;
/** Character index just after the wake word, or -1. Only at the start, or right after a sentence break. */
export function wakeEnd(text) {
  const s = String(text);
  const re = /(^|[.!?,;]\s+)/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const words = [...s.slice(start).matchAll(/\S+/g)].slice(0, 3);
    let i = 0;
    while (i < words.length && GREET.has(tokens(words[i][0])[0]) && i < 2) i++;
    const w = words[i];
    const end = w ? start + w.index + w[0].length : 0;
    const greeted = words.slice(0, i).some((x) => /^(?:hey|hi|ok|okay|yo|hello)$/.test(tokens(x[0])[0]));   // ("so", "um": fillers, not a greeting)
    if (w && isDixi(tokens(w[0])[0]) && (greeted || /[,.!?:;]$/.test(w[0]) || !MENTION.test(s.slice(end)))) return end;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return -1;
}
/** Heard words that are mostly Dixi's last sentence, in order (longest common subsequence ≥ 75%). */
export function isEcho(heard, said) {
  const h = tokens(heard), s = tokens(said);
  if (!h.length) return true;
  let prev = new Array(s.length + 1).fill(0);
  for (const w of h) { const cur = [0]; for (let j = 1; j <= s.length; j++) cur[j] = w === s[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return prev[s.length] / h.length >= 0.75;
}
export function afterWakeWord(text) {
  const at = wakeEnd(text);
  if (at < 0) return null;
  let rest = String(text).slice(at).replace(/^[\s,.!?]+/, '');
  // "Dixi, Dixi, open…": the name said again is still the wake word, never part of the command.
  for (let m; (m = rest.match(/^(\S+?)[\s,.!?]+/)) && isDixi(tokens(m[1])[0]);) rest = rest.slice(m[0].length);
  return rest;
}

const STOP = /^(?:stop|cancel|never ?mind|stop (?:it|that|everything)|cancel (?:it|that))[.!]?$/i;
// "No, no, not that! Oh my god, why did Dixi do that?": nothing but a protest. It stops Dixi, never runs.
const PROTEST_BIT = String.raw`(?:no+|nope|not(?: (?:that|this|now|yet|again))?|wait|stop|don'?t(?: do (?:that|it|this))?|oh (?:my )?(?:god|gosh|no)|what are you doing|why (?:did|are|is) (?:you|dixi)[^.!?]*)`;
const PROTEST = new RegExp(String.raw`^${PROTEST_BIT}(?:[\s,.!?]+${PROTEST_BIT})*[\s,.!?]*$`, 'i');
const YES = /^(yes|yeah|yep|yup|sure|do it|go ahead|confirm|ok(ay)?|please do|place it|that'?s right|correct)\b/i;
const NO = /^(no|nope|nah|cancel|stop|don'?t|never ?mind|wait)\b/i;
const CONTINUE = /^(and|then|also|now|after that|plus)\b/i;
// "Stop and listen": a long, detailed request over as many sentences as you need, sent when you say "go".
const DICTATE = /^(?:ok(?:ay)?,?\s+)?(?:stop and listen|listen to me|listen carefully|let me explain|hear me out|i'?ll explain|take (?:a )?dictation|type (?:this|what i say)|dictate|write (?:this|what i say) down)\b[.!,:]?\s*/i;
const TYPE_IT = /^(?:ok(?:ay)?,?\s+)?(?:take (?:a )?dictation|type (?:this|what i say)|dictate|write (?:this|what i say) down)\b/i;
const DICTATED = /(?:^|[.!?,]\s*)(?:that'?s (?:it|all|everything)|i'?m (?:done|finished)|(?:ok(?:ay)?,?\s+)?go(?: ahead)?|done|over to you|send it)[.!?]*$/i;
const ORD = { first: 0, one: 0, '1': 0, second: 1, two: 1, '2': 1, third: 2, three: 2, '3': 2, last: -1 };
const ORD_FILLER = new Set(['the', 'a', 'number', 'option', 'choice', 'please', 'um', 'uh', 'i', 'mean', 'want', 'like', 'pick', 'take', 'that', 'it', 'is', 'its', 'oh', 'ok', 'okay', 'yeah', 'go', 'with', 'dixi']);

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const fp = (x) => [x.act, normName(x.said), normName(x.query), normName(x.item), x.value, x.n].join('|');

export function describe(s) {
  switch (s.act) {
    case 'open': return `Opening ${s.said || s.guess}`;
    case 'search': return `${s.said ? `${s.said}: ` : 'Searching '}“${s.query}”`;
    case 'find_item': return `Finding “${s.item}”${s.said ? ` on ${s.said}` : ''}`;
    case 'order': return `Getting ${s.qty > 1 ? `${s.qty} × ` : ''}“${s.item}”${s.said ? ` from ${s.said}` : ''}`;
    case 'add_to_cart': return 'Adding to cart';
    case 'remove': return `Removing ${s.item ? `“${s.item}”` : 'it'} from your cart`;
    case 'cart': return 'Opening your cart';
    case 'quantity': return s.value === 'set' ? `Quantity ${s.qty}` : s.value === 'down' ? 'One fewer' : 'One more';
    case 'checkout': return s.value === 'place_order' ? 'Placing the order (needs your yes)' : 'Going to checkout';
    case 'nth': return `Opening result ${s.n < 0 ? '(last)' : s.n}`;
    case 'media': return s.value.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
    case 'scroll': return `Scrolling ${s.value}`;
    case 'nav': return { back: 'Going back', forward: 'Going forward', reload: 'Reloading' }[s.value];
    case 'tab': return `${s.value} tab`;
    case 'zoom': return `Zoom ${s.value}`;
    case 'click': return `Clicking “${s.value}”`;
    case 'ask_page': return 'Answering from the page';
    case 'ask_web': return 'Looking that up';
    case 'stop': return 'Stopping';
    default: return '';
  }
}

export class VoiceAgent {
  constructor({ deepgram, mic, tabs, speaker, llm, tiers, executor, settings, registry = null, cache = null, agent = null,
    onChange = () => {}, trace = () => {}, followUpMS = 10000, settleMS = 550, specMS = 250, terms = [] }) {
    Object.assign(this, { deepgram, mic, tabs, speaker, llm, tiers, executor, settings, registry, cache, agent, onChange, trace, followUpMS, settleMS, specMS, terms });
    this.spec = new Map();  // clause words → understanding started early, at a short pause
    this.isListening = false;
    this.isStarting = false;
    this.isAwake = false;
    this.awakeUntil = 0;
    this.liveTranscript = '';
    this.statusLine = '';
    this.answer = null;
    this.plan = [];            // [{said, label, state: queued|running|done|failed|cancelled}]
    this.recent = [];
    this.queue = Promise.resolve();
    this.pending = 0;
    this.generation = 0;
    this.ctrl = new AbortController();
    this.turns = new Map();    // turn → {dispatched: [{key, fps}], timer}
    this.turnsDone = new Set();
    this.clarify = null;       // {question, options, resolve}
    this.confirmQ = null;
    this.bornTalking = new Map();   // turn → it began while Dixi was talking
    this.affordances = null;
    this.preconnected = new Set();
    deepgram?.onMessage((text) => this.handleMessage(text));
    deepgram?.onClosed(() => this.handleClosed());
  }

  get requireWakeWord() { return this.settings?.requireWakeWord ?? true; }
  get confirm() { return this.confirmQ; }
  set(fields) { Object.assign(this, fields); this.onChange(); }
  busy() { return this.pending > 0 || Boolean(this.agent?.isRunning) || Boolean(this.carry) || [...this.turns.values()].some((t) => t.timer); }

  // ---- lifecycle ----
  async start() {
    if (this.isListening || this.isStarting) return;
    // Push-to-talk (A1): no microphone and no speech socket outside a ⌥Space session, unless the experimental
    // always-listening wake word is on. Idle = zero audio sent anywhere.
    if (!this.session && !this.requireWakeWord) return;
    this.isStarting = true;
    this.stopped = false;
    try {
      // The mic opens at once (the key press), alongside the socket; what it hears before the socket is
      // open is held and sent after, so the first word isn't clipped. ~4 s at most (80 ms frames).
      const held = [];
      let open = false;
      const send = (chunk) => { if (open) this.deepgram.sendAudio(chunk); else if (held.length < 50) held.push(chunk); };
      const [opened] = await Promise.all([this.deepgram.open({ keyterms: this.keyterms() }), this.mic.start(send)]);
      if (!opened.ok) throw new Error(opened.error);
      // Paused while connecting: stay paused (the mic closes again, nothing is sent).
      if (this.stopped) { this.mic.stop(); await this.deepgram.close(); return; }
      open = true;
      for (const chunk of held.splice(0)) this.deepgram.sendAudio(chunk);
      this.set({ isListening: true, statusLine: '' });
    } catch (err) {
      this.mic?.stop();
      await this.deepgram.close();
      this.set({ statusLine: `Voice unavailable: ${err.message}` });
      throw err;
    } finally { this.isStarting = false; }
  }
  async stop() { this.stopped = true; this.isListening = false; this.mic?.stop(); await this.deepgram?.close(); this.set({ liveTranscript: '', statusLine: '' }); }
  async toggle() {
    if (this.session) return this.endSession();
    if (this.isListening) return this.stop();
    return this.requireWakeWord ? this.start().catch(() => {}) : this.startSession();
  }

  // ---- push-to-talk session (A1): ⌥Space opens it, ⌥Space again finishes and sends, Esc cancels ----
  // A forgotten session can't keep streaming: 60 s without words ends it, and so does the hard cap.
  async startSession({ silenceMS = 60000, maxMS = 180000 } = {}) {
    if (this.session) return;
    const s = this.session = { at: Date.now(), heard: Date.now() };
    this.sessionTimer = setInterval(() => {
      if (this.session === s && (Date.now() - s.heard > silenceMS || Date.now() - s.at > maxMS)) this.endSession();
    }, 1000);
    await this.start().catch(() => {});
    if (this.session === s && !this.isListening && !this.isStarting) this.endSession({ cancel: true });   // no mic or no socket
  }
  /** Close the mic now; the words still being transcribed get up to `waitMS` to arrive, then run. */
  async endSession({ cancel = false, waitMS = 1500 } = {}) {
    const s = this.session;
    if (!s) return;
    this.session = null;
    clearInterval(this.sessionTimer);
    this.mic?.stop();
    const open = this.heard && !this.turnsDone.has(this.heard.turn) ? this.heard : null;
    if (open && !cancel) {
      for (const until = Date.now() + waitMS; Date.now() < until && !this.turnsDone.has(open.turn);) await new Promise((r) => setTimeout(r, 50));
      if (!this.turnsDone.has(open.turn)) this.handleTurn({ event: 'EndOfTurn', transcript: this.heard.turn === open.turn ? this.heard.text : open.text, turn_index: open.turn });
    }
    await this.stop();
    this.onSessionEnd?.();   // main releases Esc and clears the panel
  }
  async handleClosed() {
    if (!this.isListening) return;
    this.isListening = false;
    this.mic?.stop();
    await new Promise((r) => setTimeout(r, 500));
    await this.start().catch(() => {});
  }

  /** Escape key / "reset": stop everything, clear the screen, reconnect the microphone fresh. */
  async reset() {
    this.cancelAll({ quiet: true });
    for (const s of this.spec.values()) s.ctrl.abort();
    this.spec.clear();
    for (const t of this.turns.values()) { clearTimeout(t.timer); clearTimeout(t.specTimer); }
    this.turns.clear();
    this.set({ plan: [], statusLine: '', liveTranscript: '', answer: null, isAwake: false, awakeUntil: 0 });
    if (this.session) await this.endSession({ cancel: true });   // Esc cancels a ⌥Space session: the mic closes
    else if (this.isListening) { await this.stop(); await this.start().catch(() => {}); }
  }

  /** Names to bias recognition toward: the wake word, sites you use, open tab titles. */
  keyterms() {
    const names = [...(this.registry?.names() ?? [])].slice(-40);
    const titles = (this.tabs?.visibleTabs ?? []).map((t) => (t.title || '').split(/\s[|–—:·-]\s/)[0]).filter((s) => s && s.length < 30);
    return [...new Set(['Dixi', 'Hey Dixi', ...(this.terms ?? []), ...names, ...titles].map((s) => s.replace(/,/g, ' ').trim()).filter(Boolean))].slice(0, 50);
  }
  updateKeyterms() { if (this.isListening && this.deepgram?.control) this.deepgram.control({ type: 'Configure', keyterms: this.keyterms() }); }

  // ---- speech ----
  handleMessage(raw) {
    let json;
    try { json = JSON.parse(raw); } catch { return; }
    // Say it on screen: a silent speech-service error looks like Dixi ignoring you.
    if (json.type === 'Error' || json.type === 'FatalError') { console.warn('[voice]', json.description ?? json.message); this.set({ statusLine: `Voice problem: ${String(json.description ?? json.message ?? 'speech service error').slice(0, 120)}` }); return; }
    if (json.type === 'TurnInfo') this.handleTurn(json);
  }

  /** True when the words heard are Dixi's own, from something it said in the last 20 seconds. */
  heardSelf(text) {
    const sp = this.speaker;
    const end = sp?.spans?.at(-1)?.end;
    if (!sp || (end != null && Date.now() - end > 20000)) return false;
    const t = tokens(text), c = this.clarify;
    // Just one of the open question's choices ("EJ Music", "the EJ one") is you answering, even in its
    // words. Not for yes/no questions: the tail "do it for you" of "Want me to do it for you?" mustn't confirm itself.
    if (c && c.options[0] !== 'yes' && c.options.some((o) => { const ow = tokens(o); return t.some((w) => ow.includes(w)) && t.every((w) => ow.includes(w) || ORD_FILLER.has(w) || w in ORD); })) return false;
    return tokens(text).length >= 2 && [sp.lastText, ...(sp.recentText ?? [])].some((s) => s && isEcho(text, s));
  }

  /** The command part of what was heard, or null if it wasn't for Dixi. Wake word alone → listen next. */
  addressed(text) {
    // (Never required in a ⌥Space session: a leading "Dixi" / "Dixie" / "Dixy" is just dropped.)
    if (!this.requireWakeWord || this.session) return afterWakeWord(text) ?? text;
    const rest = afterWakeWord(text);
    if (rest != null) {
      this.isAwake = true;
      // "Dixi." on its own: the next words are for Dixi. With a command after it, nothing stays open.
      if (!rest.trim()) this.awakeUntil = Date.now() + this.followUpMS;
      return rest;
    }
    // Only "Dixi" (or ⌥Space) wakes it, and the answer to a question it just asked you.
    if (this.clarify || Date.now() < this.awakeUntil) return text;
    return null;
  }

  handleTurn(json) {
    const text = (json.transcript ?? '').trim();
    const turn = json.turn_index ?? 0;
    // Which turns began while Dixi was still talking: a yes to "Press Send?" must start after the question.
    if (!this.bornTalking.has(turn)) { if (this.bornTalking.size > 50) this.bornTalking.clear(); this.bornTalking.set(turn, Boolean(this.speaker?.isBusy?.())); }
    // While Dixi talks the mic also hears Dixi: ignore it, unless you barge in ("stop", or the wake word).
    if (this.speaker?.isBusy?.()) {
      if (STOP.test(text)) { this.speaker.stop(); this.cancelAll(); return; }
      if (this.confirmQ) return;   // a yes over the question (a TV, its echo) never counts; let it finish
      // Dixi's own words coming back through the mic (this line, or the last few heard late): ignore. So
      // is one stray word (a TV, the tail of its own sentence) unless Dixi asked a question. Anything
      // else is you talking over it.
      const named = afterWakeWord(text) != null;
      if (!named && (!this.clarify && tokens(text).length < 2)) return;
      // (Its own lines can contain "Dixi": "…, Dixi needs permission". Still its own words.)
      if ([this.speaker.lastText, ...(this.speaker.recentText ?? [])].some((s) => isEcho(text, s ?? ''))) return;
      this.speaker.stop();
    }
    // ...and after it stops: speech-to-text can deliver Dixi's own words seconds late. Words that repeat
    // what Dixi said in the last 20 s are Dixi, not you, even with "Dixi" in them. "Stop" always wins.
    if (text && !STOP.test((afterWakeWord(text) ?? text).trim()) && this.heardSelf(text)) { if (json.event === 'EndOfTurn') this.turnsDone.add(turn); return; }
    if (json.event === 'StartOfTurn') { this.refreshAffordances(); return; }
    if (json.event === 'TurnResumed') return;
    if (!text || this.turnsDone.has(turn)) return;
    this.lastTurn = turn;
    this.heard = { turn, text };   // what a session's second ⌥Space sends if the final transcript is late
    if (this.session) this.session.heard = Date.now();
    // Mostly another language (people talking nearby; Dixi listens for English): not for Dixi.
    if ((text.match(/[^\u0000-\u024f\s\d\p{P}\p{S}]/gu) ?? []).length > text.replace(/\s/g, '').length * 0.3) return;
    const final = json.event === 'EndOfTurn';
    if (this.dictation && this.dictate(text, turn, final)) return;
    const cmd = this.addressed(text);
    this.set({ liveTranscript: text, isAwake: cmd != null });
    if (cmd == null) { if (final) this.turnsDone.add(turn); return; }
    // (A "stop" still being said keeps the turn open, so "stop and listen" can follow.)
    if (STOP.test(cmd.trim())) { this.cancelAll(); this.carry = null; if (final || !/^stop[.!]?$/i.test(cmd.trim())) this.turnsDone.add(turn); return; }
    if (!this.clarify && PROTEST.test(cmd.trim())) { this.cancelAll(); if (final) this.turnsDone.add(turn); return; }
    if (DICTATE.test(cmd.trim())) {
      if (final) { this.turnsDone.add(turn); this.dictation = { parts: [], at: Date.now(), type: TYPE_IT.test(cmd.trim()) }; this.dictate(cmd.trim().replace(DICTATE, ''), turn, true, { first: true }); }
      return;
    }
    // Finishing the sentence the last turn left hanging (within a few seconds).
    const carried = this.carry && Date.now() - this.carry.at < 6000 && !this.clarify ? this.carry.text : '';
    const command = carried ? `${carried} ${cmd.trim()}` : cmd.trim();
    if (carried) clearTimeout(this.carryTimer);
    if (final) this.carry = null;
    if (this.clarify) {   // answering a question Dixi asked: wait for the whole answer
      // ...said after the question: the end of the sentence that asked for it ("I want an iPad.", its
      // final words arriving after a hard-coded line already asked "Which iPad?") is not the answer.
      if (turn === this.clarify.turn || (this.confirmQ && this.bornTalking.get(turn))) { if (final) this.turnsDone.add(turn); return; }
      // A yes to "Press Send?" without "Dixi" counts only right after the question (8 s); later anyone in
      // the room could answer it, so then it takes "Dixi, yes" or the card's button.
      const named = afterWakeWord(text) != null;
      if (this.confirmQ && !named && Date.now() - (this.speaker?.spans?.at(-1)?.end ?? 0) > 8000) { if (final) this.turnsDone.add(turn); return; }
      if (final || json.event === 'EagerEndOfTurn') { this.turnsDone.add(turn); this.handleText(command, { named }); }
      return;
    }
    // Dixi Everywhere: about the app in front (or just after ⌥Space) is answered on the whole Mac.
    if (command && (this.everywhereTurn === turn || this.everywhere?.wants(command))) {
      this.everywhereTurn = turn;
      const st = this.turns.get(turn);
      if (st) { clearTimeout(st.timer); clearTimeout(st.specTimer); this.turns.delete(turn); }
      this.everywhere.transcript(command);
      if (final) { this.turnsDone.add(turn); this.awakeUntil = 0; this.everywhere.run(command); }
      return;
    }
    if (command) {
      this.preconnect(command);
      this.progress(turn, command, final || json.event === 'EagerEndOfTurn');
    }
    if (final) { clearTimeout(this.turns.get(turn)?.timer); this.turnsDone.add(turn); this.turns.delete(turn); }
  }

  /**
   * "Stop and listen" mode: every sentence is kept, nothing is done, until "go" / "that's it" (sent) or
   * "stop" (dropped). Returns false when the mode has gone stale (2 minutes of silence): heard as usual.
   */
  dictate(text, turn, final, { first = false } = {}) {
    const d = this.dictation;
    if (!first && Date.now() - d.at > 120000) { this.dictation = null; return false; }
    const said = (afterWakeWord(text) ?? text).trim();
    const sofar = [...d.parts, said].join(' ').trim();
    if (!final) { this.set({ liveTranscript: sofar, isAwake: true, statusLine: 'Listening. Say “go” when you’re done.' }); this.everywhere?.transcript(sofar); return true; }
    this.turnsDone.add(turn);
    if (STOP.test(said)) { this.dictation = null; this.cancelAll(); return true; }
    const end = said.match(DICTATED);
    const body = (end ? said.slice(0, end.index) : said).trim();
    if (body) d.parts.push(body);
    d.at = Date.now();
    this.awakeUntil = Date.now() + 120000;
    if (!end) {
      this.set({ liveTranscript: d.parts.join(' '), isAwake: true, statusLine: 'Listening. Say “go” when you’re done.' });
      if (first) this.say(d.type ? 'Go ahead, I’ll type what you say. Say “go” when you’re done.' : 'I’m listening. Take your time, and say “go” when you’re done.');
      return true;
    }
    this.dictation = null;
    const all = d.parts.join(' ');
    this.set({ liveTranscript: all, statusLine: '' });
    if (!all) return true;
    this.awakeUntil = 0;
    if (d.type) { if (this.everywhere) this.everywhere.run(all, 'type'); else this.say('Typing into other apps needs Dixi for Mac.'); return true; }
    this.sendDictated(all);
    return true;
  }
  /** A long request can go to your own Claude Code agents: asked, never assumed. */
  async sendDictated(all) {
    const ew = this.everywhere;
    if (ew && !HIVE.test(all) && tokens(all).length >= 25) {
      const a = await this.ask('That’s a big one. Should your Claude team take it?', ['yes', 'no']);
      if (a === 'yes') return ew.run(all, 'hive');
      if (a !== 'no') return;   // no answer, or something else said instead (that's handled as its own request)
    }
    if (ew?.wants(all)) ew.run(all);
    else this.handleText(all);
  }

  /**
   * Words so far → act on every finished clause now; the last one when you pause (or the turn ends).
   * Each clause is understood once; if a clause grew after it started ("go to Amazon" → "go to Amazon
   * search headphones"), only what the longer version adds is done.
   */
  progress(turn, command, ended) {
    let st = this.turns.get(turn);
    if (!st) { st = { dispatched: [], timer: null }; this.turns.set(turn, st); }
    const clauses = splitClauses(command);
    if (!clauses.length) return;
    // Buying waits for the final words: half-heard words ("iPhone 17e…" on the way to "iPhone 17 in
    // black") are never bought. A clause that needs no AI (a demo line, "add it to my cart") is exact and
    // goes at once. Nothing after a waiting clause goes ahead of it.
    const waits = (c) => !ended && SHOPPING.test(c) && !fastPath(c);
    let held = false;
    for (const c of clauses.slice(0, -1)) { held ||= waits(c); if (!held) this.dispatch(st, c); }
    const last = clauses.at(-1);
    clearTimeout(st.timer);
    clearTimeout(st.specTimer);
    st.timer = null;
    // The turn ended mid-sentence (a long "uh"): keep the words for the next turn to finish.
    if (ended && incomplete(last)) {
      const c = { text: last, at: Date.now() };
      this.carry = c;
      // Nothing followed: do what was said anyway (a lone "can" or "uh" is dropped). The start of a demo
      // line is already a whole command ("buy an iPhone 17 in black"): it waits less (the speech service
      // already waited ~0.9 s of silence), half a sentence ("can you") waits longer.
      clearTimeout(this.carryTimer);
      this.carryTimer = setTimeout(() => { if (this.carry === c) { this.carry = null; this.onChange(); if (tokens(c.text).length >= 3 || demoPartial(c.text)) this.handleText(c.text); } }, demoPartial(last) ? 1200 : 2500);
      return;
    }
    if (ended) this.dispatch(st, last);
    // Act at a pause only on a whole command: not half a sentence ("…the features of"), not a word
    // still being transcribed ("Amazon-", an open quote), and never a question (answered once, whole).
    else if (!incomplete(last) && !/[-–—]["”']?\s*$/.test(command) && ((command.match(/"/g) ?? []).length % 2 === 0)) {
      // A demo line (hard-coded, nothing to work out) goes at the first short pause.
      const demo = Boolean(demoSteps(last));
      if (!held && (demo || (!QUESTION.test(last) && !this.namesUnknownSite(last) && !waits(last)))) st.timer = setTimeout(() => { st.timer = null; this.dispatch(st, last); }, demo ? Math.min(this.specMS, this.settleMS) : this.settleMS);
      // Start understanding at a short pause (ready by the end of the sentence); acting waits. Not for
      // buying words that wait for the final transcript: half-heard, they'd be understood for nothing.
      if (this.specMS < this.settleMS && !held && !waits(last)) st.specTimer = setTimeout(() => this.speculate(last), this.specMS);
    }
  }

  /**
   * "take me to Maya…", "…on Zentora": a site you haven't used yet may still be growing ("Maya Indian
   * Kitchen"), so it waits for the end of the sentence. Sites you've used open while you talk.
   */
  namesUnknownSite(clause) {
    const m = clause.match(/\b(?:open|go to|take me to|show me|pull up|bring up|launch|visit|navigate to|head to|(?:website|site) (?:of|for)|on|at|from)\s+(?:up\s+)?(?:the\s+)?(.+)$/i);
    if (!m) return false;
    const name = normName(m[1].replace(/\s+(website|site|app|page)$/i, ''));
    return Boolean(name) && !(this.registry?.names() ?? []).some((n) => normName(n) === name);
  }

  speculate(text) {
    const key = normName(text);
    if (!key || this.spec.has(key) || this.clarify || STOP.test(text)) return;
    for (const [k, s] of this.spec) if (key.startsWith(`${k} `) || Date.now() - s.at > 15000) { s.ctrl.abort(); this.spec.delete(k); }  // outgrown or stale
    const ctrl = new AbortController();
    this.ctrl.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    const url = this.tabs.getCurrentURL();
    // Warm up what acting will need (site lookup, search address, connection) while you finish talking:
    // from the quick early understanding of a shopping command, or from the understanding itself.
    const warm = (i) => { if (!ctrl.signal.aborted && i) this.executor?.prefetch?.(i); };
    const parsing = interpret(text, this.context(text), { llm: this.llm, tiers: this.tiers, cache: this.cache, signal: ctrl.signal, onEarly: warm });
    this.trace('speculate', { text });
    this.spec.set(key, { ctrl, url, at: Date.now(), parsing });
    parsing.then((p) => warm(p?.intent)).catch(() => {});
  }

  /** An early understanding of exactly these words, if the page hasn't changed since it started. */
  takeSpec(text) {
    const key = normName(text), s = this.spec.get(key);
    this.spec.delete(key);
    return s && !s.ctrl.signal.aborted && s.url === this.tabs.getCurrentURL() ? s.parsing : null;
  }

  dispatch(st, clause) {
    const key = normName(clause);
    if (!key || st.dispatched.some((d) => d.key === key)) return;
    const grownFrom = st.dispatched.find((d) => key.startsWith(`${d.key} `));
    // A brand-new command (not "and…", not more of this turn) replaces any task still running.
    // (Something that only just started — the page you asked for a moment ago — keeps going: it's queued after.)
    // An answer to Dixi's own question ("Which iPhone?" → "the iPhone 17") never cancels the task asking it.
    if (!this.clarify && !st.dispatched.length && (this.pending || this.agent?.isRunning) && !CONTINUE.test(clause) && Date.now() - (this.stepStartedAt ?? 0) > 2500) this.cancelAll({ quiet: true });
    const entry = { key, fps: [] };
    st.dispatched.push(entry);
    this.trace('clause', { clause, grown: Boolean(grownFrom) });
    this.handleText(clause, { entry, turn: st });
  }

  preconnect(text) {
    const t = ` ${tokens(text).join(' ')} `;
    for (const name of this.registry?.names() ?? []) {
      if (this.preconnected.has(name) || !t.includes(` ${normName(name)} `)) continue;
      this.preconnected.add(name);
      const e = this.registry.lookup(name);
      if (e?.url) window.dixi?.preconnect?.(e.url);
    }
  }

  async refreshAffordances() {
    const url = this.tabs.getCurrentURL();
    if (!/^https?:/.test(url) || this.affordances?.url === url) return;
    const text = await this.tabs.dx('affordances').catch(() => '');
    this.affordances = { url, text: typeof text === 'string' ? text.slice(0, 600) : '' };
  }

  context(text) {
    const url = this.tabs.getCurrentURL();
    const names = new Set((this.registry?.names() ?? []).map(normName));
    const said = tokens(text), candidates = [];
    for (const n of names) {
      const nw = n.split(' ');
      for (let i = 0; i + nw.length <= said.length; i++) {
        const span = said.slice(i, i + nw.length).join('');
        if (span !== nw.join('') && lev(span, nw.join('')) <= Math.max(1, Math.floor(nw.join('').length / 5))) { candidates.push(n); break; }
      }
    }
    return {
      url: /^https?:/.test(url) ? url : '', title: this.tabs.activeTab?.title ?? '', host: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
      tabs: this.tabs.visibleTabs.length > 1 ? this.tabs.tabList() : '', recent: this.recent, names, candidates: candidates.slice(0, 5),
      affordances: this.affordances?.url === url ? this.affordances.text : '',
    };
  }

  // ---- understanding and doing ----

  /**
   * A finished command (or clause), spoken or typed. Understanding starts at once (in parallel with
   * anything still running); the doing waits its turn in the queue, so clauses happen in spoken order.
   */
  handleText(text, { entry = null, turn = null, named = true } = {}) {
    if (this.clarify) { this.answerClarify(text, named); return Promise.resolve(); }
    if (STOP.test(text)) { this.cancelAll(); return Promise.resolve(); }
    const gen = this.generation;
    const signal = this.ctrl.signal;
    const t0 = performance.now();
    const parsing = this.takeSpec(text) ?? interpret(text, this.context(text), { llm: this.llm, tiers: this.tiers, cache: this.cache, signal, onEarly: (i) => this.executor?.prefetch?.(i) });
    this.set({ answer: null });
    this.pending++;
    this.queue = this.queue.then(async () => {
      const parsed = await parsing;
      if (gen !== this.generation) return;
      this.trace('interpret', { text, source: parsed.source, ms: parsed.ms, intent: parsed.intent, errors: parsed.errors, waitMs: Math.round(performance.now() - t0) });
      const intent = parsed.intent;
      if (!intent) return;
      if (intent.clarify && !intent.steps.length) { this.say(intent.clarify); this.set({ statusLine: intent.clarify }); return; }
      // Steps an earlier hearing of this sentence already started aren't done twice: a shorter version
      // ("go to Amazon" → "go to Amazon and search…"), or the same words written differently in the
      // final transcript ("256 gigabytes" while talking, "256 GB" at the end). Clauses run in order, so
      // every earlier clause of this turn has been understood by now.
      const done = turn ? turn.dispatched.filter((d) => d !== entry).flatMap((d) => d.fps) : [];
      const steps = intent.steps.filter((s) => s.act !== 'none' && !done.includes(fp(s)));
      if (entry) entry.fps = steps.map(fp);
      if (!steps.length) return;
      if (steps.some((s) => s.act === 'stop')) { this.cancelAll(); return; }
      if (!this.plan.some((p) => p.state === 'running' || p.state === 'queued')) this.plan = [];
      const items = steps.map((s) => ({ said: text, label: describe(s), state: 'queued', step: s }));
      this.plan.push(...items);
      this.onChange();
      const results = [];
      for (const item of items) {
        if (gen !== this.generation) { item.state = 'cancelled'; continue; }
        item.state = 'running';
        this.stepStartedAt = Date.now();
        this.set({ statusLine: item.label });
        this.trace('step_start', { act: item.step.act });
        const r = await this.executor.run(item.step, text, signal);
        if (gen !== this.generation) { item.state = 'cancelled'; continue; }
        item.state = r.ok ? 'done' : 'failed';
        item.label = r.message;
        results.push(r);
        this.trace('step_end', { act: item.step.act, ok: r.ok, message: r.message });
        this.recent.push(`${item.step.act}${item.step.said ? ` ${item.step.said}` : ''} → ${r.ok ? 'ok' : 'failed'}`);
        this.recent = this.recent.slice(-5);
        this.set({ statusLine: r.ok ? r.message : '' });
        if (r.answer) this.set({ answer: r.answer });
        // A human check in the way is handed to you: nothing after it runs.
        if (!r.ok || r.botWall) { items.slice(items.indexOf(item) + 1).forEach((x) => { x.state = 'cancelled'; }); break; }
      }
      // Only fully successful understandings are remembered (a wrong one is never replayed).
      if (results.length === items.length && results.every((r) => r.ok) && parsed.source !== 'cache' && this.cache) this.cache.set(`${this.context(text).host}|${normName(text)}`, intent);
      this.onChange();
    }).catch((err) => console.error('[voice]', err)).finally(() => { this.pending = Math.max(0, this.pending - 1); this.onChange(); });
    return this.queue;
  }

  say(text) { this.speaker?.say(text); }

  /** A short spoken question; the next thing said answers it (or null after 25 s / cancel). */
  ask(question, options = [], { raw = false } = {}) {
    this.clarify?.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.clarify?.resolve === done) { this.clarify = null; this.onChange(); } resolve(null); }, 25000);
      const done = (v) => { clearTimeout(timer); resolve(v); };
      this.clarify = { question, options, resolve: done, turn: this.lastTurn, raw };   // (open: its answer needs no "Dixi")
      this.set({ statusLine: question });
      this.say(question);
    });
  }
  async confirmAction(question) {
    this.confirmQ = { question };
    const a = await this.ask(question, ['yes', 'no']);
    this.confirmQ = null;
    this.onChange();
    return a === 'yes';
  }
  answerClarify(text, named = true) {
    const c = this.clarify;
    this.clarify = null;
    if (c.raw) { this.onChange(); c.resolve(text); return; }   // a question wanting words, not a pick
    const t = tokens(text);
    let pick = null;
    if (c.options[0] === 'yes') pick = YES.test(text.trim()) ? 'yes' : NO.test(text.trim()) ? 'no' : null;
    else {
      // By position only when that's all the reply says ("two", "the second one"): in "make the iPhone two"
      // the two is a quantity, and the sentence is a new command.
      const n = t.find((w) => w in ORD);
      if (n && t.every((w) => w in ORD || ORD_FILLER.has(w))) pick = ORD[n] < 0 ? c.options.at(-1) : c.options[ORD[n]] ?? null;
      // By name: the whole name, else the words that tell the options apart ("the Pro 3", "the Air").
      const shared = tokens(c.options[0]).filter((w) => c.options.every((o) => tokens(o).includes(w)));
      const score = (o) => tokens(o).filter((w) => !shared.includes(w) && t.includes(w)).length;
      const best = Math.max(0, ...c.options.map(score));
      pick ??= c.options.find((o) => tokens(o).every((w) => t.includes(w))) ?? (best && c.options.filter((o) => score(o) === best).length === 1 ? c.options.find((o) => score(o) === best) : null);
    }
    // Not an answer and not addressed to Dixi (the TV, someone talking): ignored, and the question stays
    // open. Only a new request that starts with "Dixi" replaces it.
    if (pick == null && !NO.test(text.trim()) && !named) { this.clarify = c; return; }
    this.onChange();
    c.resolve(pick);
    if (pick == null && !NO.test(text.trim())) this.handleText(text);
  }

  /** "Stop" / a new command: right now. Aborts AI calls and page work, drops queued steps, clears questions. */
  cancelAll({ quiet = false } = {}) {
    this.generation++;
    this.ctrl.abort();
    this.ctrl = new AbortController();
    this.clarify?.resolve(null);
    this.clarify = null;
    this.confirmQ = null;
    this.carry = null;
    this.dictation = null;
    clearTimeout(this.carryTimer);
    if (this.agent?.isRunning) this.agent.stop();
    this.everywhere?.stop();
    for (const p of this.plan) if (p.state === 'queued' || p.state === 'running') p.state = 'cancelled';
    this.plan = this.plan.filter((p) => p.state !== 'cancelled' && p.state !== 'failed');
    this.queue = Promise.resolve();
    this.pending = 0;
    this.speaker?.stop?.();
    this.trace('cancel', { quiet });
    this.set({ statusLine: quiet ? '' : 'Stopped' });
  }
}
