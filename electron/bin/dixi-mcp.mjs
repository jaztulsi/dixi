#!/usr/bin/env node
// dixi-mcp: lets Claude Code talk to you out loud through Dixi. A small stdio MCP server in plain Node
// (no SDK): one JSON-RPC 2.0 message per line on stdin/stdout, logs only on stderr. Each tool call is
// passed to the running Dixi over its local socket (src/main/bridge.js) with the token from its file.
// It only talks and listens: there is no tool that clicks, types or looks at the screen.
//
//   claude mcp add dixi -- node /Users/jaz/dixi/electron/bin/dixi-mcp.mjs
//   node dixi-mcp.mjs --notify "Claude Code finished"      (one card + one spoken line, for hooks)
//
// Speaks both MCP eras (modelcontextprotocol.io, revision 2026-07-28): modern requests carry their
// version in _meta and need no handshake (server/discover is there for probing); older clients open
// with initialize (2025-11-25 and earlier), which is answered the old way.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const SOCK = process.env.DIXI_BRIDGE_SOCK || path.join(process.env.DIXI_USER_DATA || path.join(os.homedir(), 'Library/Application Support/Dixi'), 'dixi.sock');
const TOKEN_FILE = path.join(path.dirname(SOCK), 'bridge-token');
const MODERN = '2026-07-28';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'dixi', title: 'Dixi', version: '1.0.0' };
const NOT_RUNNING = "Dixi isn't running on this Mac (or is an older version without the Claude Code bridge), so nothing was said. Carry on without it.";
const INSTRUCTIONS = 'Dixi is the user\'s voice assistant on this Mac. These tools speak to the user out loud and hear their spoken answer, so they work when the user is away from the keyboard. Keep spoken text short and plain (no markdown, code or file paths read aloud). Never ask for passwords, keys or other secrets: answers are spoken in the room.';

const TOOLS = [
  {
    name: 'dixi_say',
    title: 'Say out loud',
    description: 'Say a short message to the user out loud through Dixi. Use it for news the user should hear while they may be away from the screen, e.g. "The tests pass; starting the deploy." One or two plain sentences, at most 400 characters. Dixi allows one line every 2 seconds and 10 a minute, so don\'t narrate every step.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 400, description: 'What to say, in plain spoken words.' } }, required: ['text'], additionalProperties: false },
  },
  {
    name: 'dixi_notify',
    title: 'Notify the user',
    description: 'Show a card in Dixi\'s panel and say its title out loud. Use it once when a long task finishes, fails, or is blocked and needs the user, e.g. title "The build finished", text "All 212 tests pass. The app is in dist/."',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string', maxLength: 80, description: 'A few words; this part is spoken.' },
      text: { type: 'string', maxLength: 400, description: 'Detail for the card (shown, not spoken).' },
    }, required: ['title'], additionalProperties: false },
  },
  {
    name: 'dixi_ask',
    title: 'Ask out loud',
    description: 'Ask the user a question out loud through Dixi and wait up to 60 seconds for their spoken answer. Use it when you need a decision from the user and they may be away from the keyboard. For a yes/no decision pass choices ["yes","no"] (they can also press a button) and you get back "yes" or "no"; for pick-one questions pass up to 6 short choices and you get back the one they said, or their own words. If nobody answers you are told so: then carry on with what doesn\'t need the answer, or ask in the terminal. Never use it for passwords, keys or other secrets.',
    inputSchema: { type: 'object', properties: {
      question: { type: 'string', maxLength: 300, description: 'One short spoken question.' },
      choices: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 6, description: 'Optional answers to pick from, e.g. ["yes","no"].' },
    }, required: ['question'], additionalProperties: false },
  },
];

