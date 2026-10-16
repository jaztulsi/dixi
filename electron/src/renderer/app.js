// Wires the UI to the agents (port of ContentView.swift + the views).

import { icons } from './ui/icons.js';
import { TabManager } from './ui/tabs.js';
import { Mic } from './ui/mic.js';
import { Speaker } from './ui/speaker.js';
import { LLM } from './core/llm.js';
import { BrowserAgent } from './core/agent.js';
import { VoiceAgent } from './core/voice.js';
import { SiteCache } from './core/siteCache.js';
import { matchSiteAction, runSiteAction } from './core/siteActions.js';
import { isQuestion, directNavigationURL, looksLikeURL, parseSearch, searchURL } from './core/text.js';

const $ = (id) => document.getElementById(id);
const fillIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach((el) => { if (!el.firstChild || el.tagName === 'BUTTON') el.innerHTML = icons[el.dataset.icon] ?? ''; });
fillIcons();

const WAKE_KEY = 'runic.requireWakeWord';
const settings = {
  get requireWakeWord() { return localStorage.getItem(WAKE_KEY) !== 'false'; },
  set requireWakeWord(v) { localStorage.setItem(WAKE_KEY, String(v)); },
};

const config = await window.runic.config();
const llm = new LLM((body) => window.runic.groqChat(body), config);
const tabs = new TabManager($('tabs'), () => render());
const speaker = new Speaker();
const agent = new BrowserAgent({ tabs, llm, siteCache: new SiteCache(localStorage), onChange: () => render() });
const voice = new VoiceAgent({ deepgram: window.runic.deepgram, mic: new Mic(), tabs, agent, speaker, llm, config, settings, onChange: () => render() });

// ---- start page ----
function renderExamples() {
  const p = settings.requireWakeWord ? 'Runic, ' : '';
  $('start-sub').textContent = settings.requireWakeWord ? 'Start with “Runic”. No clicking needed.' : 'No clicking needed.';
  $('examples').innerHTML = [`${p}open YouTube and search for lofi beats`, `${p}go to Amazon and search for noise cancelling headphones`, `${p}click the second one`]
    .map((e) => `<li><span>${icons.quote}</span><span>“${e}”</span></li>`).join('');
}
renderExamples();

// ---- render (called on every state change) ----
let lastResult = null, toastTimer = null;
function render() {
  const hasTabs = tabs.visibleTabs.length > 0;
  $('start-page').hidden = hasTabs;
  $('back').hidden = agent.isRunning || !tabs.canGoBack();
  $('tab-count').hidden = !(tabs.visibleTabs.length > 1 && !agent.isRunning);
  $('tab-count').textContent = String(tabs.visibleTabs.indexOf(tabs.activeTab) + 1);
  const url = tabs.getCurrentURL();
  $('lock').hidden = agent.isRunning || !url.startsWith('https');
  $('bar-input').hidden = agent.isRunning;
  $('agent-status').hidden = !agent.isRunning;
  $('agent-status-text').textContent = agent.statusLine;
  const input = $('bar-input');
  if (document.activeElement !== input) input.placeholder = hasTabs && tabs.displayURL() ? tabs.displayURL() : 'Search or enter website name';
  $('send').hidden = agent.isRunning;
  $('stop').hidden = !agent.isRunning;
  $('mic').innerHTML = voice.isListening ? icons.micFill : icons.mic;
  $('mic').classList.toggle('listening', voice.isListening);
  $('mic').setAttribute('aria-pressed', String(voice.isListening));
  document.querySelectorAll('.tab-nav').forEach((el) => { el.hidden = tabs.visibleTabs.length < 2; });
  renderCaption();
  renderAgentSheet();

  if (agent.finalResult && agent.finalResult !== lastResult) {
    lastResult = agent.finalResult;
    $('toast-text').textContent = agent.finalResult;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
  }
}

function renderCaption() {
  const addressed = voice.isAwake || !settings.requireWakeWord;
  $('caption').classList.toggle('awake', voice.isAwake);
  $('caption-icon').innerHTML = voice.isListening ? icons.waveform : icons.micSlash;
  $('caption-state').textContent = !voice.isListening ? 'Voice off'
    : voice.isAwake ? 'Listening to you' : settings.requireWakeWord ? 'Say “Runic” + a command' : 'Listening';
  $('caption-spinner').hidden = !agent.isRunning;
  const t = $('caption-transcript');
  t.hidden = !voice.liveTranscript;
  t.textContent = voice.liveTranscript;
  t.classList.toggle('ignored', !addressed);

  const a = voice.answer;
  $('caption-answer').hidden = !a;
  if (a) {
    $('answer-text').textContent = a.text;
    const src = $('answer-source');
    src.className = `answer-source ${a.grounded ? 'ok' : 'unverified'}`;
    src.innerHTML = `${a.grounded ? icons.seal : icons.warning}<span></span>`;
    src.lastChild.textContent = a.grounded ? `From this page: ${a.source}` : 'Not confirmed on this page';
    $('answer-quote').hidden = !a.quote;
    $('answer-quote').textContent = a.quote ? `“${a.quote}”` : '';
  }
  const activity = agent.isRunning && agent.statusLine ? agent.statusLine : voice.statusLine;
  $('caption-activity').hidden = !activity;
  $('activity-text').textContent = activity;
}

