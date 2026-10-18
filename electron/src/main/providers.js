// Model and service providers: endpoints, keys, tiers, prices, spend cap, record/replay.
// Main process only (keys never cross to the renderer).
//
// DIXI_MODE picks who does what (default hybrid):
//   hybrid    Cerebras for the fast, frequent calls; Claude plans shopping commands, takes over when
//             the fast answer fails its checks, and verifies carts.
//   cerebras  Cerebras only.     claude  Claude only.
// Any tier can still be overridden: DIXI_FAST="cerebras:<model>,anthropic:claude-haiku-5-5" (first usable
// model wins, the rest are fallbacks); likewise DIXI_PLAN, DIXI_STRONG, DIXI_HARD, DIXI_AGENT,
// DIXI_ANSWER, DIXI_VISION, DIXI_CHECK. DIXI_ESCALATE (JSON) tunes when a fast answer goes to Claude.
// This file is the one place provider endpoints live (the literal scan allows it).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ENDPOINTS = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: 'GROQ_API_KEY', style: 'openai', label: 'Groq' },
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', models: 'https://api.cerebras.ai/v1/models', key: 'CEREBRAS_API_KEY', style: 'openai', label: 'Cerebras' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', models: 'https://api.anthropic.com/v1/models?limit=100', key: 'ANTHROPIC_API_KEY', style: 'anthropic', label: 'Anthropic' },
  brave: { url: 'https://api.search.brave.com/res/v1/web/search', key: 'BRAVE_API_KEY' },
  deepgram: { url: 'wss://api.deepgram.com/v2/listen', key: 'DEEPGRAM_API_KEY' },
  elevenlabs: { url: 'https://api.elevenlabs.io', stt: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime', key: 'ELEVENLABS_API_KEY' },
  // Keyless fallbacks for resolving names: a public knowledge base and an HTML web search.
  wikidata: { url: 'https://www.wikidata.org/w/api.php' },
  websearch: { url: 'https://html.duckduckgo.com/html/?q={q}' },
};

// USD per 1M tokens [input, output]. Cerebras and Groq are estimates on the high side; Anthropic's are its list prices.
const PRICES = {
  'groq:openai/gpt-oss-20b': [0.075, 0.3], 'groq:openai/gpt-oss-120b': [0.15, 0.6], 'groq:qwen/qwen3.8-27b': [0.29, 0.59],
  'cerebras:gpt-oss-120b': [0.5, 1], 'cerebras:qwen-3.8-27b': [0.6, 1.2],
  'anthropic:claude-haiku-5-5': [0.1, 0.5], 'anthropic:claude-sonnet-5-5': [2, 10], 'anthropic:claude-opus-5-5': [4, 20],
};
// A model not in the table (a newly listed one) is priced high for its provider, so a cap trips early, never late.
const PROVIDER_PRICE = { groq: [1, 2], cerebras: [1, 2], anthropic: [5, 25] };
export const priceOf = (model) => PRICES[model] ?? PROVIDER_PRICE[model.split(':')[0]] ?? [5, 25];

// "{cerebras}" = the best Cerebras model found at startup (discoverModels), "{cerebras:2}" = the next one.
const MODES = {
  hybrid: {
    plan: 'anthropic:claude-sonnet-5-5',          // understanding a shopping command
    fast: '{cerebras},{cerebras:2}',               // understanding anything else; picks, variants, checks
    strong: 'anthropic:claude-sonnet-5-5',        // a fast answer that failed its checks
    hard: 'anthropic:claude-opus-5-5',            // the strong tier failed too (stuck agent)
    agent: '{cerebras},{cerebras:2}',              // next click/type in the fallback browser agent
    answer: '{cerebras},anthropic:claude-haiku-5-5',
    vision: 'anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5',
    check: 'anthropic:claude-haiku-5-5',          // final cart verification, sensitive pages
  },
  cerebras: { plan: '{cerebras}', fast: '{cerebras},{cerebras:2}', strong: '{cerebras:2},{cerebras}', hard: '', agent: '{cerebras},{cerebras:2}', answer: '{cerebras},{cerebras:2}', vision: '', check: '{cerebras}' },
  claude: {
    plan: 'anthropic:claude-sonnet-5-5', fast: 'anthropic:claude-haiku-5-5', strong: 'anthropic:claude-sonnet-5-5', hard: 'anthropic:claude-opus-5-5',
    agent: 'anthropic:claude-sonnet-5-5', answer: 'anthropic:claude-haiku-5-5', vision: 'anthropic:claude-sonnet-5-5', check: 'anthropic:claude-haiku-5-5',
  },
};
export const modeOf = (config) => (MODES[config.env.DIXI_MODE] ? config.env.DIXI_MODE : 'hybrid');

