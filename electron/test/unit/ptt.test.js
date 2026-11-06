// A1 push-to-talk: the mic is closed and no speech socket is open unless a ⌥Space session is on.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceAgent } from '../../src/renderer/core/voice.js';

// Fake audio (DIXI_FAKE_AUDIO-style): a mic that, once started, produces an 80 ms frame every 80 ms.
function rig({ openMS = 0 } = {}) {
  const log = { opens: 0, bytes: 0, frames: [], micStarts: 0, micOn: false, ran: [] };
  let timer = null, n = 0;
  const mic = {
    start: async (onChunk) => { log.micStarts++; log.micOn = true; clearInterval(timer); timer = setInterval(() => onChunk(new Uint8Array(2560).fill(++n % 256)), 80); },
    stop: () => { log.micOn = false; clearInterval(timer); },
  };
  const deepgram = {
    open: async () => { log.opens++; if (openMS) await new Promise((r) => setTimeout(r, openMS)); return { ok: true }; },
    close: async () => {}, sendAudio: (c) => { log.bytes += c.length; log.frames.push(c[0]); }, onMessage() {}, onClosed() {},
  };
  const v = new VoiceAgent({ deepgram, mic, tabs: { visibleTabs: [] }, llm: {}, tiers: {}, executor: {}, settings: { requireWakeWord: false } });
  v.handleText = (t) => log.ran.push(t);
  v.preconnect = () => {}; v.speculate = () => {};
  return { v, log };
}

test('A1: idle 60 s with fake audio: 0 bytes sent, no socket, no capture device (even the boot-time start is refused)', async () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  try {
    const { v, log } = rig();
    await v.start();   // app.js boot path
    mock.timers.tick(60000);
    assert.deepEqual([log.micStarts, log.opens, log.bytes, log.micOn, v.isListening], [0, 0, 0, false, false]);
  } finally { mock.timers.reset(); }
});

test('A1: the mic opens on the key press; words before the socket is open are held and sent first (no clipped first word)', async () => {
  const { v, log } = rig({ openMS: 300 });
  await v.startSession();
  assert.equal(log.micStarts, 1);
  assert.ok(log.frames.length >= 3, `frames from the first 300 ms were sent: ${log.frames.length}`);
  assert.deepEqual(log.frames.slice(0, 3), [1, 2, 3], 'in order, from the first frame');
  await v.endSession({ cancel: true });
  assert.equal(log.micOn, false);
});

test('A1: ⌥Space again sends the words still being transcribed; Esc cancels; a leading "Dixie," is dropped', async () => {
  const { v, log } = rig();
  await v.startSession();
  v.handleTurn({ event: 'Update', transcript: 'Dixie, open the news', turn_index: 0 });
  await v.endSession({ waitMS: 100 });
  assert.deepEqual(log.ran, ['open the news']);
  assert.equal(log.micOn, false);
  assert.equal(v.session, null);

  await v.startSession();
  v.handleTurn({ event: 'Update', transcript: 'delete all my', turn_index: 1 });
  await v.reset();   // Esc
  assert.deepEqual(log.ran, ['open the news'], 'Esc runs nothing');
  assert.equal(log.micOn, false);
  assert.equal(v.session, null);
});

test('A1: 60 s without words ends the session; talking keeps it open; the hard cap ends it anyway', async () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  try {
    const { v, log } = rig();
    await v.startSession({ silenceMS: 60000, maxMS: 180000 });
    assert.equal(log.micOn, true);
    for (let i = 0; i < 5; i++) { mock.timers.tick(30000); v.handleTurn({ event: 'Update', transcript: `still talking ${i}`, turn_index: 2 + i }); v.turnsDone.add(2 + i); }
    assert.ok(v.session, 'words every 30 s keep it open');
    mock.timers.tick(31000);
    await Promise.resolve();
    assert.equal(v.session, null, 'the 3-minute cap ended it');
    assert.equal(log.micOn, false);

    await v.startSession({ silenceMS: 60000 });
    mock.timers.tick(61000);
    await Promise.resolve();
    assert.equal(v.session, null, '60 s of silence ended it');
    assert.equal(log.micOn, false);
  } finally { mock.timers.reset(); }
});

