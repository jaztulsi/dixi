import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceAgent, afterWakeWord, splitClauses, isEcho } from '../../src/renderer/core/voice.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rig({ reply = null, wake = false } = {}) {
  const runs = [], asked = [], spoken = [];
  const llmCalls = [];
  const llm = { json: async (_s, user, _m, _t, { signal } = {}) => { llmCalls.push(user); await sleep(30); if (signal?.aborted) return null; return reply ?? JSON.stringify({ clarify: '', steps: [{ act: 'open', said: 'Zentora', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '' }] }); } };
  const tabs = { getCurrentURL: () => 'about:blank', activeTab: null, visibleTabs: [], tabList: () => '', dx: async () => '' };
  const executor = { run: async (s) => { runs.push(s); await sleep(10); return { ok: true, message: `did ${s.act}` }; } };
  const v = new VoiceAgent({ deepgram: null, tabs, llm, tiers: { fast: ['m'], strong: [] }, executor, settings: { requireWakeWord: wake }, speaker: { say: (t) => spoken.push(t), isBusy: () => false, stop() {} } });
  const turn = (i, events) => { for (const [event, transcript] of events) v.handleMessage(JSON.stringify({ type: 'TurnInfo', event, turn_index: i, transcript })); };
  return { v, runs, asked, spoken, llmCalls, turn };
}

test('one turn → one execution, however many end-of-turn signals arrive', async () => {
  const r = rig();
  r.turn(1, [['StartOfTurn', ''], ['Update', 'open Zentora'], ['EagerEndOfTurn', 'Open Zentora.'], ['EndOfTurn', 'Open Zentora.'], ['EndOfTurn', 'Open Zentora.']]);
  await sleep(150);
  assert.equal(r.runs.length, 1);
  assert.equal(r.llmCalls.length, 1, 'the early (eager) understanding was reused, not redone');
});

test('TurnResumed aborts the early understanding; the final words are used', async () => {
  const r = rig();
  r.turn(1, [['Update', 'open'], ['EagerEndOfTurn', 'Open.'], ['TurnResumed', 'Open'], ['Update', 'open Zentora'], ['EndOfTurn', 'Open Zentora.']]);
  await sleep(150);
  assert.equal(r.runs.length, 1);
  assert.match(r.llmCalls.at(-1), /Open Zentora/);
});

test('nothing acts before the end of the turn (partial words never trigger an action)', async () => {
  const r = rig();
  r.turn(1, [['Update', 'open up'], ['Update', 'open up Zentora'], ['Update', 'open up Zentora Classroom']]);
  await sleep(100);
  assert.equal(r.runs.length, 0);
});

test('wake word: only at the start of what was said', () => {
  assert.equal(afterWakeWord('Dixi, open Zentora'), 'open Zentora');
  assert.equal(afterWakeWord('hey Dixie open Zentora'), 'open Zentora');
  assert.equal(afterWakeWord('I was telling Dixie about Zentora yesterday'), null);
});

test('casual mention of the wake word mid-sentence does nothing', async () => {
  const r = rig({ wake: true });
  r.turn(1, [['Update', 'I was telling Dixie about Zentora'], ['EndOfTurn', 'I was telling Dixie about Zentora yesterday.']]);
  await sleep(80);
  assert.equal(r.runs.length, 0);
  assert.equal(r.llmCalls.length, 0);
});

test('"stop" cancels queued steps at once (barge-in mid-task)', async () => {
  const r = rig({ reply: JSON.stringify({ clarify: '', steps: [1, 2, 3].map(() => ({ act: 'scroll', said: '', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: 'down' })) }) });
  r.v.executor.run = async (s) => { r.runs.push(s); await sleep(60); return { ok: true, message: 'ok' }; };
  r.v.handleText('scroll down three times');
  await sleep(90);
  r.turn(2, [['Update', 'stop']]);
  await sleep(200);
  assert.ok(r.runs.length < 3, `ran ${r.runs.length}`);
  assert.ok(!r.v.plan.some((p) => p.state === 'queued' || p.state === 'running'), 'nothing left waiting');
});