// When a fast answer is handed to the strong tier (DIXI_ESCALATE='{"lowConfidence":0.7}' to tune).
const ESCALATE = { schemaFail: true, validationFail: true, lowConfidence: 0.6, failuresBeforeEscalate: 2, unexpectedPage: true, sensitive: true, finalCartCheck: true };
export function escalation(config) {
  let o = {};
  try { o = JSON.parse(config.env.DIXI_ESCALATE || '{}'); } catch { console.warn('[providers] DIXI_ESCALATE is not JSON; using defaults'); }
  return { ...ESCALATE, ...Object.fromEntries(Object.entries(o).filter(([k]) => k in ESCALATE)) };
}

/** Tier → usable "provider:model" list. found = discoverModels() result (Cerebras models, best first). */
export function tiers(config, found = {}) {
  const cer = found.cerebras ?? [];
  const fill = (m) => (m === '{cerebras}' ? (cer[0] ? `cerebras:${cer[0]}` : '') : m === '{cerebras:2}' ? (cer[1] ? `cerebras:${cer[1]}` : '') : m);
  const out = {};
  for (const [tier, def] of Object.entries(MODES[modeOf(config)])) {
    const list = (config.env[`DIXI_${tier.toUpperCase()}`] || def).split(',').map((s) => fill(s.trim())).filter(Boolean);
    out[tier] = [...new Set(list)].filter((m) => config.keys[m.split(':')[0]] && !found.rejected?.[m.split(':')[0]]);
  }
  return out;
}

/** What's wrong with the keys for this mode, in words for the screen (never the keys themselves). */
export function problems(config, found = {}) {
  const mode = modeOf(config);
  const wanted = Object.entries(MODES[mode]).flatMap(([tier]) => (config.env[`DIXI_${tier.toUpperCase()}`] || MODES[mode][tier]).split(','));
  const need = new Set(wanted.map((m) => m.trim()).filter(Boolean).map((m) => (m.startsWith('{cerebras') ? 'cerebras' : m.split(':')[0])));
  const out = [];
  for (const p of need) {
    const ep = ENDPOINTS[p];
    if (!ep) continue;
    if (!config.keys[p]) out.push(`${ep.key} is not set (DIXI_MODE=${mode} needs it)`);
    else if (found.rejected?.[p]) out.push(`${ep.label} rejected ${ep.key} (HTTP ${found.rejected[p]})`);
    else if (p === 'cerebras' && found.listed?.cerebras && !found.cerebras?.length) out.push('Cerebras lists no models for this key');
  }
  // A Claude model this key can't use (retired, or not enabled for the workspace).
  if (found.anthropic?.length) {
    for (const m of new Set(wanted.map((x) => x.trim()).filter((x) => x.startsWith('anthropic:')))) {
      if (!found.anthropic.includes(m.slice(10))) out.push(`${m.slice(10)} isn't available on this Anthropic key`);
    }
  }
  return out;
}