test('A1: Esc is a global key only during a session, released on every way out (send, cancel, silence, cap)', async () => {
  const { pttSession, hotkeyOwner } = await import('../../src/main/ptt.js');
  const keys = new Set();
  const ptt = pttSession({ register: (k) => keys.add(k), unregister: (k) => keys.delete(k), onEsc() {} });
  assert.equal(keys.size, 0, 'no Esc while idle');
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  try {
    for (const way of ['send', 'cancel', 'silence', 'cap']) {
      const { v } = rig();
      v.onSessionEnd = () => ptt.end();   // app.js → preload → main 'everywhere:session-end'
      ptt.start();
      await v.startSession({ silenceMS: 60000, maxMS: 90000 });
      assert.ok(keys.has('Escape'), `${way}: Esc held while open`);
      if (way === 'send') { const p = v.endSession({ waitMS: 0 }); mock.timers.tick(100); await p; }
      if (way === 'cancel') await v.reset();
      if (way === 'silence') { mock.timers.tick(61000); await Promise.resolve(); await Promise.resolve(); }
      if (way === 'cap') { for (let i = 0; i < 3; i++) { mock.timers.tick(30000); v.handleTurn({ event: 'Update', transcript: `words ${i}`, turn_index: 10 + i }); v.turnsDone.add(10 + i); } mock.timers.tick(1000); await Promise.resolve(); await Promise.resolve(); }
      assert.equal(keys.has('Escape'), false, `${way}: Esc released`);
      assert.equal(v.session, null, `${way}: session over`);
    }
  } finally { mock.timers.reset(); }
  assert.equal(hotkeyOwner('launchd\nRaycast\nFinder\n'), 'Raycast');
  assert.equal(hotkeyOwner('Finder\nRaycast Helper\n'), null, 'no guess: "taken by another app"');
});

test('A1: the mic denied while the socket is still connecting: 0 sockets and no fallback left open at idle', async () => {
  let opening = false, closedEarly = false, sockets = 0, fallen = false;
  const deepgram = {
    // Like stt.js: a close while ElevenLabs is still connecting is missed, and its fallback then opens Deepgram.
    open: async () => { opening = true; await new Promise((r) => setTimeout(r, 300)); opening = false; sockets = 1; if (closedEarly) fallen = true; return { ok: true }; },
    close: async () => { if (opening) closedEarly = true; else sockets = 0; }, sendAudio() {}, onMessage() {}, onClosed() {},
  };
  const mic = { start: async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }); }, stop() {} };
  const v = new VoiceAgent({ deepgram, mic, tabs: { visibleTabs: [] }, llm: {}, tiers: {}, executor: {}, settings: { requireWakeWord: false } });
  v.preconnect = () => {}; v.speculate = () => {};
  await v.startSession();
  await new Promise((r) => setTimeout(r, 400));   // the slow open finishes
  assert.deepEqual({ sockets, fallen, session: v.session, listening: v.isListening }, { sockets: 0, fallen: false, session: null, listening: false });
});

test('hold Control to talk: a hold talks and letting go sends; a tap, or a ⌃-shortcut, never opens the mic', async () => {
  const { holdToTalk } = await import('../../src/main/ptt.js');
  const log = [];
  const ctl = holdToTalk({ onStart: () => log.push('talk'), onEnd: () => log.push('send'), onCancel: () => log.push('drop'), holdMs: 30 });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  ctl('c1'); await wait(10); ctl('c0'); await wait(40);          // a tap
  ctl('c1'); await wait(10); ctl('k'); ctl('c0'); await wait(40); // ⌃C, quickly
  assert.deepEqual(log, [], 'neither one talks');
  ctl('c1'); await wait(45); ctl('c0');
  ctl('c1'); await wait(45); ctl('k'); ctl('c0');
  assert.deepEqual(log, ['talk', 'send', 'talk', 'drop'], 'held: talk then send; a shortcut mid-hold: dropped, and the release after it is nothing');
});