test('a clarifying question captures the next answer (by ordinal or name)', async () => {
  const r = rig();
  const answer = r.v.ask('Which one: Bykkar Music or EJ Music?', ['Bykkar Music', 'EJ Music']);
  r.v.handleText('the second one');
  assert.equal(await answer, 'EJ Music');
  const yes = r.v.confirmAction('Should I press “Place order”?');
  r.v.handleText('yes');
  assert.equal(await yes, true);
  const no = r.v.confirmAction('Should I press “Pay”?');
  r.v.handleText('no');
  assert.equal(await no, false);
});

test('a question asked mid-sentence is answered by what is said next, not by the end of that sentence', async () => {
  const r = rig();
  r.turn(1, [['Update', 'I want an iPad']]);
  const answer = r.v.ask('Which iPad: iPad 11, iPad Air, iPad Mini or iPad Pro?', ['iPad 11', 'iPad Air', 'iPad Mini', 'iPad Pro']);
  r.turn(1, [['EndOfTurn', 'I want an iPad.']]);
  r.turn(2, [['EndOfTurn', 'The iPad Air.']]);
  assert.equal(await answer, 'iPad Air');
});

test('half-heard buying words are never bought; the final words are', async () => {
  const r = rig();
  r.turn(1, [['Update', 'buy me an iPhone 17e']]);
  await sleep(800);
  assert.equal(r.runs.length, 0, 'a pause mid-purchase does nothing');
  r.turn(1, [['Update', 'buy me an iPhone 17 in black with 256 gigabytes'], ['EndOfTurn', 'Buy me an iPhone 17 in black with 256 gigabytes.']]);
  await sleep(150);
  assert.deepEqual(r.runs.map((s) => s.item), ['iPhone 17 in black with 256 gigabytes']);
});

test('the final words, written differently, never repeat what was already done', async () => {
  const r = rig();
  r.turn(1, [['Update', 'buy me an iPhone 18 with 256 gigabytes and AirPods']]);
  await sleep(450);
  r.turn(1, [['EndOfTurn', 'Buy me an iPhone eighteen, 256 GB, and AirPods.']]);
  await sleep(150);
  assert.deepEqual(r.runs.map((s) => s.item), ['iPhone 18 Pro in black with 256 gigabytes', 'AirPods Pro']);
});

test('a failed step stops the rest quietly (no spoken error); failed parses are not cached', async () => {
  const cache = new Map();
  const r = rig();
  r.v.cache = { get: (k) => cache.get(k) ?? null, set: (k, v) => cache.set(k, v) };
  r.v.executor.run = async () => ({ ok: false, message: 'I couldn’t find a site called “Zentora”' });
  await r.v.handleText('open Zentora');
  assert.equal(r.v.plan[0].state, 'failed');
  assert.deepEqual(r.spoken, [], 'failures are not spoken');
  assert.equal(cache.size, 0);
});

test('acts while you speak: a finished clause runs before the sentence ends', async () => {
  const r = rig({ reply: null });
  r.v.llm.json = async (_s, user) => { r.llmCalls.push(user); await sleep(20); const said = user.match(/Said: "(.*)"/)[1];
    const step = /search/.test(said) ? { act: 'search', said: '', query: 'lamps' } : { act: 'open', said: 'Zentora' };
    return JSON.stringify({ clarify: '', steps: [{ guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '', ...step }] }); };
  const words = 'go to Zentora and search for lamps'.split(' ');
  for (let i = 1; i <= words.length; i++) { r.turn(1, [['Update', words.slice(0, i).join(' ')]]); await sleep(40); }
  assert.equal(r.runs[0]?.act, 'open', 'opened while still talking');
  r.turn(1, [['EndOfTurn', 'Go to Zentora and search for lamps.']]);
  await sleep(150);
  assert.deepEqual(r.runs.map((s) => s.act), ['open', 'search'], 'each clause once, in order');
});

