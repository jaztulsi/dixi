// B2: planner latency. The same ~1.5 KB planner prompt (structured JSON, ~150 tokens out), 10 runs each:
//   claude-haiku-5-5 (Anthropic Messages API, streamed, cache_control on the system prompt)
//   Groq openai/gpt-oss-120b (streamed, OpenAI-style; and the app's own providers.js chat(), as ask.js calls it)
// cold = a new connection every call ("connection: close"); warm = keep-alive after one warm-up call.
// TTFT = first streamed content; total = last byte. Writes qa/results/b2-<stamp>.json.  node qa/b2-planner.js [--runs 10]
import fs from 'node:fs';
import path from 'node:path';
import { QA, APP } from './app.js';

const { loadConfig } = await import(path.join(APP, 'src/main/config.js'));
const { chat, Spend, ENDPOINTS } = await import(path.join(APP, 'src/main/providers.js'));
const config = loadConfig();
const ledger = path.join(QA, 'results', `.b2-spend-${Date.now()}.json`);
const spend = new Spend(ledger, 5);   // priced with the app's own table; the shared ledger isn't touched
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1] || 10) || 10;
const pct = (xs, p) => { const s = [...xs].filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };

const SYSTEM = `You plan voice commands for a Mac assistant. Split what the user said into the tasks they asked for, in the order they said them, and return JSON only.
Each step has: "app" (the Mac app or website the step happens in, as the user would name it), "action" (one of open, search, play, pause, create, add_event, message, move_file, rename_file, set_volume, open_url, click, type, other), "args" (an object with only the details the user gave: query, title, date, time, text, to, path, name, level) and "route" ("script" when an AppleScript or a URL can do it, "screen" when only clicking on screen can).
Rules: never invent details the user didn't say; keep the user's words for titles and messages; a step that depends on the one before it says so with "after": the index of that step; "it", "that", "there" refer to the thing from the step before; volume levels are 0 to 100; dates stay as said ("Friday", "tomorrow at 5"); a website named without an app is an open_url step in the default browser.
Never add steps the user didn't ask for: no confirmations, no summaries, no "check" steps. If a part of the command is unclear, keep it as action "other" with the words in args.text rather than guessing.
Examples of good splits, for shape only:
"turn it down and open Notes" → set_volume (level lower), open Notes.
"play the new Taylor Swift album on Spotify, then text Sam I'm on my way" → search + play in Spotify, then message Sam.
"find yesterday's invoice PDF and move it to Documents" → move_file with the description in args.text.
"open youtube and search cat videos and play the first one" → open_url, search, then play with "after" pointing at the search.
Return {"steps": [...]} and nothing else.`.repeat(1);
const USER = "Open Apple Music, search lo-fi beats, and play it, then turn the volume down and add my math test on Friday to my school calendar";
const SCHEMA = { type: 'object', additionalProperties: false, required: ['steps'], properties: { steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['app', 'action', 'args', 'route'],
  properties: { app: { type: 'string' }, action: { type: 'string' }, route: { type: 'string', enum: ['script', 'screen'] }, after: { type: 'integer' },
    args: { type: 'object', additionalProperties: false, properties: { query: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, text: { type: 'string' }, to: { type: 'string' }, path: { type: 'string' }, name: { type: 'string' }, level: { type: 'integer' } } } } } } } };

