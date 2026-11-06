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
  const v = new VoiceAgent({ deepgram: null, tabs, llm, tiers: { fast: ['m'], strong: [] }, executor, settings: { requireWakeWord: wake }, speaker: { say: (t) => spoken.push(t), isBusy: () => false, stop() {} }, holdMS: 0 });   // the end-of-turn wait: endpoint.test.js
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
  // Everyday words that share Dixi's consonants never wake it (they used to).
  for (const t of ['Headaches, open Zentora', 'Ducks, open Zentora', 'The decks are wet', 'Docks open at nine']) assert.equal(afterWakeWord(t), null, t);
  assert.equal(afterWakeWord('Dixie, open Zentora'), 'open Zentora');
  assert.equal(afterWakeWord('Hey Dixie open Zentora'), 'open Zentora');
  assert.equal(afterWakeWord('So anyway, yeah. Hey, Dixi. Open Zentora'), 'Open Zentora');
  assert.equal(afterWakeWord('I was telling Dixie about Zentora'), null);
  const r = rig({ wake: true });
  r.turn(1, [['Update', 'So anyway yeah. Hey, Dixi.'], ['EndOfTurn', 'So anyway yeah. Hey, Dixi.']]);
  r.turn(2, [['Update', 'open Zentora'], ['EndOfTurn', 'Open Zentora.']]);
  await sleep(150);
  assert.equal(r.runs.length, 1, 'the command after "Hey Dixi" alone was heard');
});

