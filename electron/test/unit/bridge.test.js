import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBridge, limiter, pickAnswer } from '../../src/main/bridge.js';

const MCP = fileURLToPath(new URL('../../bin/dixi-mcp.mjs', import.meta.url));

// A bridge in a fresh temp folder with fakes for Dixi's voice; `heard` collects what it was asked to do.
async function bridge(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-'));
  const heard = [];
  const b = startBridge({
    dir,
    say: (t) => heard.push(['say', t]),
    notify: (n) => heard.push(['notify', n]),
    ask: async (q, o) => { heard.push(['ask', q, o]); return opts.answer ?? 'the dev branch please'; },
    status: () => ({ listening: false, mic: opts.mic ?? true, busy: Boolean(opts.busy) }),
    ...opts.bridge,
  });
  await b.ready;
  const token = fs.readFileSync(path.join(dir, 'bridge-token'), 'utf8');
  const sock = path.join(dir, 'dixi.sock');
  const rpc = (method, params, tok = token) => new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => c.write(`${JSON.stringify({ token: tok, id: 7, method, params })}\n`));
    let buf = '';
    c.on('data', (d) => { buf += d; if (buf.includes('\n')) { c.end(); resolve(JSON.parse(buf)); } });
    c.on('error', reject);
  });
  return { dir, sock, token, heard, rpc, close: b.close };
}

test('the socket and the token are owner-only; a wrong token is refused', async () => {
  const b = await bridge();
  assert.match(b.token, /^[0-9a-f]{64}$/);
  assert.equal(fs.statSync(b.sock).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(b.dir, 'bridge-token')).mode & 0o777, 0o600);
  assert.deepEqual(await b.rpc('say', { text: 'hi' }, 'f'.repeat(64)), { id: 7, error: 'bad token' });
  assert.equal((await b.rpc('say', { text: 'hi' }, null)).error, 'bad token');
  assert.equal(b.heard.length, 0);
  assert.match((await b.rpc('click', { x: 1 })).error, /unknown method/);   // the bridge only talks
  assert.match((await b.rpc('__proto__', {})).error, /unknown method/);
  b.close();
  assert.equal(fs.existsSync(b.sock), false);
  // The same token survives a restart, so registered Claude Code sessions keep working.
  const again = startBridge({ dir: b.dir, say() {}, notify() {}, ask() {} });
  assert.equal(fs.readFileSync(path.join(b.dir, 'bridge-token'), 'utf8'), b.token);
  await again.ready; again.close();
});

test('say goes through, capped and without the wake word; then the rate limit kicks in', async () => {
  const b = await bridge();
  assert.deepEqual(await b.rpc('say', { text: 'Dixi, the  tests\npass.' }), { id: 7, result: { said: 'the tests pass.' } });
  assert.deepEqual(b.heard, [['say', 'the tests pass.']]);
  assert.match((await b.rpc('say', { text: 'again' })).error, /Too fast/);
  assert.equal(b.heard.length, 1);
  assert.match((await b.rpc('say', { text: '   ' })).error, /empty/);
  b.close();
});

test('the limit: one line per 2 s and 10 a minute', () => {
  let t = 0;
  const take = limiter({ now: () => t });
  assert.equal(take(), 0);
  t = 1000; assert.equal(take(), 1000);           // 1 s later: wait another second
  for (let i = 0; i < 9; i++) { t = 2000 * (i + 1); assert.equal(take(), 0); }   // 10 lines by t = 18 s
  t = 30000; assert.equal(take(), 30000);         // the 11th waits until the first is a minute old
  t = 60000; assert.equal(take(), 0);
});

test('nothing is spoken while Dixi is busy for the user (an approval card must not hear Claude Code)', async () => {
  const b = await bridge({ busy: true });
  assert.match((await b.rpc('say', { text: 'yes' })).error, /busy/);
  assert.match((await b.rpc('ask', { question: 'Deploy?' })).error, /busy/);
  assert.equal(b.heard.length, 0);
  assert.deepEqual((await b.rpc('status')).result, { listening: false, mic: true, busy: true });
  b.close();
});

test('notify shows a card and says the title', async () => {
  const b = await bridge();
  assert.deepEqual((await b.rpc('notify', { title: 'Build finished', text: 'All 212 tests pass.' })).result, { said: 'Build finished' });
  assert.deepEqual(b.heard, [['notify', { title: 'Build finished', text: 'All 212 tests pass.', line: 'Build finished' }]]);
  b.close();
});

test('ask returns the spoken answer, matched to a choice', async () => {
  const b = await bridge();
  assert.deepEqual((await b.rpc('ask', { question: 'Which branch?', choices: ['main', 'dev'] })).result, { answer: 'dev' });
  assert.deepEqual(b.heard, [['ask', 'Which branch? main, or dev?', { choices: ['main', 'dev'], yesNo: false }]]);
  b.close();
  const yn = await bridge({ answer: true });   // the card's Yes button
  assert.deepEqual((await yn.rpc('ask', { question: 'Deploy now?', choices: ['Yes', 'No'] })).result, { answer: 'yes' });
  assert.deepEqual(yn.heard[0], ['ask', 'Deploy now?', { choices: ['Yes', 'No'], yesNo: true }]);
  yn.close();
});

test('ask with the microphone off: only a yes/no (the card has buttons)', async () => {
  const b = await bridge({ mic: false, answer: false });
  assert.match((await b.rpc('ask', { question: 'Which branch?' })).error, /microphone is off/);
  assert.deepEqual((await b.rpc('ask', { question: 'Deploy?', choices: ['yes', 'no'] })).result, { answer: 'no' });
  b.close();
});

