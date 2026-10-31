// MCP tools in Dixi: each server you list in mcp.json (in Dixi's settings folder, on this Mac only; never
// from a link) is started, and its tools join the registry. Rules, because a server's text and tools are
// someone else's code: its descriptions are capped and marked as coming from it, and the server never sees
// Dixi's keys.
// MCP stdio transport: one JSON-RPC 2.0 message per line.
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/** mcp.json → [{ name, command, args, env }]. Missing or broken file: none. */
export function loadMcpConfig(dir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8'));
    return Object.entries(j.servers ?? j.mcpServers ?? {}).filter(([, s]) => typeof s?.command === 'string')
      .map(([name, s]) => ({ name: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'server', command: s.command, args: (s.args ?? []).map(String), env: s.env ?? {} }));
  } catch { return []; }
}

/** Starts one server and lists its tools. → { name, tools, call(tool, args, { signal }), close() } */
export async function connectMcp({ name, command, args = [], env = {} }, { spawn = nodeSpawn, timeoutMs = 15000 } = {}) {
  // Only what a program needs to run, plus the server's own settings: no API keys from Dixi's environment.
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
  const waiting = new Map();
  let seq = 0, dead = null;
  const fail = (err) => { dead = err; for (const w of waiting.values()) w.reject(err); waiting.clear(); };
  child.on('error', fail);
  child.on('exit', () => fail(new Error(`${name} stopped`)));
  child.stdin.on('error', () => {});
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let m; try { m = JSON.parse(line); } catch { return; }
    const w = m.id != null && waiting.get(m.id);
    if (!w) return;   // a notification or a request from the server: Dixi offers it nothing back
    waiting.delete(m.id);
    m.error ? w.reject(new Error(String(m.error.message ?? 'error').slice(0, 200))) : w.resolve(m.result);
  });
  const request = (method, params, signal) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('it took too long')); }, timeoutMs);
    signal?.addEventListener('abort', () => { clearTimeout(timer); waiting.delete(id); reject(new Error('stopped')); }, { once: true });
    waiting.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const close = () => { try { child.kill(); } catch {} };
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dixi', version: '1.0.0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = [];
    let cursor;
    do {   // ponytail: at most 10 pages of tools
      const r = await request('tools/list', cursor ? { cursor } : {});
      tools.push(...(r?.tools ?? []));
      cursor = r?.nextCursor;
    } while (cursor && tools.length < 500 && seq < 12);
    return { name, tools, close,
      async call(tool, args, { signal } = {}) {
        const r = await request('tools/call', { name: tool, arguments: args ?? {} }, signal);
        const text = (r?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').slice(0, 20000);
        if (r?.isError) throw new Error(text.slice(0, 200) || `${tool} failed`);
        return text;
      } };
  } catch (err) { close(); throw err; }
}

/** A server's tools as registry tools. They're only callable by the agent (no spoken match). */
export function mcpTools(conn) {
  return conn.tools.filter((t) => typeof t?.name === 'string').slice(0, 100).map((t) => {
    const name = `${conn.name}__${t.name}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 64);
    return {
      name: /^[a-z]/.test(name) ? name : `m_${name}`.slice(0, 64),
      source: `mcp:${conn.name}`,
      // Someone else's words: short, and labelled, so the model treats them as a tool, not an instruction.
      description: `(Tool from ${conn.name}) ${String(t.description ?? '').replace(/\s+/g, ' ').slice(0, 300)}`,
      input_schema: t.inputSchema?.type === 'object' ? t.inputSchema : { type: 'object', properties: {} },
      run: async (args, deps) => ({ text: await conn.call(t.name, args, deps), title: t.name }),
      timeoutMs: 30000,
    };
  });
}
