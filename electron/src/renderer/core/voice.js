// The voice agent (ported from VoiceAgent.swift). Always listening; acts on finished clauses while
// you're still talking. UI-free: Deepgram, mic, tabs, agent, speaker and llm are injected.

import {
  NAVIGATE_PATTERN, resolveURL, splitOnConjunctions, clauseKey, isQuestion, yesOrNo, afterWakeWord,
  parseSearch, searchURL, hasSearchURL, platformFor, stepFingerprint, friendlyStatus, agentTask, directNavigationURL,
} from './text.js';
import { matchSiteAction, matchAppAction, runSiteAction } from './siteActions.js';
import { IntentModel, ReplyCache, intentForSteps, say } from './learn.js';
import { askPage } from './pageQA.js';
import { INTENT_PROMPT } from './prompts.js';

/** Rolling action history fed to each intent call, so "the other one" resolves. */
export class SessionContext {
  constructor(max = 6) { this.history = []; this.max = max; }
  record(r) { this.history.push(r); if (this.history.length > this.max) this.history.shift(); }
  hydrate() {
    return this.history.map((r, i) =>
      `[${i + 1}] User said: "${r.utterance}" → ${r.action} ${r.target} ${r.detail}${r.pageTitle ? ` (page: ${r.pageTitle})` : ''}`).join('\n');
  }
}

export const DEFAULT_TIMING = {
  // Deepgram can go ~1.1s between updates mid-sentence (measured), so shorter cuts phrases in half.
  quietMS: 1200,
  resetMS: 2000,
  followUpMS: 8000,
  speculateMS: 400,  // a search query unchanged this long starts loading before the sentence ends
};

export class VoiceAgent {
  constructor({ deepgram, mic, tabs, agent, speaker, llm, config, settings, app = null, model = new IntentModel(), cache = new ReplyCache(),
    onChange = () => {}, timing = DEFAULT_TIMING }) {
    Object.assign(this, { deepgram, mic, tabs, agent, speaker, llm, config, settings, app, model, cache, onChange, timing });
    this.isListening = false;
    this.isStarting = false;
    this.isAwake = false;
    this.liveTranscript = '';
    this.statusLine = '';
    this.answer = null;           // latest {text, quote, source, grounded}
    this.session = new SessionContext();
    this.pendingSteps = [];       // waiting for "yes" after "So you want me to…?"
    this.awakeUntil = 0;
    this.actedThisUtterance = false;
    this.lastNavigatedSite = null;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.navigating = Promise.resolve();  // the latest navigation; anything reading the page awaits it
    this.plan = [];               // what was said → what Runic is doing, shown on screen right away
    this.streamStartedAt = Date.now();
    this.resetDispatchState();
    deepgram.onMessage((text) => this.handleMessage(text));
    deepgram.onClosed(() => this.handleClosed());
  }

  get requireWakeWord() { return this.settings?.requireWakeWord ?? true; }
  get voiceModels() { return [this.config.voiceModel, 'openai/gpt-oss-120b', this.config.agentModel].filter((m, i, a) => a.indexOf(m) === i); }

  set(fields) { Object.assign(this, fields); this.onChange(); }

  resetDispatchState() {
    clearTimeout(this.silenceTimer);
    this.dispatched = new Set();
    this.handled = new Set();
    this.taken = 0;  // clauses of the current text already routed
    this.lastTaken = null;
    clearTimeout(this.speculateTimer);
    this.speculated = null;
    this.pendingFinal = '';
    this.currentUtterance = '';
  }

  // ---- lifecycle ----

  async start() {
    if (this.isListening || this.isStarting) return;
    this.isStarting = true;
    try {
      this.resetDispatchState();
      const opened = await this.deepgram.open();
      if (!opened.ok) throw new Error(opened.error);
      this.streamStartedAt = Date.now();
      await this.mic.start((chunk) => this.deepgram.sendAudio(chunk));
      this.set({ isListening: true, statusLine: '' });
    } catch (err) {
      await this.deepgram.close();
      this.set({ statusLine: `Voice unavailable: ${err.message}` });
      throw err;
    } finally {
      this.isStarting = false;
    }
  }

  async stop() {
    this.isListening = false;
    this.mic.stop();
    clearTimeout(this.quietTimer); clearTimeout(this.silenceTimer);
    await this.deepgram.close();
    this.set({ liveTranscript: '', statusLine: '' });
  }

  async toggle() { return this.isListening ? this.stop() : this.start().catch(() => {}); }