const LOG_ICONS = { action: icons.play, success: icons.check, error: icons.xmark, thinking: icons.brain, info: icons.dot };
let renderedLog = 0;
function renderAgentSheet() {
  $('agent-dot').classList.toggle('running', agent.isRunning);
  $('agent-step').textContent = agent.isRunning ? `Step ${agent.currentStep}/${agent.maxSteps}` : '';
  $('agent-stop').hidden = !agent.isRunning;
  const log = $('agent-log');
  if (agent.log.length < renderedLog) { log.innerHTML = ''; renderedLog = 0; }
  for (const entry of agent.log.slice(renderedLog)) {
    const row = document.createElement('div');
    row.className = `log-row ${entry.kind}`;
    row.innerHTML = `<span class="k">${LOG_ICONS[entry.kind] ?? ''}</span><span></span>`;
    row.lastChild.textContent = entry.message;
    log.appendChild(row);
  }
  if (agent.log.length > renderedLog) log.scrollTop = log.scrollHeight;
  renderedLog = agent.log.length;
  $('agent-result').hidden = !agent.finalResult;
  $('agent-result-text').textContent = agent.finalResult ?? '';
}

// ---- typed commands (same order as the Swift handleSubmit) ----
async function submit(raw) {
  const text = raw.trim();
  if (!text || agent.isRunning) return;
  $('bar-input').value = '';
  $('bar-input').blur();

  const site = matchSiteAction(text, tabs.getCurrentURL());
  if (site && tabs.activeTab) { voice.set({ statusLine: site.label }); voice.set({ statusLine: await runSiteAction(site, tabs) }); return; }
  if (isQuestion(text) || text.endsWith('?')) { await voice.answerQuestion(text); return; }

  if (!tabs.activeTab) tabs.createTab('https://google.com');
  const search = parseSearch(text, tabs.getCurrentURL());
  if (search) return tabs.navigate(searchURL(search.platform, search.query));
  const direct = directNavigationURL(text);
  if (direct) return tabs.navigate(direct);
  if (looksLikeURL(text)) return tabs.navigate(text);
  return agent.start(text);
}

$('pill').addEventListener('submit', (e) => { e.preventDefault(); submit($('bar-input').value); });
$('send').addEventListener('click', () => submit($('bar-input').value));
$('stop').addEventListener('click', () => agent.stop());
$('agent-stop').addEventListener('click', () => agent.stop());
$('back').addEventListener('click', () => tabs.goBack());
$('mic').addEventListener('click', () => voice.toggle());
$('agent-status').addEventListener('click', () => $('agent-sheet').showModal());
$('toast-close').addEventListener('click', () => { $('toast').hidden = true; });

// ---- menu ----
const menu = $('menu');
$('more').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) menu.querySelector('button').focus(); });
document.addEventListener('click', () => { menu.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
menu.addEventListener('click', (e) => {
  const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
  if (!cmd) return;
  menu.hidden = true;
  if (cmd === 'agent') $('agent-sheet').showModal();
  if (cmd === 'settings') { renderSettings(); $('settings-sheet').showModal(); }
  if (cmd === 'new-tab') tabs.createTab('about:blank');
  if (cmd === 'open-external') window.runic.openExternal(tabs.getCurrentURL());
  if (cmd === 'next-tab') tabs.switchBy(1);
  if (cmd === 'prev-tab') tabs.switchBy(-1);
});
document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---- settings ----
function renderSettings() {
  $('wake-toggle').checked = settings.requireWakeWord;
  const key = (el, ok) => { el.className = ok ? 'key-ok' : 'key-missing'; el.textContent = ok ? '✓ Set' : '✕ Missing'; };
  key($('key-groq'), config.hasGroqKey);
  key($('key-deepgram'), config.hasDeepgramKey);
  $('agent-model').textContent = config.agentModel;
  $('voice-model').textContent = config.voiceModel;
}
$('wake-toggle').addEventListener('change', (e) => { settings.requireWakeWord = e.target.checked; renderExamples(); render(); });

// ---- runic:// deep links: focus or prefill only, never run a task ----
window.runic.onOpenURL((url) => {
  try {
    const u = new URL(url);
    const task = u.searchParams.get('task');
    if (u.hostname === 'run' && task) { $('bar-input').value = task.slice(0, 500); $('bar-input').focus(); }
  } catch {}
});

// Hands-free: start listening as soon as the app opens.
render();
if (config.hasDeepgramKey && config.hasGroqKey) voice.start().catch((err) => console.error('[voice]', err.message));

// For end-to-end tests and debugging.
window.__runic = { tabs, agent, voice, llm, submit, settings };