test('clauses split only where a new command starts', () => {
  assert.deepEqual(splitClauses('go to Zentora and search for lamps'), ['go to Zentora', 'search for lamps']);
  assert.deepEqual(splitClauses('search for salt and pepper'), ['search for salt and pepper']);
  assert.deepEqual(splitClauses('open Zentora, then play the first one'), ['open Zentora', 'play the first one']);
});

test('wake word by sound, at the start or after a sentence break; alone it opens a listening window', async () => {
  assert.equal(afterWakeWord('Headaches, open Zentora'), 'open Zentora');
  assert.equal(afterWakeWord('Hey Dixie open Zentora'), 'open Zentora');
  assert.equal(afterWakeWord('So anyway, yeah. Hey, Dixi. Open Zentora'), 'Open Zentora');
  assert.equal(afterWakeWord('I was telling Dixie about Zentora'), null);
  const r = rig({ wake: true });
  r.turn(1, [['Update', 'So anyway yeah. Hey, Dixi.'], ['EndOfTurn', 'So anyway yeah. Hey, Dixi.']]);
  r.turn(2, [['Update', 'open Zentora'], ['EndOfTurn', 'Open Zentora.']]);
  await sleep(150);
  assert.equal(r.runs.length, 1, 'the command after "Hey Dixi" alone was heard');
});

test('understanding starts at a short pause and is reused when the turn ends (one model call)', async () => {
  const r = rig();
  r.turn(1, [['Update', 'open Zentora']]);
  await sleep(380);
  assert.equal(r.llmCalls.length, 1, 'started early');
  assert.equal(r.runs.length, 0, 'but nothing done yet');
  r.turn(1, [['EndOfTurn', 'Open Zentora.']]);
  await sleep(120);
  assert.equal(r.runs.length, 1);
  assert.equal(r.llmCalls.length, 1, 'the early understanding was used');
});

test('talking over Dixi: its own words are an echo, a new command is not', () => {
  assert.equal(isEcho('added it to your car at Zentora', 'Added it to your cart at Zentora'), true);
  assert.equal(isEcho('added it', 'Added it to your cart at Zentora'), true);
  assert.equal(isEcho('go to my cart', 'Added it to your cart at Zentora'), false);
  assert.equal(isEcho('search for lamps on Bykkar', 'Added it to your cart at Zentora'), false);
});

test('a turn cut off mid-sentence is finished by the next one; a whole question ending on "about" is answered', async () => {
  const r = rig({ reply: JSON.stringify({ clarify: '', steps: [{ act: 'ask_page', said: '', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '' }] }) });
  r.turn(1, [['Update', 'Can you tell me the features of, uh'], ['EndOfTurn', 'Can you tell me the features of, uh,']]);
  await sleep(60);
  assert.equal(r.runs.length, 0, 'held: the sentence is not finished');
  r.turn(2, [['Update', 'the Zentora Pro'], ['EndOfTurn', 'the Zentora Pro.']]);
  await sleep(120);
  assert.equal(r.runs.length, 1);
  assert.match(r.runs[0].value ?? '', /features of, uh,? the Zentora Pro/i);
  r.turn(3, [['Update', 'what is this video about'], ['EndOfTurn', 'What is this video about?']]);
  await sleep(120);
  assert.equal(r.runs.length, 2);
});

test('a site never used before waits for its whole name ("Maya" is not "Maya Indian Kitchen")', async () => {
  const r = rig({ reply: JSON.stringify({ clarify: '', steps: [{ act: 'open', said: 'Maya Indian Kitchen', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '' }] }) });
  r.turn(1, [['Update', 'take me to Maya']]);
  await sleep(800);
  assert.equal(r.runs.length, 0, 'not opened on the first word of the name');
  r.turn(1, [['Update', 'take me to Maya Indian Kitchen'], ['EndOfTurn', 'Take me to Maya Indian Kitchen.']]);
  await sleep(150);
  assert.equal(r.runs.length, 1);
});
