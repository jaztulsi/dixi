// Dixi must never take its own voice for you. The end of what it says often reaches speech-to-text after it
// has stopped talking (after the short echo tail too), with no "Dixi" in front, while a follow-up window
// is open: heard as a request, it's answered out loud, and that answer is heard again, forever.
// The real Speaker keeps what was said; only the sound is faked (no voice in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceAgent } from '../../src/renderer/core/voice.js';
import { Speaker } from '../../src/renderer/ui/speaker.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAIL = 1300;   // past Speaker's echo tail: isBusy() is false again

const EARLIER = "Sending that to your Claude team. I'll tell you when they're done.";
const ANSWER = "You're in Google Chrome, on the Zentora homework page. The history essay is due Friday, and the submit button is at the bottom right.";
const NAMED = 'To click and type for you, Dixi needs Accessibility permission. Turn Dixi on in the setting that just opened, then ask again.';
// Ways the speech-to-text writes Dixi's last line back: whole, a part, a few words misheard.
const HEARD = [
  ANSWER,
  'the history essay is due Friday and the submit button is at the bottom right',
  "your in Google Chrome on the Zentora homework page the history essay is do Friday and the submit button is at the bottom",
  "I'll tell you when they're done.",   // an earlier line, heard late
];

/** A speaker that has just said `lines`, in order, with its echo tail run out. */
async function spoke(lines) {
  const speaker = new Speaker({ synth: null, tts: null });
  for (const l of lines) speaker.say(l);
  await sleep(TAIL);
  assert.equal(speaker.isBusy(), false);
  return speaker;
}

function rig(speaker, { wake, everywhere = true }) {
  const handled = [], sent = [], cancels = [];
  const llm = { json: async () => JSON.stringify({ clarify: '', steps: [] }) };
  const tabs = { getCurrentURL: () => 'about:blank', activeTab: null, visibleTabs: [], tabList: () => '', dx: async () => '' };
  const executor = { run: async () => ({ ok: true, message: 'ok' }) };
  const v = new VoiceAgent({ deepgram: null, tabs, llm, tiers: { fast: ['m'], strong: [] }, executor, speaker, settings: { requireWakeWord: wake }, settleMS: 20, specMS: 10 });
  const handleText = v.handleText.bind(v), cancelAll = v.cancelAll.bind(v);
  v.handleText = (t, o) => { handled.push(t); return handleText(t, o); };
  v.cancelAll = (o) => { cancels.push(o); return cancelAll(o); };
  // Another app in front, just after an Everywhere answer: Everywhere wants everything heard.
  if (everywhere) v.everywhere = { wants: () => true, transcript() {}, run: (t) => { sent.push(t); }, stop() {} };
  let n = 0;
  const hear = (text) => { const i = ++n; v.handleMessage(JSON.stringify({ type: 'TurnInfo', event: 'Update', turn_index: i, transcript: text.split(' ').slice(0, 4).join(' ') })); v.handleMessage(JSON.stringify({ type: 'TurnInfo', event: 'EndOfTurn', turn_index: i, transcript: text })); };
  return { v, handled, sent, cancels, hear };
}

for (const wake of [false, true]) {
  for (const everywhere of [true, false]) {
    test(`its own words heard after it stopped talking do nothing (wake word ${wake ? 'on, follow-up window open' : 'off'}, ${everywhere ? 'Everywhere' : 'browser'})`, async () => {
      const r = rig(await spoke([EARLIER, ANSWER]), { wake, everywhere });
      for (const h of HEARD) { if (wake) r.v.awakeUntil = Date.now() + 15000; r.hear(h); }
      await sleep(150);
      assert.deepEqual(r.sent, [], 'nothing went to Everywhere');
      assert.deepEqual(r.handled, [], 'nothing went to the browser');
    });
  }
}

test('a line of its own that names Dixi is still an echo, not "Dixi, …"', async () => {
  const r = rig(await spoke([NAMED]), { wake: true });
  r.hear(NAMED);
  r.hear('Dixi needs Accessibility permission. Turn Dixi on in the setting that just opened');
  await sleep(150);
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.handled, []);
});

test('you still get through right after Dixi talked: a new request, "Dixi, stop", plain "stop"', async () => {
  const speaker = await spoke([EARLIER, ANSWER]);
  const r = rig(speaker, { wake: true });
  r.hear('Dixi, open my email and find the note from Grandma.');
  r.hear('Dixi, stop.');
  await sleep(50);
  assert.deepEqual(r.sent, ['open my email and find the note from Grandma.']);
  assert.ok(r.cancels.length >= 1, '"Dixi, stop" stopped everything');
  const b = rig(speaker, { wake: false, everywhere: false });
  b.hear('search for lamps on Bykkar');
  b.hear('stop');
  await sleep(150);
  assert.ok(b.handled.some((t) => /lamps on Bykkar/.test(t)), `heard: ${JSON.stringify(b.handled)}`);
  assert.ok(b.cancels.length >= 1, 'plain "stop" too');
});

test("a question's own echo doesn't answer it, but a short reply that uses its words does", async () => {
  const r = rig(new Speaker({ synth: null, tts: null }), { wake: true });
  const pick = r.v.ask('Which one: Bykkar Music or EJ Music?', ['Bykkar Music', 'EJ Music']);
  await sleep(TAIL);
  r.hear('Which one Bykkar Music or EJ Music?');
  assert.ok(r.v.clarify, 'the echo did not answer it (it would have picked Bykkar Music)');
  r.hear('EJ Music.');
  assert.equal(await pick, 'EJ Music');

  const yes = r.v.confirmAction('Press “Send message”?');
  await sleep(TAIL);
  r.hear('Press send message.');
  assert.ok(r.v.clarify, 'its own "press send message" is neither the answer nor a new command');
  assert.ok(!r.handled.some((t) => /press send/i.test(t)), `heard: ${JSON.stringify(r.handled)}`);
  r.hear('yes');
  assert.equal(await yes, true);
  assert.deepEqual(r.sent, []);
});