  /** Unexpected disconnect: reconnect, since a hands-free user can't click to restart. */
  async handleClosed() {
    if (!this.isListening) return;
    this.set({ statusLine: 'Reconnecting...' });
    this.isListening = false;
    this.mic.stop();
    await new Promise((r) => setTimeout(r, 1000));
    await this.start().catch(() => {});
  }

  // ---- Deepgram messages ----

  handleMessage(raw) {
    let json;
    try { json = JSON.parse(raw); } catch { return; }

    if (json.type === 'TurnInfo') { this.handleTurn(json); return; }
    if (json.type === 'UtteranceEnd') { this.flushPendingFinal(); this.armReset(); return; }
    const transcript = json.channel?.alternatives?.[0]?.transcript;
    if (json.type !== 'Results' || !transcript?.trim()) return;

    // Runic is talking (or its own words are arriving late): that's its voice, not a command.
    const spokenAt = this.streamStartedAt + (json.start ?? 0) * 1000;
    if (this.speaker.isBusy() || this.speaker.wasSpeaking(spokenAt)) { this.pendingFinal = ''; return; }

    const heard = this.pendingFinal + transcript;
    this.set({ liveTranscript: heard });
    clearTimeout(this.silenceTimer);

    if (json.is_final) {
      // is_final only locks in a chunk; the user may still be mid-sentence ("add bean" | "burrito").
      this.pendingFinal += transcript + ' ';
      if (json.speech_final || json.from_finalize) { this.flushPendingFinal(); return; }
    } else {
      const command = this.commandText(heard);
      if (command != null) this.handleInterim(command);
    }
    this.armQuiet();
  }

  /** Flux: each update carries the whole turn so far (~4x a second); EndOfTurn closes the turn. */
  handleTurn(json) {
    const text = json.transcript?.trim() ?? '';
    const spokenAt = this.streamStartedAt + (json.audio_window_start ?? 0) * 1000;
    if (this.speaker.isBusy() || this.speaker.wasSpeaking(spokenAt)) return;  // Runic's own voice
    if (json.event === 'EndOfTurn') {
      this.pendingFinal = text;
      this.flushPendingFinal();
      this.armReset();
      return;
    }
    if (!text) return;
    this.set({ liveTranscript: text });
    clearTimeout(this.silenceTimer);
    const command = this.commandText(text);
    if (command != null) this.handleInterim(command);
  }

