// The voice agent (ported from VoiceAgent.swift). Always listening; acts on finished clauses while
// you're still talking. UI-free: Deepgram, mic, tabs, agent, speaker and llm are injected.

import {
  NAVIGATE_PATTERN, resolveURL, splitOnConjunctions, clauseKey, isQuestion, yesOrNo, afterWakeWord,
  parseSearch, searchURL, hasSearchURL, platformFor, stepFingerprint, friendlyStatus, agentTask,
} from './text.js';
import { matchSiteAction, runSiteAction } from './siteActions.js';
import { askPage } from './pageQA.js';
import { STABILITY_PROMPT, INTENT_PROMPT } from './prompts.js';

/** Rolling action history fed to each intent call, so "the other one" resolves. */
export class SessionContext {
  constructor(max = 20) { this.history = []; this.max = max; }
  record(r) { this.history.push(r); if (this.history.length > this.max) this.history.shift(); }
  hydrate() {
    return this.history.map((r, i) =>
      `[${i + 1}] User said: "${r.utterance}" → ${r.action} ${r.target} ${r.detail}${r.pageTitle ? ` (page: ${r.pageTitle})` : ''}`).join('\n');
  }
}

export const DEFAULT_TIMING = {
  stabilityMS: 300,
  // Deepgram can go ~1.1s between updates mid-sentence (measured), so shorter cuts phrases in half.
  quietMS: 1200,
  resetMS: 2000,
  followUpMS: 8000,
};

export class VoiceAgent {
  constructor({ deepgram, mic, tabs, agent, speaker, llm, config, settings, onChange = () => {}, timing = DEFAULT_TIMING }) {
    Object.assign(this, { deepgram, mic, tabs, agent, speaker, llm, config, settings, onChange, timing });
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
    this.siteActionChain = Promise.resolve();
    this.streamStartedAt = Date.now();
    this.resetDispatchState();
    deepgram.onMessage((text) => this.handleMessage(text));
    deepgram.onClosed(() => this.handleClosed());
  }

  get requireWakeWord() { return this.settings?.requireWakeWord ?? true; }
  get voiceModels() { return [this.config.voiceModel, 'openai/gpt-oss-120b', this.config.agentModel].filter((m, i, a) => a.indexOf(m) === i); }

  set(fields) { Object.assign(this, fields); this.onChange(); }