const listedModels = async (provider, config, fetchImpl) => {
  const ep = ENDPOINTS[provider];
  const headers = provider === 'anthropic'
    ? { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01', ...(config.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': config.env.ANTHROPIC_WORKSPACE_ID } : {}) }
    : { Authorization: `Bearer ${config.keys[provider]}` };
  try {
    const r = await fetchImpl(ep.models, { headers, signal: AbortSignal.timeout(5000) });
    if (r.status === 401 || r.status === 403) return { rejected: r.status };
    if (!r.ok) return { error: r.status };
    return { ids: ((await r.json()).data ?? []).map((m) => m.id).filter(Boolean) };
  } catch (err) { return { error: err.message }; }
};

/**
 * Which models these keys can use, asked of the providers themselves (no model names assumed).
 * Cerebras order: the benchmark's ranking (npm run bench:models writes `file`) for models still listed,
 * then the provider's own order. A key the provider refuses is reported, never silently skipped.
 */
export async function discoverModels(config, { fetchImpl = fetch, file = null } = {}) {
  const found = { cerebras: [], anthropic: [], rejected: {}, listed: {} };
  await Promise.all(['cerebras', 'anthropic'].filter((p) => config.keys[p]).map(async (p) => {
    const r = await listedModels(p, config, fetchImpl);
    if (r.rejected) found.rejected[p] = r.rejected;
    if (r.ids) { found[p] = r.ids; found.listed[p] = true; }
    if (r.error) console.warn(`[providers] couldn't list ${p} models: ${r.error}`);
  }));
  let ranked = [];
  try { ranked = JSON.parse(fs.readFileSync(file, 'utf8')).cerebras ?? []; } catch {}  // no benchmark run yet
  // Offline (no listing): the last ranking as is, so recorded test runs replay with the same models.
  found.cerebras = found.listed.cerebras ? [...ranked.filter((m) => found.cerebras.includes(m)), ...found.cerebras.filter((m) => !ranked.includes(m))] : ranked;
  return found;
}

/** Which providers have keys (names only; values stay here). */
export function keyStatus(config) {
  return Object.fromEntries(Object.keys(ENDPOINTS).map((p) => [p, Boolean(config.keys[p]) || !ENDPOINTS[p].key]));
}

// ---- spend meter (stops calls past the cap: overall, and per provider with DIXI_CAP_<PROVIDER>) ----
// One ledger file for the app and every test run (re-read before each write), so caps hold across both.
export class Spend {
  constructor(file, capUSD, caps = {}) { this.file = file; this.cap = capUSD; this.caps = caps; this.read(); }
  read() {
    let d = {};
    try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}  // first run: no ledger yet
    this.total = d.totalUSD ?? 0; this.by = d.byProvider ?? {}; this.readAt = Date.now();
  }
  add(model, usage, flat = 0) {
    const [pin, pout] = priceOf(model);
    // Cached prompt reads cost a tenth of input, cache writes a quarter more (Anthropic).
    const tokens = (usage?.prompt_tokens ?? usage?.input_tokens ?? 0) * pin + (usage?.completion_tokens ?? usage?.output_tokens ?? 0) * pout
      + (usage?.cache_read_input_tokens ?? 0) * pin * 0.1 + (usage?.cache_creation_input_tokens ?? 0) * pin * 1.25;
    const usd = flat + tokens / 1e6;
    this.read();
    const p = model.split(':')[0];
    this.total += usd; this.by[p] = (this.by[p] ?? 0) + usd;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ totalUSD: this.total, byProvider: this.by, updated: new Date().toISOString() })); } catch (err) { console.warn('[spend] ledger not saved:', err.message); }
    return usd;
  }
  /** A flat fee (a provider's web search), not tokens. */
  addUSD(provider, usd) { return this.add(`${provider}:fee`, null, usd); }
  get over() { return this.cap > 0 && this.total >= this.cap; }
  overFor(provider) {
    if (Date.now() - this.readAt > 5000) this.read();  // another Dixi (a test run) may have spent too
    return this.over || (this.caps[provider] > 0 && (this.by[provider] ?? 0) >= this.caps[provider]);
  }
}

