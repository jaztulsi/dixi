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
  'cerebras:gpt-oss-120b': [0.35, 0.75], 'cerebras:qwen-3.8-27b': [0.4, 0.8],
  'anthropic:claude-haiku-5-5': [0.1, 0.5], 'anthropic:claude-sonnet-5-5': [3, 15],
};

const DEFAULT_TIERS = {
  fast: 'cerebras:qwen-3.8-27b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b',
  strong: 'groq:openai/gpt-oss-120b,cerebras:gpt-oss-120b,anthropic:claude-haiku-5-5',
  agent: 'groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-120b',
  answer: 'groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b',
  // Reading screenshots when nothing on the page is labelled (icon-only buttons): strongest first.
  vision: 'anthropic:claude-sonnet-5-5,groq:qwen/qwen3.8-27b',
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

// ---- spend meter (stops calls past the cap) ----
export class Spend {
  constructor(file, capUSD) { this.file = file; this.cap = capUSD; try { this.total = JSON.parse(fs.readFileSync(file, 'utf8')).totalUSD ?? 0; } catch { this.total = 0; } }
  add(model, usage) {
    const [pin, pout] = PRICES[model] ?? [1, 3];
    const usd = ((usage?.prompt_tokens ?? usage?.input_tokens ?? 0) * pin + (usage?.completion_tokens ?? usage?.output_tokens ?? 0) * pout) / 1e6;
    this.total += usd;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ totalUSD: this.total, updated: new Date().toISOString() })); } catch {}
    return usd;
  }
  get over() { return this.cap > 0 && this.total >= this.cap; }
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
  if (spend?.over) return { status: 402, json: { error: { message: `Spend cap of $${spend.cap} reached` } } };
  const mode = config.env.DIXI_LLM_CACHE;  // "replay" | "record" | "both"
  const file = mode && cacheFile(config.env.DIXI_LLM_CACHE_DIR, { m: req.model, b: req.body });
  if (file && mode !== 'record' && fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), cached: true };
  if (mode === 'replay') return { status: 503, json: { error: { message: 'not in the replay cache' } } };

  const ctrl = new AbortController();
  if (req.id) inflight.set(req.id, ctrl);
  const t0 = performance.now();
  try {
    const init = ep.style === 'anthropic' ? anthropicRequest(key, model, req.body) : {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...forProvider(provider, req.body), model }),
    };
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
    return { status: err.name === 'AbortError' ? 499 : 0, json: { error: { message: `Network error: ${err.message}` } }, ms: Math.round(performance.now() - t0) };
  } finally {
    if (req.id) inflight.delete(req.id);
  }
}

// Provider quirks kept here, not in the callers.
function forProvider(provider, body) {
  const b = { ...body };
  if (provider !== 'groq') delete b.reasoning_effort;
  if (provider === 'cerebras' && b.response_format?.type === 'json_schema') b.response_format = { ...b.response_format };
  return b;
}

// Anthropic Messages API ⇄ OpenAI chat shape (system prompt, JSON-schema output via a forced tool).
function anthropicRequest(key, model, body) {
  const system = body.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const part = (p) => (p.type === 'image_url'
    ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(p.image_url.url).replace(/^data:image\/\w+;base64,/, '') } }
    : { type: 'text', text: p.text ?? '' });
  const messages = body.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : m.content.map(part) }));
  const schema = body.response_format?.json_schema?.schema;
  const payload = { model, max_tokens: body.max_tokens ?? 1024, system, messages, temperature: body.temperature ?? 0 };
  if (schema) Object.assign(payload, { tools: [{ name: 'emit', description: 'Return the result.', input_schema: schema }], tool_choice: { type: 'tool', name: 'emit' } });
  return { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(payload) };
}
function fromAnthropic(j) {
  const tool = j.content?.find((c) => c.type === 'tool_use');
  const text = tool ? JSON.stringify(tool.input) : (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { choices: [{ message: { role: 'assistant', content: text } }], usage: { prompt_tokens: j.usage?.input_tokens ?? 0, completion_tokens: j.usage?.output_tokens ?? 0 } };
}
