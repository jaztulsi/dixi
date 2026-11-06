// Red team, round 2: the holes found in press-by-number, Dixi's own window, unreadable controls and the
// wake word stay closed. perform() (the gate every click, key and press goes through) runs for real here:
// only Electron, the mouse/keyboard (input.js) and Claude are stand-ins.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VoiceAgent } from '../../src/renderer/core/voice.js';
import { Speaker } from '../../src/renderer/ui/speaker.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/main');

// ---- stand-ins: everywhere.js gets a fake 'electron' and a fake './input.js' (same exports, driven from here) ----
const names = [...fs.readFileSync(path.join(main, 'input.js'), 'utf8').matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
const fakeInput = 'data:text/javascript,' + encodeURIComponent(names.map((n) => `export const ${n} = (...a) => globalThis.__input.${n}(...a);`).join('\n'));
// mac.js for real, but openTarget never opens anything here (a test that opens a link would open the real browser).
const fakeMacJs = 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(pathToFileURL(path.join(main, 'mac.js')).href)};
export const openTarget = (...a) => (globalThis.__opened ??= []).push(a) && { ok: false, error: 'tests open nothing' };`);
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'electron') return { url: 'data:text/javascript,export default globalThis.__electron;', shortCircuit: true };
    if (spec === './input.js' && ctx.parentURL?.endsWith('/src/main/everywhere.js')) return { url: ${JSON.stringify(fakeInput)}, shortCircuit: true };
    if (spec === './mac.js' && ctx.parentURL?.endsWith('/src/main/everywhere.js')) return { url: ${JSON.stringify(fakeMacJs)}, shortCircuit: true };
    return next(spec, ctx);
  }`));

const keys = {}, toMain = [], appOn = {}, released = [];   // the global shortcuts Dixi registered; what it sent the main window
const any = () => new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : any()), apply: () => any(), construct: () => any() });
const img = { isEmpty: () => false, getSize: () => ({ width: 1280, height: 800 }), toJPEG: () => Buffer.from('jpg'), crop: () => img, resize: () => img };
class Win { static made = 0; static last = null; constructor() { Win.made++; Win.last = this; this.sent = []; this.webContents = { on() {}, once: (_e, fn) => fn(), send: (ch, d) => this.sent.push([ch, d]), setWindowOpenHandler() {} }; } isDestroyed() { return false; } isVisible() { return true; } }
for (const m of ['setAlwaysOnTop', 'setVisibleOnAllWorkspaces', 'setIgnoreMouseEvents', 'setContentProtection', 'loadFile', 'setBounds', 'showInactive', 'hide', 'show']) Win.prototype[m] = () => {};
globalThis.__electron = new Proxy({
  BrowserWindow: Win,
  screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 }, scaleFactor: 1 }) },
  desktopCapturer: { getSources: async () => [{ display_id: '1', thumbnail: img }] },
  systemPreferences: { isTrustedAccessibilityClient: () => true, getMediaAccessStatus: () => 'granted' },
  globalShortcut: { register: (k, fn) => { keys[k] = fn; return true; }, unregister: (k) => { released.push(k); } },
  app: { on: (ev, fn) => { appOn[ev] = fn; } },
}, { get: (t, k) => (k in t ? t[k] : any()) });

const OTHER = 4242;   // the pid of the app in front (not Dixi)
let done = [];        // what really happened to the Mac: clicks, presses, typing
function fakeMac({ front = OTHER, controls = [], at = null, press = 'ok', box = { role: 'AXTextArea', labels: [], pid: front }, found = { ok: false, why: "Couldn't find the TextEdit input." }, pasted = { ok: true, checked: true }, owner = '', named = [] } = {}) {
  done = [];
  const log = (what) => async (...a) => { done.push([what, ...a]); };
  globalThis.__input = new Proxy({
    frontApp: async () => ({ name: 'TextEdit', bundle: 'com.apple.TextEdit', pid: front }),
    browserTab: async () => null, enableAX: async () => {}, findControls: async () => named,
    listControls: async () => controls, elementAt: async () => at, focused: async () => box,
    isEditable: (el) => /^AX(TextField|TextArea)$/.test(el?.role ?? ''), fieldHas: async () => ({ read: true, len: 0, has: false }),
    focusField: async () => found, procName: async () => owner, pasteChecked: async (t) => { done.push(['type', t]); return pasted; },
    cursor: async () => ({ x: 0, y: 0 }), openApp: async () => false,
    pressControl: async (...a) => { done.push(['press', ...a]); return press; },
    click: log('click'), type: log('type'), key: log('key'), move: log('move'), mouseButton: log('mouseButton'), scroll: log('scroll'), drag: log('drag'),
  }, { get: (t, k) => t[k] ?? (async () => null) });
}