/** POST and read the stream: → { ttft, total, status, text, usage }. */
async function streamed(url, headers, body, cold) {
  const t0 = performance.now();
  const res = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', ...(cold ? { connection: 'close' } : {}) }, body: JSON.stringify(body) });
  let ttft = null, text = '', buf = '', usage = {};
  if (res.status !== 200) return { ttft, total: performance.now() - t0, status: res.status, text, usage, error: (await res.text()).slice(0, 200), retryAfter: Number(res.headers.get('retry-after')) || null };
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
      const piece = j.delta?.text ?? j.choices?.[0]?.delta?.content ?? '';
      if (piece && ttft == null) ttft = performance.now() - t0;
      text += piece;
      if (j.message?.usage) Object.assign(usage, j.message.usage);
      if (j.usage) Object.assign(usage, j.usage);
      if (j.x_groq?.usage) Object.assign(usage, j.x_groq.usage);
    }
  }
  return { ttft, total: performance.now() - t0, status: res.status, text, usage };
}
const haikuWith = (schema) => (cold) => streamed(ENDPOINTS.anthropic.url, { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01' }, {
  model: 'claude-haiku-5-5', max_tokens: 1024, stream: true,
  system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: USER }],
  ...(schema ? { output_config: { format: { type: 'json_schema', schema: SCHEMA } } } : {}),
}, cold);
const haiku = haikuWith(true), haikuFree = haikuWith(false);
const groq = (cold) => streamed(ENDPOINTS.groq.url, { authorization: `Bearer ${config.keys.groq}` }, {
  model: 'openai/gpt-oss-120b', stream: true, max_tokens: 1024, temperature: 0, reasoning_effort: 'low',
  messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }], response_format: { type: 'json_object' },
}, cold);
// The app's own path (ask.js → providers.js chat()), not streamed: total only.
const groqChat = async (cold) => {
  const t0 = performance.now();
  const f = cold ? (u, o) => fetch(u, { ...o, headers: { ...o.headers, connection: 'close' } }) : fetch;
  const r = await chat(config, spend, { model: 'groq:openai/gpt-oss-120b', body: { messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }], max_tokens: 1024, temperature: 0, reasoning_effort: 'low', response_format: { type: 'json_object' } } }, f);
  return { ttft: null, total: performance.now() - t0, status: r.status, text: r.json?.choices?.[0]?.message?.content ?? '', usage: r.json?.usage ?? {}, error: r.status === 200 ? undefined : JSON.stringify(r.json ?? r.error ?? '').slice(0, 200) };
};

const out = { at: new Date().toISOString(), systemBytes: Buffer.byteLength(SYSTEM), user: USER, runs: RUNS, results: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A 429 waits out retry-after and tries once more; the count is reported, since the app would hit it too.
const once = async (fn, cold, rl) => { let r = await fn(cold); if (r.status === 429) { rl.n++; await sleep((r.retryAfter ?? 10) * 1000); r = await fn(cold); } return r; };
for (const [name, fn] of [['haiku', haiku], ['haiku-noschema', haikuFree], ['groq-stream', groq], ['groq-chat', groqChat]]) {
  for (const mode of ['cold', 'warm']) {
    if (mode === 'warm') await fn(false).catch(() => {});   // open the connection first
    const rs = [], rl = { n: 0 };
    for (let i = 0; i < RUNS; i++) {
      const r = await once(fn, mode === 'cold', rl).catch((err) => ({ status: 0, total: null, ttft: null, text: '', error: err.message }));
      if (name.startsWith('haiku')) spend.add('anthropic:claude-haiku-5-5', r.usage); else if (name === 'groq-stream') spend.add('groq:openai/gpt-oss-120b', r.usage);   // groq-chat: chat() adds it
      let valid = false; try { valid = Array.isArray(JSON.parse(r.text).steps); } catch {}
      rs.push({ ttft: r.ttft && Math.round(r.ttft), total: r.total && Math.round(r.total), status: r.status, valid, usage: r.usage, error: r.error });
    }
    out.results[`${name}/${mode}`] = { ttftP50: pct(rs.map((r) => r.ttft), 50), ttftP90: pct(rs.map((r) => r.ttft), 90), totalP50: pct(rs.map((r) => r.total), 50), totalP90: pct(rs.map((r) => r.total), 90),
      ok: rs.filter((r) => r.status === 200 && r.valid).length, rateLimited: rl.n, statuses: rs.map((r) => r.status), outTokensP50: pct(rs.map((r) => r.usage?.output_tokens ?? r.usage?.completion_tokens), 50),
      usageFirst: rs[0]?.usage, error: rs.find((r) => r.error)?.error, runs: rs };
    { const { usageFirst, runs, ...o } = out.results[`${name}/${mode}`]; console.log(name.padEnd(15), mode, JSON.stringify(o)); }
  }
}
out.usd = Number(spend.total.toFixed(4)); fs.rmSync(ledger, { force: true });
console.log('usd', out.usd);
fs.writeFileSync(path.join(QA, 'results', `b2-${out.at.replace(/[:.]/g, '-')}.json`), JSON.stringify(out, null, 1));