// ---- one request to the running Dixi over its socket ----
function call(method, params, ms = 10000) {
  return new Promise((resolve, reject) => {
    let token;
    try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return reject(new Error(NOT_RUNNING)); }
    const c = net.createConnection(SOCK);
    const timer = setTimeout(() => { c.destroy(); reject(new Error('Dixi did not answer in time.')); }, ms);
    let buf = '';
    c.setEncoding('utf8');
    c.on('connect', () => c.write(`${JSON.stringify({ token, id: 1, method, params })}\n`));
    c.on('data', (d) => {
      buf += d;
      const i = buf.indexOf('\n');
      if (i < 0) return;
      clearTimeout(timer); c.end();
      let r;
      try { r = JSON.parse(buf.slice(0, i)); } catch { return reject(new Error('Dixi sent a reply that is not JSON.')); }
      if (r.error) reject(new Error(`Dixi: ${r.error}`)); else resolve(r.result);
    });
    c.on('error', (e) => { clearTimeout(timer); reject(new Error(['ENOENT', 'ECONNREFUSED'].includes(e.code) ? NOT_RUNNING : e.message)); });
  });
}

async function runTool(name, a) {
  if (name === 'dixi_say') { await call('say', { text: a.text }); return 'Said.'; }
  if (name === 'dixi_notify') { await call('notify', { title: a.title, text: a.text }); return 'Shown and said.'; }
  const { answer } = await call('ask', { question: a.question, choices: a.choices }, 75000);
  return answer == null ? 'No answer: the user did not reply within 60 seconds.' : `The user answered: ${answer}`;
}

// ---- MCP: one message in, at most one message out ----
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

async function handle(msg) {
  const { id, method } = msg ?? {};
  if (id === undefined || id === null) return null;   // a notification (initialized, cancelled): no reply
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const meta = params._meta ?? {};
  const version = meta['io.modelcontextprotocol/protocolVersion'];
  const modern = version !== undefined;
  if (modern && version !== MODERN) return fail(id, -32022, 'Unsupported protocol version', { supported: [MODERN, ...LEGACY], requested: version });
  if (modern && !meta['io.modelcontextprotocol/clientCapabilities']) return fail(id, -32602, 'Missing io.modelcontextprotocol/clientCapabilities in _meta');
  // Modern results say what they are and who answered; legacy ones stay as they were.
  const done = (r) => ok(id, modern ? { resultType: 'complete', ...r, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER } } : r);

  switch (method) {
    case 'initialize':
      return ok(id, { protocolVersion: LEGACY.includes(params.protocolVersion) ? params.protocolVersion : LEGACY[0], capabilities: { tools: {} }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    case 'server/discover':
      return done({ supportedVersions: [MODERN, ...LEGACY], capabilities: { tools: {} }, instructions: INSTRUCTIONS, ...(modern ? { ttlMs: 3600000, cacheScope: 'public' } : {}) });
    case 'ping':
      return done({});
    case 'tools/list':
      return done({ tools: TOOLS, ...(modern ? { ttlMs: 3600000, cacheScope: 'public' } : {}) });
    case 'tools/call': {
      if (!TOOLS.some((t) => t.name === params.name)) return fail(id, -32602, `Unknown tool: ${params.name}`);
      try { return done({ content: [{ type: 'text', text: await runTool(params.name, params.arguments ?? {}) }], isError: false }); }
      catch (e) { return done({ content: [{ type: 'text', text: e.message }], isError: true }); }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

// ---- hook mode: one card and one spoken line, then exit (always 0, so a hook never blocks Claude) ----
const n = process.argv.indexOf('--notify');
if (n > 0) {
  const title = process.argv[n + 1] || 'Claude Code finished';
  call('notify', { title, text: `In ${path.basename(process.cwd())}` })
    .catch((e) => console.error(`dixi-mcp: ${e.message}`))
    .finally(() => process.exit(0));
} else {
  // ---- server mode: requests are answered as they finish (a 60 s question doesn't hold up the rest) ----
  const cancelled = new Set();
  const out = (m) => { if (m && !cancelled.delete(m.id)) process.stdout.write(`${JSON.stringify(m)}\n`); };
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return out(fail(null, -32700, 'Parse error')); }
    if (msg?.method === 'notifications/cancelled') return void cancelled.add(msg.params?.requestId);
    handle(msg).then(out, (e) => out(fail(msg.id ?? null, -32603, e.message)));
  });
  rl.on('close', () => process.exit(0));
}
