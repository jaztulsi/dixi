import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, granted, nextStep, tryLines, spoken } from '../../src/renderer/everywhere/welcome.js';
import { permStatus } from '../../src/main/welcome.js';
import { EARCONS, earconFor, play, canSound, ECHO_MS, cardAnswer, QUIET_MS, keyApprovalOk } from '../../src/renderer/everywhere/cues.js';

test('the welcome walks the steps in order: microphone, screen, accessibility, then the optional one', () => {
  assert.deepEqual(STEPS.map((s) => s.id), ['mic', 'screen', 'ax', 'automation']);
  assert.equal(nextStep({}), 'mic');
  assert.equal(nextStep(undefined), 'mic');
  assert.equal(nextStep({ mic: 'granted', screen: 'not-determined', ax: false }), 'screen');
  assert.equal(nextStep({ mic: 'granted', screen: 'granted', ax: false }), 'ax');
  assert.equal(nextStep({ mic: 'granted', screen: 'granted', ax: true, automation: null }), 'automation');
  assert.equal(nextStep({ mic: 'granted', screen: 'granted', ax: true, automation: true }), 'try');
});

test('a step out of order is still checked off; skipping moves on; denied is not done', () => {
  assert.equal(nextStep({ ax: true }), 'mic');
  assert.equal(nextStep({ mic: 'granted', ax: true }), 'screen');
  assert.equal(nextStep({ mic: 'denied' }), 'mic');                  // macOS said no: still the step to do
  assert.equal(nextStep({ mic: 'denied' }, ['mic']), 'screen');      // "Not now"
  assert.equal(nextStep({ mic: true, screen: true, ax: true }, ['automation']), 'try');
  assert.equal(nextStep({}, ['mic', 'screen', 'ax', 'automation']), 'try');
  assert.equal(granted('granted'), true);
  for (const v of ['denied', 'not-determined', 'restricted', 'unknown', false, null, undefined, 'true']) assert.equal(granted(v), false, String(v));
});

test('the try-it card uses the real shortcuts, and Dixi says them in words', () => {
  assert.deepEqual(tryLines(), ['Press ⌥Space and ask: “what’s on my screen?” Press it again to send.', 'Press ⌥Space and say: “open Safari.”', 'Esc cancels.']);
  assert.match(tryLines({ stop: '⌃⇧D' }).join(' '), /⌃⇧D cancels/);
  assert.doesNotMatch(tryLines().join(' '), /listening for|Dixi”, if/);   // no wake word, ever
  assert.equal(spoken('⌘⌥Space'), 'Command Option Space');
  assert.equal(spoken('⌃⇧D'), 'Control Shift D');
});

// A fake AudioContext that records when each note starts and stops.
function fakeAudio() {
  const notes = [];
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (n) => n });
  return {
    notes, currentTime: 5, destination: {},
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => { const o = { ...node(), frequency: param(), start: (t) => { o.at = t; }, stop: (t) => { o.end = t; } }; notes.push(o); return o; },
  };
}

test('every earcon is short (200 ms at most), and the card and done ones are two notes', () => {
  for (const name of Object.keys(EARCONS)) {
    const ac = fakeAudio();
    play(ac, name);
    assert.ok(ac.notes.length > 0, name);
    const first = Math.min(...ac.notes.map((n) => n.at)), last = Math.max(...ac.notes.map((n) => n.end));
    assert.ok(last - first <= 0.2 + 1e-9, `${name}: ${last - first}s`);
  }
  assert.equal(EARCONS.card.length, 2);
  assert.ok(EARCONS.card[1][0] > EARCONS.card[0][0]);   // the chime goes up
  assert.ok(EARCONS.done[1][0] < EARCONS.done[0][0]);   // done goes down
  assert.ok(EARCONS.listen[0][1] > EARCONS.listen[0][0]); // listening rises
  assert.ok(EARCONS.guard[0][0] < 300);                  // Guardian: a low tone
});

test('earcons play on a change of state only, and never over Dixi or its echo window', () => {
  assert.equal(earconFor('idle', 'listening'), 'listen');
  assert.equal(earconFor('listening', 'listening'), null);   // live words while listening: no beep each time
  assert.equal(earconFor('thinking', 'done'), 'done');
  assert.equal(earconFor('error', 'guard'), 'guard');
  assert.equal(earconFor('guard', 'guard'), null);
  assert.equal(earconFor('listening', 'thinking'), null);
  assert.equal(canSound(true, -Infinity, 1000), false);                 // Dixi is speaking
  assert.equal(canSound(false, 1000, 1000 + ECHO_MS - 1), false);       // just stopped: the mic is listening for the answer
  assert.equal(canSound(false, 1000, 1000 + ECHO_MS), true);
  assert.equal(canSound(false, -Infinity, 0), true);
});

test('card keys: Y or Enter is yes, N or Esc is no; a yes right after typing does not count', () => {
  assert.equal(cardAnswer('y'), true);
  assert.equal(cardAnswer('Y'), true);
  assert.equal(cardAnswer('Enter'), true);
  assert.equal(cardAnswer('n'), false);
  assert.equal(cardAnswer('Escape'), false);
  assert.equal(cardAnswer('a'), null);
  assert.equal(cardAnswer('Tab'), null);
  assert.equal(cardAnswer('y', QUIET_MS - 1), null);      // typing "yes…" into another app as the card appears
  assert.equal(cardAnswer('Enter', 100), null);
  assert.equal(cardAnswer('Escape', 0), false);            // no is always safe
});

test('the ⌥Return yes is ignored right after the agent types or a card opens', () => {
  const t = { now: 10000, lastSynthetic: 0, cardAt: 0 };
  assert.equal(keyApprovalOk(t), true);
  assert.equal(keyApprovalOk({ ...t, lastSynthetic: 9600 }), false);
  assert.equal(keyApprovalOk({ ...t, lastSynthetic: 9500 }), true);
  assert.equal(keyApprovalOk({ ...t, cardAt: 9400 }), false);
  assert.equal(keyApprovalOk({ ...t, cardAt: 9300 }), true);
  assert.equal(keyApprovalOk({ now: 5 }), true);
});

test('permStatus normalizes what macOS says', () => {
  assert.deepEqual(permStatus({ mic: 'granted', screen: 'denied', ax: true, automation: null }), { mic: 'granted', screen: 'denied', ax: true, automation: null });
  assert.deepEqual(permStatus({ ax: 'yes', automation: false }), { mic: 'unknown', screen: 'unknown', ax: false, automation: false });
  assert.deepEqual(permStatus(), { mic: 'unknown', screen: 'unknown', ax: false, automation: null });
  assert.equal(permStatus({ automation: true }).automation, true);
});