// ---- record / replay (evals: same request → same answer, no cost) ----
function cacheFile(dir, req) {
  return path.join(dir, crypto.createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0, 32) + '.json');
}

const inflight = new Map();  // request id → AbortController
export function abort(id) { inflight.get(id)?.abort(); inflight.delete(id); }
const sleep = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

/**
 * One chat completion in OpenAI shape, whatever the provider.
 * Transient failures (5xx, 529 overloaded, a dropped connection) are retried twice with exponential
 * backoff and jitter; a 429 with a short retry-after is retried once, a longer one is returned so the
 * caller moves to another model. Timeouts aren't retried (the time is already spent).
 * @param req {model: "provider:model", body: OpenAI chat body without model, id?}
 * @returns {status, retryAfter, json, ms, cached, attempts}
 */
export async function chat(config, spend, req, fetchImpl = fetch, { backoffMs = 250 } = {}) {
  const [provider, ...rest] = req.model.split(':');
  const model = rest.join(':');
  const ep = ENDPOINTS[provider];
  const key = config.keys[provider];
  if (!ep?.style) return { status: 400, json: { error: { message: `Unknown provider ${provider}` } } };
  if (!key) return { status: 401, json: { error: { message: `${ep.key} is not set` } } };
  if (spend?.overFor?.(provider)) return { status: 402, json: { error: { message: `Spend cap reached for ${provider}` } } };
  const mode = config.env.DIXI_LLM_CACHE;  // "replay" | "record" | "both"
  const file = mode && cacheFile(config.env.DIXI_LLM_CACHE_DIR, { m: req.model, b: req.body });
  if (file && mode !== 'record' && fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), cached: true };
  if (mode === 'replay') return { status: 503, json: { error: { message: 'not in the replay cache' } } };

  const ctrl = new AbortController();
  if (req.id) inflight.set(req.id, ctrl);
  const t0 = performance.now();
  const init = ep.style === 'anthropic' ? anthropicRequest(key, model, req.body, config.env.ANTHROPIC_WORKSPACE_ID) : {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...forProvider(provider, req.body), model }),
  };
  try {
    for (let attempt = 1; ; attempt++) {
      const out = await once(ep, init, ctrl, fetchImpl, req, spend);
      out.ms = Math.round(performance.now() - t0);
      out.attempts = attempt;
      if (out.status === 200) {
        if (ep.style === 'anthropic') out.json = fromAnthropic(out.json);
        out.usd = spend?.add(req.model, out.json.usage) ?? 0;
        if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); }
        return out;
      }
      if (out.status === 401 || out.status === 403) out.json = { error: { message: `${ep.label} rejected ${ep.key} (HTTP ${out.status})`, rejected: true } };
      const wait = Number(out.retryAfter);
      const retry = !ctrl.signal.aborted && ((out.status === 0 || out.status >= 500) ? attempt <= 2 : out.status === 429 && attempt === 1 && wait > 0 && wait <= 2);
      if (!retry) return out;
      await sleep(out.status === 429 ? wait * 1000 : backoffMs * 3 ** (attempt - 1) * (0.75 + Math.random() / 2), ctrl.signal);
    }
  } finally {
    if (req.id) inflight.delete(req.id);
  }
}

async function once(ep, init, ctrl, fetchImpl, req, spend) {
  let sent = false;  // the request went out (an abort after this may still be billed)
  try {
    sent = true;
    const res = await fetchImpl(ep.url, { method: 'POST', ...init, signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(60_000)]) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 300) } }; }
    return { status: res.status, retryAfter: res.headers.get('retry-after'), json };
  } catch (err) {
    if (err.name === 'AbortError' && sent) spend?.add(req.model, { prompt_tokens: Math.ceil(JSON.stringify(req.body).length / 3) });
    const status = err.name === 'AbortError' ? 499 : err.name === 'TimeoutError' ? 408 : 0;
    return { status, json: { error: { message: `Network error: ${err.message}` } } };
  }
}

