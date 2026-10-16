import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAgent, compactElementList } from '../../src/renderer/core/agent.js';
import { VoiceAgent } from '../../src/renderer/core/voice.js';
import { askPage, quoteIsOnPage } from '../../src/renderer/core/pageQA.js';
import { SiteCache } from '../../src/renderer/core/siteCache.js';

const config = { agentModel: 'qwen/qwen3.8-27b', voiceModel: 'openai/gpt-oss-20b' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeTabs(url = 'https://www.youtube.com/') {
  const t = {
    url, navigations: [], js: [], activeTab: { title: 'YouTube' }, loading: false,
    getCurrentURL: () => t.url, getTitle: async () => 'YouTube', tabList: () => '[0] YouTube', isLoading: () => t.loading,
    extractElements: async () => [{ tag: 'a', text: 'Video one', index: 0, id: '', href: '', placeholder: '' }],
    navigate: async (u) => { t.navigations.push(u); t.url = u; }, waitUntilLoaded: async () => {}, goBack: async () => {},
    click: async () => {}, type: async () => {}, scroll: async () => {}, screenshot: async () => null,
    executeJS: async (code) => { t.js.push(code); return 'ok: done'; }, createTab: () => {},
  };
  return t;
}
const toolCall = (name, args, id = 'c1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('agent: runs tools until done', async () => {
  const replies = [{ tool_calls: [toolCall('click', { elementIndex: 0 })] }, { tool_calls: [toolCall('done', { result: 'Opened it' })] }];
  const llm = { chat: async () => replies.shift() };
  const agent = new BrowserAgent({ tabs: fakeTabs(), llm });
  await agent.start('open the video');
  assert.equal(agent.finalResult, 'Opened it');
  assert.equal(agent.isRunning, false);
});