test('ask: silence is null after the timeout', async () => {
  const b = await bridge({ bridge: { ask: () => new Promise(() => {}), askMs: 50 } });
  assert.deepEqual((await b.rpc('ask', { question: 'Still there?' })).result, { answer: null });
  b.close();
});

test('answers: yes/no is strict, a choice must be said as a word, anything else comes back as said', () => {
  const yn = ['yes', 'no'];
  assert.equal(pickAnswer('yeah go ahead', yn), 'yes');
  assert.equal(pickAnswer('no thanks', yn), 'no');
  assert.equal(pickAnswer('hmm, maybe later', yn), 'no');   // unclear is a no
  assert.equal(pickAnswer(false, yn), 'no');
  assert.equal(pickAnswer(null, yn), null);
  assert.equal(pickAnswer('  ', ['a']), null);
  assert.equal(pickAnswer('maintain it', ['main', 'dev']), 'maintain it');   // "main" isn't in "maintain"
  assert.equal(pickAnswer('dev and main', ['dev', 'dev and main']), 'dev and main');
  assert.equal(pickAnswer('call it Ziggy', []), 'call it Ziggy');
});

// ---- the MCP server, spawned the way Claude Code runs it ----
function mcp(sock, args = []) {
  const p = spawn(process.execPath, [MCP, ...args], { env: { ...process.env, DIXI_BRIDGE_SOCK: sock }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); }
  });
  let n = 0;
  const req = (method, params) => new Promise((resolve) => { const id = ++n; waiting.set(id, resolve); p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const note = (method, params) => p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  return { req, note, stop: () => p.stdin.end(), exited: new Promise((r) => p.on('exit', r)) };
}

test('dixi-mcp answers initialize and tools/list, and tools/call reaches the bridge', async () => {
  const b = await bridge();
  const m = mcp(b.sock);
  const init = await m.req('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '9' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'dixi');
  assert.equal((await m.req('initialize', { protocolVersion: '2099-01-01' })).result.protocolVersion, '2025-11-25');
  m.note('notifications/initialized');
  assert.deepEqual((await m.req('ping')).result, {});
  const list = await m.req('tools/list', {});
  assert.deepEqual(list.result.tools.map((t) => t.name), ['dixi_say', 'dixi_notify', 'dixi_ask']);
  assert.match(list.result.tools[2].description, /away from the keyboard/);
  assert.equal(list.result.resultType, undefined);   // a legacy reply stays legacy
  const said = await m.req('tools/call', { name: 'dixi_say', arguments: { text: 'Tests pass.' } });
  assert.deepEqual(said.result, { content: [{ type: 'text', text: 'Said.' }], isError: false });
  assert.deepEqual(b.heard, [['say', 'Tests pass.']]);
  const fast = await m.req('tools/call', { name: 'dixi_notify', arguments: { title: 'Done' } });
  assert.equal(fast.result.isError, true);   // the rate limit, passed back so Claude Code can wait
  assert.match(fast.result.content[0].text, /Too fast/);
  assert.equal((await m.req('tools/call', { name: 'dixi_click', arguments: {} })).error.code, -32602);
  assert.equal((await m.req('resources/list')).error.code, -32601);
  m.stop(); assert.equal(await m.exited, 0);
  b.close();
});

test('dixi-mcp: modern (2026-07-28) requests, and dixi_ask', async () => {
  const b = await bridge();
  const m = mcp(b.sock);
  const _meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
  const disc = await m.req('server/discover', { _meta });
  assert.equal(disc.result.resultType, 'complete');
  assert.ok(disc.result.supportedVersions.includes('2026-07-28'));
  const list = await m.req('tools/list', { _meta });
  assert.equal(list.result.resultType, 'complete');
  assert.equal(typeof list.result.ttlMs, 'number');
  assert.equal(list.result._meta['io.modelcontextprotocol/serverInfo'].name, 'dixi');
  const old = await m.req('tools/list', { _meta: { ..._meta, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } });
  assert.equal(old.error.code, -32022);
  assert.equal(old.error.data.requested, '1900-01-01');
  assert.equal((await m.req('tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } })).error.code, -32602);
  const asked = await m.req('tools/call', { name: 'dixi_ask', arguments: { question: 'Which branch?', choices: ['main', 'dev'] }, _meta });
  assert.deepEqual(asked.result.content, [{ type: 'text', text: 'The user answered: dev' }]);
  m.stop(); await m.exited;
  b.close();
});

test('dixi-mcp with no Dixi running: a tool error, not a crash', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-'));
  const m = mcp(path.join(dir, 'dixi.sock'));
  const r = await m.req('tools/call', { name: 'dixi_say', arguments: { text: 'hello' } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /isn't running/);
  m.stop(); await m.exited;
});

test('--notify (the Stop hook) shows a card and exits 0', async () => {
  const b = await bridge();
  const m = mcp(b.sock, ['--notify', 'Claude Code finished']);
  assert.equal(await m.exited, 0);
  assert.equal(b.heard[0][0], 'notify');
  assert.equal(b.heard[0][1].line, 'Claude Code finished');
  b.close();
  const none = mcp(path.join(b.dir, 'gone', 'dixi.sock'), ['--notify', 'x']);
  assert.equal(await none.exited, 0);   // Dixi not running never blocks Claude Code
});