// Provider quirks kept here, not in the callers.
function forProvider(provider, body) {
  const b = { ...body };
  if (provider !== 'groq' && provider !== 'cerebras') delete b.reasoning_effort;
  if (provider === 'cerebras' && b.response_format?.type === 'json_schema') b.response_format = { ...b.response_format };
  return b;
}

// ---- Anthropic Messages API ⇄ OpenAI chat shape ----
// JSON answers use structured outputs (output_config.format): forced tool_choice is a 400 on Sonnet 5.5
// and Opus 5.5. Thinking is kept to its lowest setting for speed, in the form each model accepts.
const LOW_THINKING = [
  [/sonnet-5-5/, { thinking: { type: 'between_tools' } }],
  [/opus-5-5|fable/, { output_config: { effort: 'low' } }],   // thinking can't be turned off here
  [/haiku-5-5/, { thinking: { type: 'disabled' } }],
];
const FORCED_TOOL_OK = (model) => !/(sonnet|opus)-5-5|fable/.test(model);

/** OpenAI-shape messages → Anthropic messages: tool calls and results as blocks, same-role turns merged. */
function anthropicMessages(messages) {
  const part = (p) => (p.type === 'image_url'
    ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(p.image_url.url).replace(/^data:image\/\w+;base64,/, '') } }
    : { type: 'text', text: p.text ?? '' });
  const out = [];
  for (const m of messages.filter((x) => x.role !== 'system')) {
    let role = m.role === 'assistant' ? 'assistant' : 'user', content;
    if (m.role === 'tool') content = [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') }];
    else if (m.role === 'assistant') {
      content = [];
      if (m.content) content.push({ type: 'text', text: String(m.content) });
      for (const c of m.tool_calls ?? []) {
        let input = {};
        try { input = JSON.parse(c.function.arguments || '{}'); } catch {}  // a malformed call replays as no arguments
        content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
      }
    } else content = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content ?? []).map(part);
    if (!content.length) continue;
    if (out.at(-1)?.role === role) out.at(-1).content.push(...content);
    else out.push({ role, content });
  }
  return out;
}

// workspace: ANTHROPIC_WORKSPACE_ID, needed only for a key that isn't scoped to a workspace.
export function anthropicRequest(key, model, body, workspace) {
  // One block per system message; the cache mark goes on the last one, so tools + system prompt are cached.
  const system = body.messages.filter((m) => m.role === 'system').map((m) => ({ type: 'text', text: String(m.content) }));
  if (system.length) system.at(-1).cache_control = { type: 'ephemeral' };
  // No temperature: current Claude models reject it.
  const payload = { model, max_tokens: body.max_tokens ?? 1024, system, messages: anthropicMessages(body.messages) };
  for (const [re, extra] of LOW_THINKING) if (re.test(model)) { Object.assign(payload, structuredClone(extra)); break; }
  const schema = body.response_format?.json_schema?.schema;
  if (schema) payload.output_config = { ...payload.output_config, format: { type: 'json_schema', schema } };
  if (body.tools?.length) {
    payload.tools = body.tools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters, strict: true }));
    payload.tools.at(-1).cache_control = { type: 'ephemeral' };
    // "required": the caller checks a call was made (llm.chat) where the model can't be forced.
    payload.tool_choice = body.tool_choice === 'required' && FORCED_TOOL_OK(model) ? { type: 'any', disable_parallel_tool_use: true } : { type: 'auto', disable_parallel_tool_use: true };
  }
  return { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(workspace ? { 'anthropic-workspace-id': workspace } : {}) }, body: JSON.stringify(payload) };
}

export function fromAnthropic(j) {
  const text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const calls = (j.content ?? []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } }));
  const u = j.usage ?? {};
  return {
    choices: [{ message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: j.stop_reason }],
    usage: { prompt_tokens: u.input_tokens ?? 0, completion_tokens: u.output_tokens ?? 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0, cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      total_tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) },
  };
}