test('after a command, the next words without "Dixi" are not a command', async () => {
  const r = rig({ wake: true });
  r.turn(1, [['Update', 'Dixi open Zentora'], ['EndOfTurn', 'Dixi, open Zentora.']]);
  await sleep(150);
  r.turn(2, [['Update', 'open Kestrel'], ['EndOfTurn', 'Open Kestrel.']]);
  await sleep(150);
  assert.equal(r.runs.length, 1, 'only the request that started with Dixi ran');
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

test('mic paused while it is still connecting stays paused (no live mic after stop)', async () => {
  let micOn = false, closed = 0;
  const deepgram = { open: () => sleep(30).then(() => ({ ok: true })), close: async () => { closed++; }, sendAudio() {}, onMessage() {}, onClosed() {} };
  const mic = { start: async () => { micOn = true; }, stop: () => { micOn = false; } };
  const v = new VoiceAgent({ deepgram, mic, tabs: {}, llm: {}, tiers: {}, executor: {}, settings: {} });
  const starting = v.start();
  await v.stop();
  await starting;
  assert.equal(v.isListening, false);
  assert.equal(micOn, false);
  assert.ok(closed >= 1);
});

test('a new command while "which one?" is open is not read as an answer ("make the iPhone two" ≠ the second one)', async () => {
  const r = rig({ reply: JSON.stringify({ clarify: '', steps: [{ act: 'quantity', said: '', guess: '', urls: [], query: '', item: 'iPhone', qty: 2, n: 0, value: 'set' }] }) });
  const answer = r.v.ask('Which one: AirPods 5 or AirPods Pro 3?', ['AirPods 5', 'AirPods Pro 3']);
  r.v.handleText('make the iPhone two and then check out');
  assert.equal(await answer, null);
  await sleep(100);
  assert.equal(r.runs[0]?.act, 'quantity', 'the sentence ran as its own command');
  for (const [said, want] of [['two', 'AirPods Pro 3'], ['um the first one please', 'AirPods 5'], ['number 2', 'AirPods Pro 3'], ['the Pro 3', 'AirPods Pro 3']]) {
    const a = r.v.ask('Which one: AirPods 5 or AirPods Pro 3?', ['AirPods 5', 'AirPods Pro 3']);
    r.v.handleText(said);
    assert.equal(await a, want, said);
  }
});

test('"stop and listen": nothing runs until "go", then it all goes as one request (to Everywhere when it wants it)', async () => {
  const r = rig({ wake: true });
  const sent = [];
  r.turn(1, [['Update', 'Dixi stop'], ['Update', 'Dixi stop and listen'], ['EndOfTurn', 'Dixi, stop and listen.']]);
  assert.ok(r.v.dictation, 'the "stop" being said did not end the turn');
  r.turn(2, [['Update', 'open Zentora'], ['EndOfTurn', 'Open Zentora and find the history homework.']]);
  r.turn(3, [['EndOfTurn', 'It is due Friday.']]);
  await sleep(80);
  assert.equal(r.runs.length, 0, 'nothing done while listening');
  r.turn(4, [['EndOfTurn', "That's it."]]);
  await sleep(150);
  assert.equal(r.v.dictation, null);
  assert.equal(r.runs.length, 1);
  assert.match(r.llmCalls.at(-1), /Open Zentora and find the history homework\. It is due Friday\./);
  // With Everywhere wanting it, the whole request goes there instead.
  r.v.everywhere = { wants: () => true, transcript() {}, run: (t) => sent.push(t), stop() {} };
  r.turn(5, [['EndOfTurn', 'Dixi, let me explain.']]);
  r.turn(6, [['EndOfTurn', 'Reply to this email and say thanks. Go.']]);
  assert.deepEqual(sent, ['Reply to this email and say thanks']);
});

test('talking about Dixi is not talking to Dixi; a protest stops it', async () => {
  assert.equal(afterWakeWord('Dixi browser, just save them in a separate file'), null);
  assert.equal(afterWakeWord('Dixi is getting activated when I never say it'), null);
  assert.equal(afterWakeWord('So. Dixi keeps pressing the wrong area'), null);
  assert.equal(afterWakeWord('Dixi, is it raining?'), 'is it raining?');
  assert.equal(afterWakeWord('Hey Dixi is it raining'), 'is it raining');
  assert.equal(afterWakeWord('Dixi open Safari'), 'open Safari');
  const r = rig({ wake: true });
  let stops = 0;
  r.v.everywhere = { wants: () => true, transcript() {}, run: () => { throw new Error('a protest must never run'); }, stop: () => { stops++; } };
  r.v.awakeUntil = Date.now() + 10000;   // as if just woken
  r.turn(1, [['EndOfTurn', 'No. No. Not not that. Not that. Oh my god. Why did Dixi activate now?']]);
  assert.equal(stops, 1);
});

test('chatter is not for Dixi (a real log: each of these went to the screen agent): nothing runs, nothing stops', async () => {
  const { chatter } = await import('../../src/renderer/core/everywhere-words.js');
  for (const t of ['Dude,', 'Hay Dixi.', 'Come on, Dixi. You got this. Wait. Come on, Dixi. You got this. You go', 'Wait. Shoot. Uh, frost... no. Chest ball. Oh, what was that? Yeah. Yea', "It's gone. I'm done.", 'okay', 'thanks']) assert.ok(chatter(t), t);
  for (const t of ['okay open Notes', 'yes, do it', 'well, open Safari', "I got a five out of thirty two. What's my grade?", 'who is the founder of this website.', 'oh, what was that?', 'play lo-fi beats', 'I would like to open Notes']) assert.ok(!chatter(t), t);
  const r = rig({ wake: true });
  let runs = 0, stops = 0;
  r.v.everywhere = { wants: () => true, transcript() {}, run: () => { runs++; }, stop: () => { stops++; } };
  r.v.awakeUntil = Date.now() + 10000;
  r.turn(1, [['EndOfTurn', 'Dixi, come on. You got this.']]);
  await sleep(50);
  assert.deepEqual([runs, stops], [0, 0], 'ignored: the job in progress keeps going');
  r.turn(2, [['EndOfTurn', 'Dixi, you idiot.']]);
  assert.equal(stops, 1, 'an insult is a protest: it stops Dixi');
});

test('never asks (Nov 5): a parse that comes back as a question with no steps is never said as a question', async () => {
  const r = rig({ reply: JSON.stringify({ clarify: 'Which Zentora do you mean?', steps: [] }) });
  r.turn(1, [['Update', 'open zen'], ['EndOfTurn', 'Open zen.']]);
  await sleep(1000);
  assert.ok(r.spoken.length, 'it said something');
  assert.ok(r.spoken.every((t) => !t.includes('?')), JSON.stringify(r.spoken));
  assert.match((await import('node:fs')).readFileSync(new URL('../../src/renderer/core/interpret.js', import.meta.url), 'utf8'), /"clarify": always ""/);
});

test('never asks "which one?" (Nov 5): the first result is taken and said in one line; "the other one" switches', async () => {
  const r = rig();
  const names = ['Bykkar Music', 'EJ Music'];
  r.v.lastText = 'open the music site';
  assert.equal(await r.v.choose('Which one: Bykkar Music or EJ Music?', names), 'Bykkar Music');
  assert.equal(r.v.clarify, null, 'no question is left open');
  assert.deepEqual(r.spoken, ['Going with the first one, Bykkar Music.']);
  const heard = [], handle = r.v.handleText.bind(r.v);
  r.v.handleText = (t, o) => { heard.push(t); return handle(t, o); };
  r.v.handleText('the other one');
  assert.deepEqual(heard, ['the other one', 'open the music site'], 'the same request runs again');
  assert.equal(await r.v.choose('Which one: Bykkar Music or EJ Music?', names), 'EJ Music');
  assert.equal(r.spoken.at(-1), 'Going with EJ Music instead.');
  assert.equal(await r.v.choose('Open EJ Music?', ['EJ Music']), 'EJ Music', 'one option: taken, not asked');
  assert.equal(r.v.clarify, null);
  assert.equal(r.spoken.at(-1), 'Going with EJ Music.');
  assert.ok(r.spoken.every((t) => !t.includes('?')));
  assert.match((await import('node:fs')).readFileSync(new URL('../../src/renderer/app.js', import.meta.url), 'utf8'), /ask: \(q, options\) => voice\.choose\(q, options\)/, "the executor's choices go through choose()");
});

test('Mac-wide (⌥Space) on the browser clock: planned at a short pause, sent at a pause before the turn ends, never twice', async () => {
  const r = rig();
  const sent = [], specs = [];
  r.v.everywhere = { wants: () => true, transcript() {}, speculate: (t) => specs.push(t), run: (t) => sent.push(t), stop() {} };
  r.v.terms = ['Safari'];
  Object.assign(r.v, { specMS: 20, settleMS: 60 });
  r.turn(1, [['Update', 'open Safari']]);
  await sleep(100);
  assert.deepEqual(specs, ['open Safari'], 'planned while still talking');
  assert.deepEqual(sent, ['open Safari'], 'sent at the pause, before any end of turn');
  r.turn(1, [['Update', 'open Safari and go to apple.com']]);
  await sleep(100);
  r.turn(1, [['EndOfTurn', 'Open Safari and go to apple.com.']]);
  assert.deepEqual(sent, ['open Safari', 'go to apple.com.'], 'only the new words, once (a site not used yet waits for the end, as in the browser)');
  // A question, half a sentence, or a buy waits for the end of the turn.
  for (const [i, words] of [[2, 'what is on my screen'], [3, 'open the'], [4, 'buy a new charger']]) {
    const n = sent.length;
    r.turn(i, [['Update', words]]);
    await sleep(100);
    assert.equal(sent.length, n, `"${words}" waited`);
    r.turn(i, [['EndOfTurn', words]]);
    assert.equal(sent.length, n + 1, `"${words}" went at the end`);
  }
  assert.equal(sent.length, 5);
  // Esc (cancel) drops a pending send.
  r.turn(5, [['Update', 'open Notes']]);
  r.v.cancelAll({ quiet: true });
  await sleep(100);
  assert.equal(sent.length, 5);
});