  /** Deepgram's own end-of-speech signals can lag by seconds in a noisy room; finish up ourselves. */
  armQuiet() {
    clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      if (!this.isListening) return;
      this.deepgram.control({ type: 'Finalize' });  // its reply (from_finalize) flushes what it held
      this.flushPendingFinal();
    }, this.timing.quietMS);
  }

  /** After a command, wait a moment of silence, then start fresh; open the follow-up window if we acted. */
  armReset() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (!this.isListening) return;
      this.resetDispatchState();
      if (this.actedThisUtterance) this.awakeUntil = Date.now() + this.timing.followUpMS;
      this.actedThisUtterance = false;
      this.set({ liveTranscript: '', statusLine: '', isAwake: false });
    }, this.timing.resetMS);
  }

  flushPendingFinal() {
    const text = this.pendingFinal.trim();
    this.pendingFinal = '';
    if (!text) return;
    this.armReset();
    const command = this.commandText(text);
    if (command == null) { console.info('[voice] Ignored (no wake word):', text); return; }
    this.currentUtterance = command;
    this.set({ answer: null });
    this.handleFinal(command);
    this.taken = 0;  // the next words start a new text
  }

  /** The part of `text` meant for Runic, or null if it wasn't addressed to Runic. */
  commandText(text) {
    if (!this.requireWakeWord) return text;
    const rest = afterWakeWord(text);
    if (rest != null) {
      this.isAwake = true;
      this.actedThisUtterance = true;
      this.onChange();
      return rest.trim() ? rest : null;
    }
    if (!this.isAwake && Date.now() >= this.awakeUntil) return null;
    this.isAwake = true;
    return text;
  }

  // ---- clauses: each one routed once, as soon as it's finished, done in the order spoken ----

  handleInterim(text) {
    if (isQuestion(text)) return;  // one question, not commands to act on early
    this.takeClauses(text, false);
  }

  isHandled(part) {
    if (this.handled.has(clauseKey(part))) return true;
    const m = part.match(NAVIGATE_PATTERN);
    const url = m && resolveURL(m[1]);
    return Boolean(url && this.dispatched.has(`navigate:${url}`));
  }

  /**
   * A clause is finished when another follows it ("... and"), it ends in the period Deepgram adds
   * once the sentence is over, or the utterance is final. Unambiguous ones go even sooner: a bare
   * "open <site>", or an exact in-page command of 2+ words ("scroll down", "play the first video").
   * Clauses are tracked by position, so Deepgram re-sending the same words never runs them twice.
   */
  takeClauses(text, isFinal) {
    const clauses = splitOnConjunctions(text);
    const last = clauses.length - 1;
    const trailingAnd = /\b(?:and|then|also)[\s,.;]*$/i.test(text);  // "search lofi and" → that search is done
    this.revise(clauses[this.taken - 1]);
    for (let i = this.taken; i < clauses.length; i++) {
      const clause = clauses[i];
      const finished = isFinal || i < last || trailingAnd || /[.?!]$/.test(clause) || directNavigationURL(clause)
        || (clause.trim().split(/\s+/).length >= 2 && this.rule(clause, this.plannedSite()));
      if (!finished) break;
      if (i === 0 && !this.pending) this.plan = [];  // a new sentence: fresh plan on screen
      this.taken = i + 1;
      this.lastTaken = { key: clauseKey(clause) };
      clearTimeout(this.speculateTimer);
      if (this.isHandled(clause)) continue;
      this.handled.add(clauseKey(clause));
      this.actedThisUtterance = true;
      this.route(clause, clauses.slice(0, i));
    }
    if (!isFinal && this.taken === last) this.speculate(clauses[last]);
  }

  /**
   * Flux puts a period on words it's still unsure of, then corrects them. If the clause just taken
   * changed: a search re-aims ("LoFi Beach." → "lo fi beats."); one that only went to the AI
   * ("open." → "open YouTube") is redone if the fix is now something instant. Done actions stay done.
   */
  revise(clause) {
    const t = this.lastTaken;
    if (!clause || !t || clauseKey(clause) === t.key) return;
    if (t.ai) {
      const site = this.plannedSite(), nav = clause.match(NAVIGATE_PATTERN);
      if (!(nav && resolveURL(nav[1])) && !parseSearch(clause, site) && !this.rule(clause, site)) return;
      t.ai.superseded = true;  // its late AI reply is dropped, and so is its line on screen
      this.plan = this.plan.filter((p) => p !== t.ai);
      t.key = clauseKey(clause);
      t.ai = null;
      this.handled.add(t.key);
      this.route(clause, []);
      return;
    }
    if (!t.search) return;
    const s = parseSearch(clause, this.plannedSite());
    if (!s || s.platform !== t.search.platform || s.query === t.search.query) return;
    const step = { action: 'search', target: s.platform, detail: s.query };
    Object.assign(t, { key: clauseKey(clause), search: s });
    t.item.label = friendlyStatus(step);
    this.handled.add(t.key);
    this.lastNavigatedSite = searchURL(s.platform, s.query);
    this.enqueue(() => this.dispatch(step, clause));
  }

  /**
   * "search for lofi be-" is still being said: start loading it anyway. Each new word re-aims it;
   * when the clause is finished and the query matches, the page is already loading (or there).
   */
  speculate(clause) {
    clearTimeout(this.speculateTimer);
    if (this.pending) return;  // never jump ahead of queued work
    const s = parseSearch(clause, this.plannedSite());
    if (!s) return;
    this.speculateTimer = setTimeout(() => {
      const url = searchURL(s.platform, s.query);
      if (url === this.speculated || this.pending) return;
      this.speculated = url;
      this.lastNavigatedSite = url;
      this.go(url);
    }, this.timing.speculateMS ?? 200);
  }

  /** Exact phrasing → instant action (in the page, or Runic's own controls). */
  rule(text, site) {
    const app = matchAppAction(text);
    if (app) return { label: app.label, run: () => { this.app?.[app.app]?.(); } };
    const m = matchSiteAction(text, site);
    if (m) return { label: m.label, run: async () => { await this.navigating; return runSiteAction(m, this.tabs); } };
    return null;
  }

  /** Decides how to do one clause right now and puts it on screen; the doing waits its turn. */
  route(clause, earlier) {
    if (isQuestion(clause)) return this.planItem(clause, 'Answering…', () => this.answerQuestion(clause));
    const site = this.plannedSite();
    const nav = clause.match(NAVIGATE_PATTERN);
    const url = nav && resolveURL(nav[1]);
    if (url) {
      this.dispatched.add(`navigate:${url}`);
      this.lastNavigatedSite = url;  // later clauses of this sentence happen there
      const step = { action: 'open', target: url, detail: nav[1].trim() };
      return this.planItem(clause, friendlyStatus(step), () => this.dispatch(step, clause));
    }
    const s = parseSearch(clause, site);
    if (s) {
      this.lastNavigatedSite = searchURL(s.platform, s.query);
      const step = { action: 'search', target: s.platform, detail: s.query };
      const item = this.planItem(clause, friendlyStatus(step), () => this.dispatch(step, clause));
      return Object.assign(this.lastTaken ?? {}, { search: s, item });
    }
    // Exact rule, else the on-device model's paraphrase match: no API call either way.
    const guess = this.model.predict(clause);
    const quick = this.rule(clause, site) ?? (guess && this.rule(say(guess.intent, clause), site));
    if (quick) return this.planItem(clause, quick.label, quick.run);
    // Said this here before: replay the AI's earlier answer.
    const known = this.cache.get(site, clause);
    if (known) return this.planItem(clause, known.map(friendlyStatus).join(', '), () => this.act({ steps: known }, clause));
    // Needs the AI: ask now, while earlier clauses are still running; act when its turn comes.
    const item = this.planItem(clause, `Understanding “${clause}”…`, async () => (item.superseded ? undefined : this.act(await reply, clause)));
    if (this.lastTaken) this.lastTaken.ai = item;
    const reply = this.ask(INTENT_PROMPT, clause, earlier).then((content) => {
      let parsed = null;
      try { parsed = JSON.parse(content); } catch { if (content != null) console.error('[voice] unreadable LLM reply', content); }
      const steps = parsed?.steps ?? [];
      item.label = steps.length ? steps.map(friendlyStatus).join(', ') : parsed?.question ? 'Answering…' : 'Nothing to do';
      this.onChange();
      if (steps.length && !parsed.confirm && !parsed.question) {
        this.cache.set(site, clause, steps);
        const intent = intentForSteps(steps);
        if (intent) this.model.learn(clause, intent);
      }
      return parsed;
    });
    return item;
  }

  /** A visible plan entry (queued → running → done/failed) whose work runs in spoken order. */
  planItem(said, label, work) {
    const item = { said, label, state: 'queued' };
    this.plan.push(item);
    this.onChange();
    this.enqueue(async () => {
      item.state = 'running';
      this.set({ statusLine: item.label });
      try {
        const result = await work();
        item.state = typeof result === 'string' && /^couldn't/i.test(result) ? 'failed' : 'done';
        if (typeof result === 'string') { item.label = result; this.set({ statusLine: result }); }
      } catch (err) {
        item.state = 'failed';
        throw err;
      } finally { this.onChange(); }
    });
    return item;
  }

  /** One queue for every action, so "open X and play the first video" never races. */
  enqueue(work) {
    this.pending++;
    this.queue = this.queue.then(work).catch((err) => console.error('[voice]', err)).finally(() => { this.pending--; });
    return this.queue;
  }

  /** Where the page will be when a new clause's turn comes: queued navigations count. */
  plannedSite() { return (this.pending || this.speculated) && this.lastNavigatedSite ? this.lastNavigatedSite : this.currentSiteURL(); }

  handleFinal(transcript) {
    if (this.pendingSteps.length) {
      const yes = yesOrNo(transcript);
      if (yes != null) {
        const steps = this.pendingSteps;
        this.pendingSteps = [];
        this.actedThisUtterance = true;
        if (yes) this.planItem(transcript, steps.map(friendlyStatus).join(', '), async () => { for (const s of steps) await this.dispatch(s, this.confirmedClause); });
        else { this.set({ statusLine: 'Okay, cancelled' }); this.speaker.say('Okay, cancelled.'); }
        return;
      }
      this.pendingSteps = [];  // anything else is a new command
    }
    // A whole-sentence question ("who made this and how many subs?") isn't split on "and".
    if (!this.taken && isQuestion(transcript)) {
      if (!this.pending) this.plan = [];
      this.planItem(transcript, 'Answering…', () => this.answerQuestion(transcript));
      return;
    }
    this.takeClauses(transcript, true);
  }

  async act(parsed, clause) {
    if (!parsed) return "Couldn't understand that";
    const steps = parsed.steps ?? [];
    if (parsed.question) await this.answerQuestion(parsed.question);
    if (parsed.confirm && steps.length) {
      // Risky: say back what we'd do and wait for "yes" (no wake word needed).
      this.pendingSteps = steps;
      this.confirmedClause = clause;
      this.set({ statusLine: parsed.confirm });
      this.speaker.say(parsed.confirm);
      return;
    }
    for (const step of steps) {
      const fp = stepFingerprint(step);
      if (this.dispatched.has(fp)) continue;
      this.dispatched.add(fp);
      await this.dispatch(step, clause);
    }
  }

  async ask(system, clause, earlier = []) {
    const before = earlier.length ? `\nEarlier in this same sentence (already being done; do NOT repeat them): "${earlier.join('", then "')}"` : '';
    const reply = await this.llm.json(system, `${this.buildContext()}${before}\n\nTranscript: "${clause}"`, this.voiceModels);
    if (reply == null && this.voiceModels.every((m) => this.llm.cooldowns.cooling(m))) {
      this.set({ statusLine: 'Groq rate limit: try again in a few seconds' });
    }
    return reply;
  }

  /** Answers from the current page and speaks it. Never navigates. */
  async answerQuestion(question) {
    if (!this.tabs.activeTab) { this.speaker.say('Open a page first, then ask me about it.'); return; }
    this.actedThisUtterance = true;
    this.set({ statusLine: 'Reading the page…' });
    await this.navigating;
    const a = await askPage(question, { tabs: this.tabs, llm: this.llm, models: ['openai/gpt-oss-120b', this.config.agentModel, 'openai/gpt-oss-20b'] });
    this.set({ answer: a, statusLine: '' });
    this.speaker.say(a.text);
  }

  buildContext() {
    const parts = [];
    if (this.lastNavigatedSite) {
      parts.push(`Current site: ${this.lastNavigatedSite}`);
      const title = this.tabs.activeTab?.title;
      if (title) parts.push(`Page title: ${title}`);
    } else parts.push('The user has not navigated anywhere yet.');
    const history = this.session.hydrate();
    if (history) parts.push(`Session history (previous commands and results):\n${history}`);
    if (this.lastNavigatedSite) {
      parts.push('If the user asks to find/search/look for something, they mean ON THE CURRENT SITE, not Google.');
      parts.push('If the user corrects a previous action (e.g. "no not that", "I want X not Y"), use the session history to understand what they\'re referring to and issue a corrected action.');
    }
    return parts.join('\n');
  }

  /** The site the user is on. Mid-navigation the tab still reports the old page, so trust where we sent it. */
  currentSiteURL() {
    const here = this.tabs.getCurrentURL();
    return this.tabs.isLoading() || here === 'about:blank' ? (this.lastNavigatedSite ?? here) : here;
  }

  // ---- dispatch ----

  /** Starts loading without waiting for it: the next step only waits if it needs the page. */
  go(url) {
    this.navigating = this.tabs.navigate(url).catch(() => {});
  }

  /** `said` is just this step's clause: the agent must never see (and redo) the rest of the sentence. */
  async dispatch(step, said = '') {
    this.actedThisUtterance = true;
    this.set({ statusLine: friendlyStatus(step) });
    if (!this.tabs.activeTab) this.tabs.createTab('about:blank');

    switch (step.action) {
      case 'open': {
        const want = resolveURL(step.target) ?? step.target;
        let same = false;
        try {  // the real tab, not where we plan to be: queued navigations haven't happened yet
          const w = new URL(want), h = new URL(this.tabs.getCurrentURL());
          same = w.pathname.length <= 1 && w.hostname.replace('www.', '') === h.hostname.replace('www.', '');
        } catch {}
        if (same) break;  // "open YouTube" while on YouTube used to reload the page
        this.lastNavigatedSite = want;
        this.go(want);
        break;
      }
      case 'search': {
        const t = step.target.toLowerCase();
        const platform = t === 'current site' || t === 'current page' ? platformFor(this.currentSiteURL()) : t;
        if (platform && hasSearchURL(platform)) {
          const url = searchURL(platform, step.detail);
          this.lastNavigatedSite = url;
          if (url !== this.speculated) this.go(url);  // else it's been loading since mid-sentence
          this.speculated = null;
        } else {
          await this.navigating;
          await this.tabs.waitUntilLoaded();
          await this.agent.enqueue(`Find the search bar or search input on this page and search for: ${step.detail}. Show the results and stop. Do NOT click into any result.`);
        }
        break;
      }
      case 'go_back':
        await this.navigating;
        await this.tabs.goBack();
        break;
      case 'type': case 'click': case 'scroll': case 'send': case 'create':
        await this.navigating;
        await this.tabs.waitUntilLoaded();
        await this.agent.enqueue(agentTask(step, said), 5);  // ponytail: one spoken step = a few moves; typed tasks keep 15
        break;
      default:
        console.warn('[voice] Unknown action', step.action);
    }
    this.session.record({ utterance: said || this.currentUtterance, ...step, pageTitle: this.tabs.activeTab?.title ?? '' });
  }
}