test('agent: stops after the same move 3 times with no effect', async () => {
  let calls = 0;
  const llm = { chat: async () => { calls++; return { tool_calls: [toolCall('click', { elementIndex: 0 })] }; } };
  const agent = new BrowserAgent({ tabs: fakeTabs(), llm });
  await agent.start('click it');
  assert.equal(calls, 3);
  assert.match(agent.finalResult, /couldn't get that to work/);
});

test('agent: queue runs spoken tasks in order', async () => {
  const order = [];
  const llm = { chat: async (m) => { order.push(m[0].content.match(/Task: (\w+)/)[1]); return { tool_calls: [toolCall('done', { result: 'ok' })] }; } };
  const agent = new BrowserAgent({ tabs: fakeTabs(), llm });
  await Promise.all([agent.enqueue('first'), agent.enqueue('second')]);
  assert.deepEqual(order, ['first', 'second']);
});

test('element list is capped', () => {
  const els = Array.from({ length: 60 }, (_, i) => ({ tag: 'a', text: 'x'.repeat(80), index: i }));
  const out = compactElementList(els);
  assert.equal(out.split('\n').length, 51);
  assert.match(out, /10 more below/);
});

test('page QA: quote must be on the page', async () => {
  assert.equal(quoteIsOnPage('15.8M  subscribers', 'Lofi Girl\n15.8M subscribers'), true);
  assert.equal(quoteIsOnPage('20M subscribers', 'Lofi Girl\n15.8M subscribers'), false);
  const tabs = { getTitle: async () => 'lofi', getCurrentURL: () => 'u', executeJS: async () => 'TITLE: lofi\n\nLofi Girl\n15.8M subscribers\nmore text here to pass the length check' };
  const good = { json: async () => JSON.stringify({ answer: 'Lofi Girl, 15.8M subscribers.', quote: '15.8M subscribers', found: true }) };
  assert.equal((await askPage('who?', { tabs, llm: good, models: [] })).grounded, true);
  const made = { json: async () => JSON.stringify({ answer: 'They have 20M.', quote: '20M subscribers', found: true }) };
  const a = await askPage('who?', { tabs, llm: made, models: [] });
  assert.equal(a.grounded, false);
  assert.match(a.text, /couldn't verify/);
});

function voiceRig({ intent = '{"steps":[]}', wake = true } = {}) {
  let onMessage;
  const deepgram = { open: async () => ({ ok: true }), sendAudio() {}, control() {}, close: async () => {}, onMessage: (f) => { onMessage = f; }, onClosed() {} };
  const tabs = fakeTabs();
  const spoken = [];
  const speaker = { isBusy: () => false, wasSpeaking: () => false, say: (t) => spoken.push(t) };
  const enqueued = [];
  const agent = { enqueue: async (t) => enqueued.push(t) };
  const llmCalls = [];
  const llm = { cooldowns: { cooling: () => false }, json: async (system, user) => { llmCalls.push(user); return intent; } };
  const voice = new VoiceAgent({ deepgram, mic: { start: async () => {}, stop() {} }, tabs, agent, speaker, llm, config,
    settings: { requireWakeWord: wake }, timing: { stabilityMS: 5, quietMS: 30, resetMS: 30, followUpMS: 200 } });
  const say = (transcript, { final = true, start = 0 } = {}) =>
    onMessage(JSON.stringify({ type: 'Results', start, is_final: final, speech_final: final, channel: { alternatives: [{ transcript }] } }));
  return { voice, tabs, spoken, enqueued, llmCalls, say };
}

test('voice: no wake word → ignored, no AI call', async () => {
  const r = voiceRig();
  await r.voice.start();
  r.say('this is working pretty well');
  await sleep(20);
  assert.equal(r.llmCalls.length, 0);
  assert.deepEqual(r.tabs.navigations, []);
});

test('voice: opens a site while you are still talking (interim)', async () => {
  const r = voiceRig();
  await r.voice.start();
  r.say('Runic, open Amazon and', { final: false });
  await sleep(5);
  assert.deepEqual(r.tabs.navigations, ['https://www.amazon.com']);
});

test('voice: instant search + site action, no AI call', async () => {
  const r = voiceRig();
  await r.voice.start();
  r.say('Runic, search for lofi beats and play the first video');
  await sleep(450);
  assert.deepEqual(r.tabs.navigations, ['https://www.youtube.com/results?search_query=lofi%20beats']);
  assert.equal(r.tabs.js.length, 1, 'site action ran in the page');
  assert.equal(r.llmCalls.length, 0);
});

test('voice: many commands in one breath run in order; the AI sees only its own clause', async () => {
  const r = voiceRig({ wake: false, intent: JSON.stringify({ steps: [{ action: 'click', target: 'Videos filter', detail: '' }] }) });
  r.tabs.url = 'about:blank';
  await r.voice.start();
  r.say('open youtube search lofi and click the videos filter and play the first video');
  await sleep(900);
  assert.deepEqual(r.tabs.navigations, ['https://www.youtube.com', 'https://www.youtube.com/results?search_query=lofi']);
  assert.equal(r.llmCalls.length, 1, 'only the clause no rule covers goes to the AI');
  assert.match(r.llmCalls[0], /Transcript: "click the videos filter"/);
  assert.deepEqual(r.enqueued, ['Click Videos filter. (The user said: "click the videos filter")']);
  assert.equal(r.tabs.js.length, 1, 'first video played in the page, after the click');
});

test('voice: Deepgram revising the last search ("lofi beat." → "lofi beats.") re-aims it', async () => {
  const r = voiceRig({ wake: false });
  await r.voice.start();
  r.say('search lofi beat.', { final: false });
  await sleep(20);
  r.say('search lofi beats.');
  await sleep(20);
  assert.equal(r.tabs.navigations.at(-1), 'https://www.youtube.com/results?search_query=lofi%20beats');
  assert.equal(r.voice.plan.length, 1, 'one command on screen, relabelled');
  assert.match(r.voice.plan[0].label, /lofi beats/);
});

test('voice: a premature "open." that Flux corrects to "open YouTube" still opens YouTube', async () => {
  const r = voiceRig({ wake: false });
  r.tabs.url = 'about:blank';
  await r.voice.start();
  r.say('open.', { final: false });          // Flux's early guess, period and all → went to the AI
  await sleep(20);
  r.say('open YouTube and', { final: false });
  await sleep(20);
  assert.deepEqual(r.tabs.navigations, ['https://www.youtube.com']);
  assert.deepEqual(r.voice.plan.map((p) => p.label), ['Opening YouTube'], 'the premature line is gone');
});

test('voice: unclear request asks back and waits for yes', async () => {
  const r = voiceRig({ intent: JSON.stringify({ steps: [{ action: 'click', target: 'Buy now', detail: '' }], confirm: 'So you want me to buy it?' }) });
  await r.voice.start();
  r.say('Runic, get me that thing');
  await sleep(20);
  assert.deepEqual(r.spoken, ['So you want me to buy it?']);
  assert.equal(r.enqueued.length, 0, 'nothing happens before yes');
  r.say('yes');
  await sleep(20);
  assert.equal(r.enqueued.length, 1);
  assert.match(r.enqueued[0], /Click Buy now/);
});

test('voice: follow-up within the window needs no wake word, then expires', async () => {
  const r = voiceRig();
  await r.voice.start();
  r.say('Runic, go to Amazon');
  await sleep(80);                       // utterance reset opens the follow-up window
  r.say('search for burrito bowls');
  await sleep(80);
  assert.equal(r.tabs.navigations.at(-1), 'https://www.amazon.com/s?k=burrito%20bowls');
  await sleep(300);                      // window over
  r.say('search for tacos');
  await sleep(40);
  assert.equal(r.tabs.navigations.at(-1), 'https://www.amazon.com/s?k=burrito%20bowls');
});

test('voice: Runic does not act on its own voice', async () => {
  const r = voiceRig({ wake: false });
  r.voice.speaker.wasSpeaking = () => true;
  await r.voice.start();
  r.say('they have 15.8 million subscribers');
  await sleep(20);
  assert.equal(r.llmCalls.length, 0);
});

test('site cache remembers where tasks went', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const c = new SiteCache(storage);
  c.recordVisit('search amazon for keyboards', 'https://www.amazon.com/');
  assert.equal(new SiteCache(storage).directURL('amazon headphones'), 'https://www.amazon.com/');
  assert.equal(c.directURL('nothing related'), null);
});
