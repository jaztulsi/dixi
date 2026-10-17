// Model and service providers: endpoints, keys, tiers, prices, spend cap, record/replay.
// Main process only (keys never cross to the renderer). Swap models with env, no code changes:
//   DIXI_FAST="groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b"   interpreter (first that has a key wins; rest = fallbacks)
//   DIXI_STRONG=...   escalation when the fast parse fails validation
//   DIXI_AGENT=...    browser-agent steps     DIXI_ANSWER=...  page Q&A
// This file is the one place provider endpoints live (the literal scan allows it).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ENDPOINTS = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: 'GROQ_API_KEY', style: 'openai' },
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', key: 'CEREBRAS_API_KEY', style: 'openai' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', key: 'ANTHROPIC_API_KEY', style: 'anthropic' },
  brave: { url: 'https://api.search.brave.com/res/v1/web/search', key: 'BRAVE_API_KEY' },
  deepgram: { url: 'wss://api.deepgram.com/v2/listen', key: 'DEEPGRAM_API_KEY' },
  elevenlabs: { url: 'https://api.elevenlabs.io', stt: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime', key: 'ELEVENLABS_API_KEY' },
  // Keyless fallbacks for resolving names: a public knowledge base and an HTML web search.
  wikidata: { url: 'https://www.wikidata.org/w/api.php' },
  websearch: { url: 'https://html.duckduckgo.com/html/?q={q}' },
};

// USD per 1M tokens [input, output]. Estimates where the provider page didn't say; used only for the cap.
const PRICES = {
  'groq:openai/gpt-oss-20b': [0.075, 0.3], 'groq:openai/gpt-oss-120b': [0.15, 0.6], 'groq:qwen/qwen3.8-27b': [0.29, 0.59],
  // Deliberately on the high side so a per-provider cap (DIXI_CAP_CEREBRAS, DIXI_CAP_ANTHROPIC) trips early, never late.
  'cerebras:gpt-oss-120b': [0.5, 1], 'cerebras:qwen-3.8-27b': [0.6, 1.2],
  'anthropic:claude-haiku-5-5': [1.5, 7.5], 'anthropic:claude-sonnet-5-5': [4, 20],
};

const DEFAULT_TIERS = {
  // Fastest first (Cerebras ~0.25 s with thinking off), free Groq quotas as fallbacks.
  fast: 'cerebras:qwen-3.8-27b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b',
  strong: 'cerebras:gpt-oss-120b,groq:openai/gpt-oss-120b,anthropic:claude-haiku-5-5',
  agent: 'cerebras:gpt-oss-120b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-120b',
  // Spoken answers (page or general knowledge): fast first; Claude Haiku is the hedge if it's slow.
  answer: 'cerebras:gpt-oss-120b,anthropic:claude-haiku-5-5,groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b',
  // Reading screenshots when nothing on the page is labelled (icon-only buttons): strongest first.
  vision: 'anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5,groq:qwen/qwen3.8-27b',
};

export function tiers(config) {
  const out = {};
  for (const [tier, def] of Object.entries(DEFAULT_TIERS)) {
    const list = (config.env[`DIXI_${tier.toUpperCase()}`] || def).split(',').map((s) => s.trim()).filter(Boolean);
    out[tier] = list.filter((m) => config.keys[m.split(':')[0]]);
  }
  return out;
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
    try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    this.total = d.totalUSD ?? 0; this.by = d.byProvider ?? {}; this.readAt = Date.now();
  }
  add(model, usage) {
    const [pin, pout] = PRICES[model] ?? [5, 25];
    const usd = ((usage?.prompt_tokens ?? usage?.input_tokens ?? 0) * pin + (usage?.completion_tokens ?? usage?.output_tokens ?? 0) * pout) / 1e6;
    this.read();
    const p = model.split(':')[0];
    this.total += usd; this.by[p] = (this.by[p] ?? 0) + usd;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ totalUSD: this.total, byProvider: this.by, updated: new Date().toISOString() })); } catch {}
    return usd;
  }
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

/**
 * One chat completion in OpenAI shape, whatever the provider.
 * @param req {model: "provider:model", body: OpenAI chat body without model, id?}
 * @returns {status, retryAfter, json, ms, cached}
 */
export async function chat(config, spend, req, fetchImpl = fetch) {
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
  let res0 = false;  // the request went out (an abort after this may still be billed)
  if (req.id) inflight.set(req.id, ctrl);
  const t0 = performance.now();
  try {
    const init = ep.style === 'anthropic' ? anthropicRequest(key, model, req.body, config.env.ANTHROPIC_WORKSPACE_ID) : {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...forProvider(provider, req.body), model }),
    };
    res0 = true;
    const res = await fetchImpl(ep.url, { method: 'POST', ...init, signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(60_000)]) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 300) } }; }
    if (ep.style === 'anthropic' && res.status === 200) json = fromAnthropic(json);
    const out = { status: res.status, retryAfter: res.headers.get('retry-after'), json, ms: Math.round(performance.now() - t0) };
    if (res.status === 200) {
      out.usd = spend?.add(req.model, json.usage) ?? 0;
      if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); }
    }
    return out;
  } catch (err) {
    if (err.name === 'AbortError' && res0) spend?.add(req.model, { prompt_tokens: Math.ceil(JSON.stringify(req.body).length / 3) });
    return { status: err.name === 'AbortError' ? 499 : 0, json: { error: { message: `Network error: ${err.message}` } }, ms: Math.round(performance.now() - t0) };
  } finally {
    if (req.id) inflight.delete(req.id);
  }
}

// Provider quirks kept here, not in the callers.
function forProvider(provider, body) {
  const b = { ...body };
  if (provider !== 'groq' && provider !== 'cerebras') delete b.reasoning_effort;
  if (provider === 'cerebras' && b.response_format?.type === 'json_schema') b.response_format = { ...b.response_format };
  return b;
}

// Anthropic Messages API ⇄ OpenAI chat shape (system prompt, JSON-schema output via a forced tool).
// workspace: ANTHROPIC_WORKSPACE_ID, needed only for a key that isn't scoped to a workspace.
function anthropicRequest(key, model, body, workspace) {
  const system = body.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const part = (p) => (p.type === 'image_url'
    ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(p.image_url.url).replace(/^data:image\/\w+;base64,/, '') } }
    : { type: 'text', text: p.text ?? '' });
  const messages = body.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : m.content.map(part) }));
  const schema = body.response_format?.json_schema?.schema;
  // No temperature: current Claude models reject it.
  const payload = { model, max_tokens: body.max_tokens ?? 1024, system, messages };
  if (schema) Object.assign(payload, { tools: [{ name: 'emit', description: 'Return the result.', input_schema: schema }], tool_choice: { type: 'tool', name: 'emit' } });
  return { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(workspace ? { 'anthropic-workspace-id': workspace } : {}) }, body: JSON.stringify(payload) };
}
function fromAnthropic(j) {
  const tool = j.content?.find((c) => c.type === 'tool_use');
  const text = tool ? JSON.stringify(tool.input) : (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { choices: [{ message: { role: 'assistant', content: text } }], usage: { prompt_tokens: j.usage?.input_tokens ?? 0, completion_tokens: j.usage?.output_tokens ?? 0 } };
}