// Claude stand-in: the agent's turns, scripted. Every request is kept, so the tool results can be read.
let requests = [], script = [], planned = null;   // planned: the planner's reply (plan.js), when a test sets one
globalThis.fetch = async (_url, { body }) => {
  const b = JSON.parse(body);
  requests.push(b);
  const content = b.tools ? script.shift() ?? [{ type: 'text', text: 'Done.' }] : [{ type: 'text', text: planned && b.output_config?.format?.schema?.properties?.steps ? JSON.stringify(planned) : '{"tasks":[]}' }];
  if (b.stream) {   // the planner streams (server-sent events): the same reply as one text delta
    const ev = [{ type: 'message_start', message: { usage: { input_tokens: 1 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: content[0].text } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }];
    return { ok: true, status: 200, body: [new TextEncoder().encode(ev.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''))] };
  }
  return { ok: true, status: 200, json: async () => ({ content, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' }) };
};
const result = (id) => requests.flatMap((r) => r.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((c) => c.type === 'tool_result' && c.tool_use_id === id)?.content;

// One Everywhere, set up the way main.js does; approvals are answered by `answer(question)` (true = yes).
let answer = () => false, asked = [], spoken = [], events = [], rt2Dir = '';
let quiet = () => {}, mainWin = null, ewApi = null;   // the renderer saying Dixi's voice has finished (there's no renderer here)
const harness = (async () => {
  if (process.platform !== 'darwin') return null;
  const { setupEverywhere } = await import('../../src/main/everywhere.js');
  const handlers = {}, ons = {};
  quiet = () => ons['everywhere:speaking']?.(false);
  const win = mainWin = { isDestroyed: () => false, webContents: { send: (ch, d) => { toMain.push(ch); if (ch === 'everywhere:say') spoken.push(String(d)); if (ch === 'everywhere:browse') { events.push(`browse ${d.text}`); setTimeout(() => { events.push(`done ${d.text}`); ons['everywhere:browsed'](d.id, true, ''); }, 30); } if (ch === 'everywhere:confirm') { asked.push(d.question); setTimeout(() => ons['everywhere:confirm-reply'](d.id, answer(d.question)), 10); } } } };
  ewApi = setupEverywhere({ config: { env: { DIXI_BRIDGE: '0' }, keys: { anthropic: 'test' } }, spend: { overFor: () => false, add() {}, over: false }, here: main,
    userData: (rt2Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-rt2-'))), trashDir: fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-rt2-trash-')), getMainWindow: () => win, handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { ons[ch] = fn; }, onShowMain() {} });
  return (text) => handlers['everywhere:run'](text);
})();
async function agentDoes(calls, mac, said = 'organize these notes for me') {
  const run = await harness;
  fakeMac(mac);
  requests = []; asked = []; spoken = [];
  script = [[{ type: 'text', text: 'On it.' }, ...calls.map((c, i) => ({ type: 'tool_use', id: `t${i}`, ...c }))]];
  await run(said);
}
const SAVE = { role: 'AXButton', subrole: '', labels: ['Save'], path: [0, 3], frame: { x: 100, y: 100, w: 40, h: 20 }, pid: OTHER };
const mac = process.platform === 'darwin' ? {} : { skip: 'Everywhere is macOS only' };

test('P1: when pressing by number falls back to a click, something covering the control is never clicked', mac, async () => {
  await agentDoes([{ name: 'press', input: { ref: 1 } }], { controls: [SAVE], press: 'nopress', at: { role: 'AXButton', labels: ['Pay now'], pid: OTHER } });
  assert.ok(!done.some(([w]) => w === 'click'), `clicked: ${JSON.stringify(done)}`);
  assert.match(String(result('t0')), /covering/);
  // The same control still there: the fallback click happens (so the check above isn't vacuous).
  await agentDoes([{ name: 'press', input: { ref: 1 } }], { controls: [SAVE], press: 'nopress', at: { ...SAVE } });
  assert.ok(done.some(([w, p]) => w === 'click' && p.x === 120 && p.y === 110), `did: ${JSON.stringify(done)}`);
});

test("P2: Dixi never presses, clicks or types in its own window (its safety switches live there)", mac, async () => {
  await agentDoes([{ name: 'press', input: { ref: 1 } }, { name: 'left_click', input: { coordinate: [10, 10] } }, { name: 'type', input: { text: 'hi' } }, { name: 'key', input: { text: 'space' } }],
    { front: process.pid, controls: [{ ...SAVE, labels: ['Say “Dixi” first'], pid: process.pid }], at: { role: 'AXCheckBox', labels: ['Say “Dixi” first'], pid: process.pid } });
  assert.deepEqual(done.filter(([w]) => w !== 'move'), []);
  for (const id of ['t0', 't1', 't2', 't3']) assert.match(String(result(id)), /Dixi's own window/);
  // Another app in front, but the click would land on a Dixi window.
  await agentDoes([{ name: 'left_click', input: { coordinate: [10, 10] } }], { at: { role: 'AXCheckBox', labels: ['Ask before every step'], pid: process.pid } });
  assert.ok(!done.some(([w]) => w === 'click'));
});

test('P4: a control nobody can read is refused, even in an ordinary app, without a question; an unnamed one there is not', mac, async () => {
  const { clickRisk } = await import('../../src/main/everywhere.js');
  assert.ok(clickRisk(null, { strict: false }));
  assert.equal(clickRisk({ role: 'AXButton', labels: [] }, { strict: false }), null);
  answer = () => true;   // no questions any more: a yes waiting here must not be what lets a click through
  await agentDoes([{ name: 'left_click', input: { coordinate: [640, 400] } }], { at: null }, 'send it to Alex');   // a remote desktop, a canvas, a game
  assert.equal(asked.length, 0, 'nothing was asked');
  assert.ok(!done.some(([w]) => w === 'click'), 'and nothing was clicked, even though the user said "send"');
  assert.ok(spoken.some((s) => /can't tell what that button does/.test(s)), 'and the reason was said');
});

test('"type hello world" types those words as said: no model call, the field checks still apply', mac, async () => {
  await agentDoes([], {}, 'type hello world');
  assert.deepEqual(done.filter(([w]) => w === 'type'), [['type', 'hello world']]);
  assert.equal(requests.length, 0, 'no AI call');
  await agentDoes([], { box: { role: 'AXTextField', subrole: 'AXSecureTextField', labels: ['Password'], pid: OTHER } }, 'type hunter2');
  assert.ok(!done.some(([w]) => w === 'type'), 'never into a password box');
});

test('"click X" by name: pressed when the words name it, skipped with one line when they do not, never asked', mac, async () => {
  answer = () => true;   // a yes waiting here must not be what lets a press through
  const SEND = { ...SAVE, labels: ['Send'] }, WIDE = { ...SAVE, labels: ['Delete Account'] };
  await agentDoes([], { named: [SEND] }, 'click Send');
  assert.equal(asked.length, 0, 'nothing was asked');
  assert.ok(done.some(([w]) => w === 'press'), 'Send was pressed');
  await agentDoes([], { named: [WIDE] }, 'click delete');   // the one match reaches past what was said
  assert.equal(asked.length, 0, 'nothing was asked');
  assert.ok(!done.some(([w]) => w === 'press'), 'Delete Account was not pressed');
  assert.ok(spoken.some((s) => /didn't ask me to press “Delete Account”/.test(s)), 'and the reason was said');
});

test('a form uses your profile without asking: said on the card, logged without its values', mac, async () => {
  fs.writeFileSync(path.join(rt2Dir, 'profile.json'), JSON.stringify({ name: 'Pat Example', email: 'pat@example.com', password: 'hunter2', card: '4111 1111 1111 1111', cvv: '737', code: '481516', ssn: '078-05-1120' }));
  answer = () => false;   // a "no" waiting here must not be what decides
  await agentDoes([], {}, 'fill out this form');
  fs.rmSync(path.join(rt2Dir, 'profile.json'));
  assert.equal(asked.length, 0, 'nothing was asked');
  const sent = JSON.stringify(requests.filter((r) => r.tools)[0]?.messages?.[0]);
  assert.match(sent, /Pat Example/, 'the agent got the profile');
  assert.doesNotMatch(sent, /hunter2|4111|737|481516|078-05/, 'never a password, card, code or SSN, even typed into the profile');
  const log = fs.readFileSync(path.join(rt2Dir, 'activity.jsonl'), 'utf8');
  assert.match(log, /used your profile/);
  assert.doesNotMatch(log, /pat@example|Pat Example/, 'no profile values in the log');
});

test('the screen agent never asks in normal mode: told to pick the likeliest option, at most twice, then it stops', mac, async () => {
  await agentDoes([], {}, 'tidy up my desktop');   // sets the fakes; the scripted turns follow
  const ask = () => [{ type: 'text', text: 'Which folder do you mean?' }];
  script = [ask(), [{ type: 'text', text: 'I picked Downloads.' }, { type: 'tool_use', id: 'k0', name: 'key', input: { text: 'cmd+n' } }], [{ type: 'text', text: 'Done.' }]];
  requests = []; spoken = []; toMain.length = 0;
  await (await harness)('tidy up my desktop');
  assert.ok(!toMain.includes('everywhere:ask'), 'nothing was asked');
  assert.ok(!spoken.some((x) => /\?$/.test(x)), `no question was said: ${spoken}`);
  const agent = requests.filter((r) => r.tools);
  assert.match(JSON.stringify(agent[1]?.messages?.at(-1)), /Pick the likeliest option/, 'it was told to pick');
  assert.match(agent[0].system, /Never ask the user anything/);
  script = [ask(), ask(), ask(), ask()]; requests = []; toMain.length = 0;
  await (await harness)('tidy up my desktop');
  assert.ok(!toMain.includes('everywhere:ask'), 'still nothing asked');
  assert.equal(requests.filter((r) => r.tools).length, 3, 'one first try and two nudges, then it stops');
});

test('a risky named control is never asked about: refused unless the user said it, pressed when they did', mac, async () => {
  const SEND = { ...SAVE, labels: ['Send'] };
  answer = () => true;
  await agentDoes([{ name: 'press', input: { ref: 1 } }], { controls: [SEND] });   // "organize these notes": nobody said send
  assert.equal(asked.length, 0, 'nothing was asked');
  assert.ok(!done.some(([w]) => w === 'press'), 'and Send was not pressed');
  assert.ok(spoken.some((s) => /didn't ask me to press “Send”/.test(s)), 'and the reason was said');
  await agentDoes([{ name: 'press', input: { ref: 1 } }], { controls: [SEND] }, 'send it to Alex');
  assert.equal(asked.length, 0, 'nothing was asked');
  assert.ok(done.some(([w]) => w === 'press'), 'the user said send, so it was pressed');
});

test("A3: a many-part command with Dixi's own window in front: each part goes to Dixi's browser, in order, the next only after the last is done", mac, async () => {
  const run = await harness;
  fakeMac({ front: process.pid });   // Dixi's own window in front: the screen agent never acts there
  events = []; asked = [];
  await run('search the web for jazz records, then add the first one to the cart');
  assert.deepEqual(events, ['browse search the web for jazz records', 'done search the web for jazz records', 'browse add the first one to the cart', 'done add the first one to the cart']);
  assert.equal(asked.length, 0);
  assert.ok(!done.some(([w]) => /click|press|type|key/.test(w)), 'nothing was clicked or typed on the screen');
});

test('QA open-nytimes / misheard-you-tube: a single "open …" that names no app goes to the planner, not the screen agent', mac, async () => {
  const run = await harness;
  fakeMac();   // another app in front; openApp finds no app called "you tube"
  events = []; asked = []; requests = [];
  planned = { steps: [{ do: 'web', clause: 'open you tube' }] };
  try { await run('open you tube'); } finally { planned = null; }
  assert.deepEqual(events, ['browse open you tube', 'done open you tube']);
  assert.ok(!requests.some((b) => b.tools), 'the screen agent never ran');
  assert.ok(!done.some(([w]) => /click|press|type|key/.test(w)), 'nothing was clicked or typed on the screen');
});

test('QA item 3: a link opened before a step Dixi\'s browser does opens there too (one browser per chain)', mac, async () => {
  const run = await harness;
  fakeMac();
  events = []; asked = []; globalThis.__opened = [];
  planned = { steps: [{ do: 'open', clause: 'search the web for jazz records', url: 'https://www.google.com/search?q=jazz+records' }, { do: 'web', clause: 'add the first one to the cart' }] };
  try { await run('search the web for jazz records, then add the first one to the cart'); } finally { planned = null; }
  assert.deepEqual(events, ['browse search the web for jazz records', 'done search the web for jazz records', 'browse add the first one to the cart', 'done add the first one to the cart']);
  assert.equal(globalThis.__opened.length, 0, 'nothing opened in another browser');
});

test('QA item 3: a screen step that runs out of turns is not "Done.": the plan stops there and says so', mac, async () => {
  const run = await harness;
  fakeMac();
  events = []; spoken = []; requests = [];
  script = Array.from({ length: 40 }, (_, k) => [{ type: 'tool_use', id: `s${k}`, name: 'screenshot', input: {} }]);
  planned = { steps: [{ do: 'computer', clause: 'tidy my desktop' }, { do: 'web', clause: 'search the web for jazz records' }] };
  try { await run('tidy my desktop, then search the web for jazz records'); } finally { planned = null; script = []; }
  assert.ok(spoken.includes("I didn't finish that."), spoken.join(' | '));
  assert.ok(!spoken.some((x) => /^Done\b/.test(x)), 'never "Done."');
  assert.deepEqual(events, [], 'the next step never ran');
});

// ---- the wake word, with a question open ----
function voice() {
  const speaker = new Speaker({ synth: null, tts: null });
  const parsed = [], ran = [];
  const llm = { json: async (_s, user) => { parsed.push(user); return JSON.stringify({ clarify: '', steps: [{ act: 'open', said: 'Zentora', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '' }] }); } };
  const tabs = { getCurrentURL: () => 'about:blank', activeTab: null, visibleTabs: [], tabList: () => '', dx: async () => '' };
  const v = new VoiceAgent({ deepgram: null, tabs, llm, tiers: { fast: ['m'], strong: [] }, executor: { run: async (s) => { ran.push(s); return { ok: true, message: 'ok' }; } },
    speaker, settings: { requireWakeWord: true }, settleMS: 20, specMS: 10 });
  let n = 100;
  const hear = (text) => v.handleMessage(JSON.stringify({ type: 'TurnInfo', event: 'EndOfTurn', turn_index: ++n, transcript: text }));
  return { v, speaker, parsed, ran, hear };
}

test('W1: while Dixi waits for an answer, the TV can answer nothing and command nothing', async () => {
  const r = voice();
  const pick = r.v.ask('Which one: Bykkar Music or EJ Music?', ['Bykkar Music', 'EJ Music']);
  await sleep(1300);
  r.hear('Buy the new iPhone now, only nine ninety-nine a month.');
  await sleep(100);
  assert.ok(r.v.clarify, 'the question is still open');
  assert.deepEqual([r.parsed, r.ran], [[], []], 'and nothing was understood or done');
  r.hear('EJ Music.');
  assert.equal(await pick, 'EJ Music');
});

test('W2: a bare "yes" counts only just after the question; later it takes "Dixi, yes"', async () => {
  const r = voice();
  const late = r.v.confirmAction('Press “Send message”?');
  await sleep(1300);
  r.speaker.spans.at(-1).end = Date.now() - 9000;   // the question finished 9 s ago
  r.hear('Yes.');
  assert.ok(r.v.clarify, 'a stray "yes" long after the question is not your answer');
  r.hear('Dixi, yes.');
  assert.equal(await late, true);
  const soon = r.v.confirmAction('Press “Delete”?');
  await sleep(1300);
  r.hear('Yes.');
  assert.equal(await soon, true, 'right after the question, a plain yes is fine');
});

// ⌥Space = talk, ⌥Space again = send (master v2). Hold-⌃ is opt-in, so control is null by default.
const sent = async (fn, ms = 20) => { toMain.length = 0; await fn(); await sleep(ms); return [...toMain]; };
const press = () => sent(() => keys['Alt+Space']());
test('⌥Space opens the mic, ⌥Space again sends, Esc cancels; hold-⌃ is off by default; a press while working never kills the work', mac, async () => {
  const run = await harness;
  fakeMac();
  quiet();
  assert.equal(ewApi.control, null, 'hold-⌃ watcher off by default (no 30 Hz poll at idle)');
  assert.ok((await press()).includes('everywhere:listen'), 'first press: it listens');
  assert.ok((await press()).includes('everywhere:finish'), 'second press: it sends');
  await press();
  assert.ok(!(await sent(() => keys.Escape())).includes('everywhere:finish'), 'Esc: cancelled, nothing sent');
  assert.equal(released.at(-1), 'Escape', 'Esc released after cancel');
  const slow = globalThis.fetch;
  globalThis.fetch = (...a) => sleep(400).then(() => slow(...a));
  const busy = run('organize these notes for me');
  await sleep(50);
  const mid = await press();
  assert.ok(mid.includes('everywhere:listen') && !mid.includes('everywhere:kill'), `press mid-task: listens, work continues (${mid})`);
  await press();
  await busy;
  globalThis.fetch = slow;
  quiet();
});

test('A2: the agent types only into a box it found, and its result says whether the text is really there', mac, async () => {
  const typing = [{ name: 'type', input: { text: 'hello' } }];
  await agentDoes(typing, { box: null });   // no box in focus, and none found
  assert.ok(!done.some(([w]) => w === 'type'), 'nothing pasted blind');
  assert.match(String(result('t0')), /Couldn't find the TextEdit input/);
  await agentDoes(typing);
  assert.match(String(result('t0')), /the text is in the box/);
  await agentDoes(typing, { box: { role: 'AXButton', labels: [], pid: OTHER }, found: { ok: true, how: 'ax', el: { role: 'AXTextArea', labels: ['Message'], pid: OTHER } }, pasted: { ok: false, why: "The text didn't show up in the TextEdit input." } });
  assert.match(String(result('t0')), /didn't show up/);
  assert.equal(asked.length, 0, 'nothing was asked');
});

test('clicks: the front app and menu extras yes; another window or a system prompt no, each refusal logged', mac, async () => {
  const click = [{ name: 'left_click', input: { coordinate: [640, 400] } }], said = 'click Send';
  const logged = () => { try { return fs.readFileSync(path.join(rt2Dir, 'activity.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"refused"')).length; } catch { return 0; } }, base = logged(), refusals = () => logged() - base;
  await agentDoes(click, { at: { role: 'AXMenuBarItem', subrole: 'AXMenuExtra', labels: ['Wi-Fi'], pid: 99 } }, said);
  assert.ok(done.some(([w]) => w === 'click'), 'a menu bar extra (another process) is clicked');
  await agentDoes(click, { at: { role: 'AXButton', labels: ['Send'], pid: 99 } }, said);
  assert.ok(!done.some(([w]) => w === 'click'), "not a button in another app's window");
  assert.match(String(result('t0')), /another app's window/);
  await agentDoes(click, { at: { role: 'AXButton', labels: ['Allow'], pid: 98 }, owner: '/System/Library/CoreServices/SecurityAgent.app/Contents/MacOS/SecurityAgent' }, 'click allow');
  assert.ok(!done.some(([w]) => w === 'click'), 'never a system security prompt, even when the user said it');
  assert.equal(refusals(), 2, 'both refusals logged');
  // The front app can't be read (frontApp failed: pid 0): fails closed, so a coreautha button is still never clicked.
  await agentDoes(click, { front: 0, at: { role: 'AXButton', labels: ['Use Password…'], pid: 97 }, owner: '/System/Library/Frameworks/LocalAuthentication.framework/Support/coreautha.bundle/Contents/MacOS/coreautha' }, 'click use password');
  assert.ok(!done.some(([w]) => w === 'click'), 'front app unknown: still never a system prompt');
  await agentDoes(click, { front: 0, at: { role: 'AXButton', labels: ['OK'], pid: 96 }, owner: '/Applications/TextEdit.app/Contents/MacOS/TextEdit' }, 'click ok');
  assert.ok(!done.some(([w]) => w === 'click'), "front app unknown: an ordinary window's button isn't clicked either");
  await agentDoes(click, { front: 0, at: { role: 'AXButton', labels: ['Allow'], pid: 0 } }, 'click allow');
  assert.ok(!done.some(([w]) => w === 'click'), 'both pids 0 (nothing known): not clicked');
  assert.equal(refusals(), 5, 'and each refusal logged');
  assert.equal(asked.length, 0, 'nothing was asked');
});

test('A1: a crashed Dixi window never leaves Esc held', mac, async () => {
  await harness;
  fakeMac();
  quiet();
  assert.ok((await press()).includes('everywhere:listen'), 'pressed: a session is open');
  released.length = 0;
  appOn['render-process-gone']({}, { other: true });
  assert.deepEqual(released, [], "another window's crash changes nothing");
  appOn['render-process-gone']({}, mainWin.webContents);
  assert.deepEqual(released, ['Escape'], 'the main window crashed mid-session: Esc is released');
  await press();
});

test('"clear my activity" just clears it (no question) and "undo that" brings it back', mac, async () => {
  const f = path.join(rt2Dir, 'activity.jsonl');
  fs.appendFileSync(f, JSON.stringify({ t: 1, kind: 'done', text: 'kept for undo' }) + '\n');
  await agentDoes([], {}, 'clear my activity');
  assert.equal(asked.length, 0, 'nothing was asked');
  assert.ok(!fs.existsSync(f), 'cleared');
  assert.ok(spoken.some((x) => /undo that/.test(x)), 'and Undo was offered');
  await agentDoes([], {}, 'undo that');
  assert.match(fs.readFileSync(f, 'utf8'), /kept for undo/, 'back');
});

test('A1: the overlay is made hidden at launch, so ⌥Space sends "listening" before any await (no cold window on the first press)', mac, async () => {
  const { setupEverywhere } = await import('../../src/main/everywhere.js');
  mock.timers.enable({ apis: ['setTimeout'] });
  let api;
  try {
    api = setupEverywhere({ config: { env: { DIXI_BRIDGE: '0' }, keys: { anthropic: 'test' } }, spend: { overFor: () => false, add() {}, over: false }, here: main,
      userData: fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-rt2-')), getMainWindow: () => mainWin, handle() {}, on() {}, onShowMain() {} });
    const start = Win.made;
    mock.timers.tick(2000);
    assert.equal(Win.made, start + 1, 'the overlay window exists before any press');
    const overlay = Win.last;
    api.toggle();   // ⌥Space: talk() runs, and what follows runs before its first await
    assert.equal(Win.made, start + 1, 'the press builds no window');
    assert.deepEqual(overlay.sent.filter(([ch]) => ch === 'ew:state').map(([, d]) => d.state), ['listening'], "'listening' is already sent");
  } finally { mock.timers.reset(); }
  api.toggle();
});

test('the speech connection drops mid-session: the island says "Reconnecting…", then goes back to just the waveform', mac, async () => {
  const { setupEverywhere } = await import('../../src/main/everywhere.js');
  mock.timers.enable({ apis: ['setTimeout'] });
  let api;
  try {
    api = setupEverywhere({ config: { env: { DIXI_BRIDGE: '0' }, keys: { anthropic: 'test' } }, spend: { overFor: () => false, add() {}, over: false }, here: main,
      userData: fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-rt2-')), getMainWindow: () => mainWin, handle() {}, on() {}, onShowMain() {} });
    mock.timers.tick(2000);
  } finally { mock.timers.reset(); }
  const overlay = Win.last, texts = () => overlay.sent.filter(([ch]) => ch === 'ew:state').map(([, d]) => d.text);
  api.toggle();
  await sleep(20);
  api.reconnecting(true);
  assert.equal(texts().at(-1), 'Reconnecting…');
  api.reconnecting(false);
  assert.equal(texts().at(-1), '', 'no "Listening" word: the waveform says it');
  api.toggle();
});

test('the overlay lets clicks through again on every show and every idle: the pointer on the island never leaves the Mac blocked', mac, async () => {
  const { setupEverywhere } = await import('../../src/main/everywhere.js');
  const handlers = {};
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    setupEverywhere({ config: { env: { DIXI_BRIDGE: '0' }, keys: { anthropic: 'test' } }, spend: { overFor: () => false, add() {}, over: false }, here: main,
      userData: fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-rt2-')), getMainWindow: () => mainWin, handle: (ch, fn) => { handlers[ch] = fn; }, on() {}, onShowMain() {} });
    mock.timers.tick(2000);
    const w = Win.last;
    let visible = false, ignore = null, hid = 0;
    Object.assign(w, { isVisible: () => visible, showInactive: () => { visible = true; }, hide: () => { visible = false; hid++; },
      setIgnoreMouseEvents: (on, o) => { ignore = on && o?.forward ? 'through' : on ? 'swallowed' : 'caught'; } });
    fakeMac();
    w.setIgnoreMouseEvents(false);   // the pointer was on the island (ew:mouse inside) when it last hid, e.g. it pressed Undo
    await handlers['everywhere:run']('open Notes');
    assert.equal(visible, true);
    assert.equal(ignore, 'through', 'shown: clicks outside the island reach your apps');
    w.setIgnoreMouseEvents(false);   // the pointer is on the island again as it lingers
    mock.timers.tick(60000); mock.timers.tick(1000);   // its linger (no app opened here, so an error card)
    assert.equal(hid, 0, 'back to the idle mascot pill: the island stays on screen');
    assert.equal(ignore, 'through', 'idle with the pointer on it: clicks still go through');
  } finally { mock.timers.reset(); }
});

test('"[everywhere] fetch failed": a dropped socket is retried once on a fresh one; twice dropped = one plain line, no raw error', mac, async () => {
  const real = globalThis.fetch;
  let drops = 1, calls = 0;
  globalThis.fetch = (...a) => { calls++; if (drops-- > 0) return Promise.reject(new TypeError('fetch failed')); return real(...a); };
  try {
    spoken = [];
    await agentDoes([]);
    assert.ok(calls >= 2, `retried (${calls} calls)`);
    assert.ok(!spoken.some((s) => /fetch failed|went wrong/i.test(s)), `no error said: ${spoken}`);
    drops = 99; spoken = [];
    await agentDoes([]);
    assert.ok(spoken.some((s) => /couldn't reach the internet/.test(s)) && !spoken.some((s) => /fetch failed/.test(s)), `plain line: ${spoken}`);
  } finally { globalThis.fetch = real; quiet(); }
});