  resetDispatchState() {
    clearTimeout(this.stabilityTimer); clearTimeout(this.silenceTimer);
    this.dispatched = new Set();
    this.handled = new Set();
    this.lastInterim = '';
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
    clearTimeout(this.quietTimer); clearTimeout(this.stabilityTimer); clearTimeout(this.silenceTimer);
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
    clearTimeout(this.stabilityTimer);
    this.armReset();
    const command = this.commandText(text);
    if (command == null) { console.info('[voice] Ignored (no wake word):', text); return; }
    this.currentUtterance = command;
    this.set({ answer: null });
    this.handleFinal(command);
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

  // ---- interim: act early on finished clauses ----

  handleInterim(text) {
    if (isQuestion(text)) return;  // one question, not commands to act on early
    this.tryInstantNavigate(text);
    this.tryInstantSearch(text, false);
    if (text !== this.lastInterim) {
      this.lastInterim = text;
      clearTimeout(this.stabilityTimer);
      this.stabilityTimer = setTimeout(() => this.onInterimStable(text), this.timing.stabilityMS);
    }
  }

  isHandled(part) {
    if (this.handled.has(clauseKey(part))) return true;
    const m = part.match(NAVIGATE_PATTERN);
    const url = m && resolveURL(m[1]);
    return Boolean(url && this.dispatched.has(`navigate:${url}`));
  }

  tryInstantNavigate(text) {
    for (const part of splitOnConjunctions(text)) {
      const m = part.match(NAVIGATE_PATTERN);
      const url = m && resolveURL(m[1]);
      if (!url || this.dispatched.has(`navigate:${url}`)) continue;
      this.dispatched.add(`navigate:${url}`);
      this.handled.add(clauseKey(part));
      this.lastNavigatedSite = url;  // set now so follow-up clauses know where we are
      this.set({ statusLine: `Opening ${m[1].trim()}...` });
      this.dispatch({ action: 'open', target: url, detail: m[1].trim() });
    }
  }

  /** "search for lofi beats" on a known site → its search URL, no LLM. Only finished clauses on interim:
   *  followed by "and/then", or ending in the period Deepgram adds once it thinks the sentence is over. */
  tryInstantSearch(text, isFinal) {
    const clauses = splitOnConjunctions(text);
    clauses.forEach((clause, i) => {
      const finished = isFinal || i < clauses.length - 1 || /[.?!]$/.test(clause);
      if (!finished || this.isHandled(clause)) return;
      const s = parseSearch(clause, this.currentSiteURL());
      if (!s) return;
      this.handled.add(clauseKey(clause));
      const step = { action: 'search', target: s.platform, detail: s.query };
      const fp = stepFingerprint(step);
      if (this.dispatched.has(fp)) return;
      this.dispatched.add(fp);
      this.dispatch(step);
    });
  }

  async onInterimStable(text) {
    const unhandled = splitOnConjunctions(text).slice(0, -1).filter((p) => !this.isHandled(p));
    if (!unhandled.length) return;
    const joined = unhandled.join(' and ');
    const content = await this.ask(STABILITY_PROMPT, joined, 10);
    let parsed; try { parsed = JSON.parse(content); } catch { return; }
    unhandled.forEach((p) => this.handled.add(clauseKey(p)));
    for (const cmd of parsed?.commands ?? []) {
      if (!cmd.complete || !cmd.action) continue;
      const step = { action: cmd.action, target: cmd.target ?? '', detail: cmd.detail ?? '' };
      const fp = stepFingerprint(step);
      if (this.dispatched.has(fp)) continue;
      this.dispatched.add(fp);
      await this.dispatch(step);
    }
  }

  // ---- final: everything left ----

  handleFinal(transcript) {
    if (this.pendingSteps.length) {
      const yes = yesOrNo(transcript);
      if (yes != null) {
        const steps = this.pendingSteps;
        this.pendingSteps = [];
        this.actedThisUtterance = true;
        if (yes) { (async () => { for (const s of steps) await this.dispatch(s); })(); }
        else { this.set({ statusLine: 'Okay, cancelled' }); this.speaker.say('Okay, cancelled.'); }
        return;
      }
      this.pendingSteps = [];  // anything else is a new command
    }
    if (isQuestion(transcript)) { this.answerQuestion(transcript); return; }

    // Deepgram usually sends interim text first (where these already fired), but not always.
    this.tryInstantNavigate(transcript);
    this.tryInstantSearch(transcript, true);
    this.trySiteActions(transcript);
    const unhandled = splitOnConjunctions(transcript).filter((p) => !this.isHandled(p));
    if (!unhandled.length) return;
    this.detectFinalIntent(unhandled.join(' and '));
  }

  /** "play the first video", "skip the ad", "add it to my cart"... done directly in the page, in order. */
  trySiteActions(text) {
    for (const clause of splitOnConjunctions(text)) {
      if (this.isHandled(clause)) continue;
      const m = matchSiteAction(clause, this.currentSiteURL());
      if (!m) continue;
      this.handled.add(clauseKey(clause));
      this.actedThisUtterance = true;
      this.siteActionChain = this.siteActionChain.then(async () => {
        this.set({ statusLine: m.label });
        const result = await runSiteAction(m, this.tabs);
        this.set({ statusLine: result });
      });
    }
  }

  async detectFinalIntent(text) {
    const content = await this.ask(INTENT_PROMPT, text, 30);
    if (content == null) return;
    let parsed; try { parsed = JSON.parse(content); } catch { console.error('[voice] unreadable LLM reply', content); return; }
    const steps = parsed.steps ?? [];
    if (parsed.question) await this.answerQuestion(parsed.question);
    if (parsed.confirm && steps.length) {
      // Unclear or risky: say back what we'd do and wait for "yes" (no wake word needed).
      this.pendingSteps = steps;
      this.actedThisUtterance = true;
      this.set({ statusLine: parsed.confirm });
      this.speaker.say(parsed.confirm);
      return;
    }
    for (const step of steps) {
      const fp = stepFingerprint(step);
      if (this.dispatched.has(fp)) continue;
      this.dispatched.add(fp);
      await this.dispatch(step);
    }
  }

  async ask(system, transcript, timeoutS) {
    const reply = await this.llm.json(system, `${this.buildContext()}\n\nTranscript: "${transcript}"`, this.voiceModels);
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

  async dispatch(step) {
    this.actedThisUtterance = true;
    this.set({ statusLine: friendlyStatus(step) });
    if (!this.tabs.activeTab) this.tabs.createTab('about:blank');

    switch (step.action) {
      case 'open': {
        const want = resolveURL(step.target) ?? step.target;
        let same = false;
        try {
          const w = new URL(want), h = new URL(this.currentSiteURL());
          same = w.pathname.length <= 1 && w.hostname.replace('www.', '') === h.hostname.replace('www.', '');
        } catch {}
        if (same) break;  // "open YouTube" while on YouTube used to reload the page
        this.lastNavigatedSite = want;
        await this.tabs.navigate(want);
        break;
      }
      case 'search': {
        const t = step.target.toLowerCase();
        const platform = t === 'current site' || t === 'current page' ? platformFor(this.currentSiteURL()) : t;
        if (platform && hasSearchURL(platform)) {
          const url = searchURL(platform, step.detail);
          this.lastNavigatedSite = url;
          await this.tabs.navigate(url);
        } else {
          await this.tabs.waitUntilLoaded();
          await this.agent.enqueue(`Find the search bar or search input on this page and search for: ${step.detail}. Show the results and stop. Do NOT click into any result.`);
        }
        break;
      }
      case 'go_back':
        await this.tabs.goBack();
        break;
      case 'type': case 'click': case 'scroll': case 'send': case 'create':
        await this.tabs.waitUntilLoaded();
        await this.agent.enqueue(agentTask(step, this.currentUtterance));
        break;
      default:
        console.warn('[voice] Unknown action', step.action);
    }
    this.session.record({ utterance: this.currentUtterance || this.liveTranscript, ...step, pageTitle: this.tabs.activeTab?.title ?? '' });
  }
}
