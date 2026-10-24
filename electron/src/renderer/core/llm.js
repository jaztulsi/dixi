// LLM client for the renderer. The HTTP call happens in the main process (keys stay there); `transport`
// is injected so this runs in unit tests. Models are "provider:model" ids from the tier lists in
// src/main/providers.js. Per-model cooldowns after rate limits, abort, hedged requests, and the
// escalation router (decide: fast tier first, the strong tier when its answer fails a check) live here.

const tool = (name, description, properties = {}) => ({
  type: 'function',
  function: {
    name, description, strict: true,
    parameters: {
      type: 'object', additionalProperties: false, properties,
      ...(Object.keys(properties).length ? { required: Object.keys(properties).sort() } : {}),
    },
  },
});
const num = { type: 'number' }, str = { type: 'string' };

// Few, typed, safe tools. Mechanics (URLs, search boxes, waits) are done in code by the executor;
// the model only decides which element or what to type. No raw JavaScript, no arbitrary URLs.
export const TOOLS = [
  tool('click', 'Click an element by its index in the list.', { elementIndex: num }),
  tool('type_text', 'Type into an input by index; submit presses Enter.', { elementIndex: num, text: str, submit: { type: 'boolean' } }),
  tool('scroll', 'Scroll the page.', { direction: { type: 'string', enum: ['up', 'down'] } }),
  tool('search_site', 'Search this website for a query using its own search.', { query: str }),
  tool('go_back', 'Browser back.'),
  tool('wait', 'Wait for the page to finish loading.'),
  tool('done', 'Stop. success=false if the task could not be done; result says what happened in one short sentence.', { success: { type: 'boolean' }, result: str }),
];

/**
 * Does `v` fit this JSON schema? The subset the app's schemas use: type, required, properties,
 * additionalProperties:false, enum, items. Providers are asked for strict schemas; this catches the
 * ones that don't honor them, before anything acts on the answer.
 */
export function matches(schema, v) {
  if (!schema) return true;
  const types = [].concat(schema.type ?? []);
  const typeOk = !types.length || types.some((t) => (t === 'integer' ? Number.isInteger(v) : t === 'array' ? Array.isArray(v) : t === 'null' ? v === null
    : t === 'object' ? v != null && typeof v === 'object' && !Array.isArray(v) : typeof v === t));
  if (!typeOk) return false;
  if (schema.enum && !schema.enum.includes(v)) return false;
  if (Array.isArray(v)) return !schema.items || v.every((x) => matches(schema.items, x));
  if (v && typeof v === 'object') {
    if ((schema.required ?? []).some((k) => !(k in v))) return false;
    for (const [k, x] of Object.entries(v)) {
      if (schema.properties?.[k]) { if (!matches(schema.properties[k], x)) return false; } else if (schema.additionalProperties === false) return false;
    }
  }
  return true;
}

export const readsImages = (model) => /qwen|claude/.test(model);

/** Keeps reasoning models from spending latency on thinking. */
export function reasoningEffort(model) {
  if (!/^(groq|cerebras):/.test(model)) return null;
  if (/qwen/.test(model)) return 'none';
  if (/gpt-oss/.test(model)) return 'low';
  return null;
}

/** Only the newest page snapshot is sent in full; older ones shrink to their first lines, images dropped. */
export function compactingOldPages(messages) {
  const latest = messages.findLastIndex((m) => m.role === 'user');
  if (latest < 0) return messages;
  return messages.map((m, i) => {
    if (i === latest || m.role !== 'user') return m;
    const text = typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text).filter(Boolean).join('\n');
    return { ...m, content: text.split('\n').filter(Boolean).slice(0, 2).join('\n') + '\n(older page snapshot trimmed)' };
  });
}

export function strippingImages(messages) {
  return messages.map((m) => Array.isArray(m.content) ? { ...m, content: m.content.filter((p) => p.type !== 'image_url') } : m);
}

/** Per-model "rate limited until", shared by every caller so a limited model is skipped, not hammered. */
export class Cooldowns {
  constructor(now = () => Date.now()) { this.until = new Map(); this.now = now; }
  note(model, retryAfter) { this.until.set(model, this.now() + Math.min(Number(retryAfter) || 10, 60) * 1000); }
  cooling(model) { return (this.until.get(model) ?? 0) > this.now(); }
  secondsUntilAnyFree(models) {
    const soonest = Math.min(...models.map((m) => this.until.get(m) ?? 0));
    return Math.min(30, Math.max(1, (soonest - this.now()) / 1000));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;

export class LLM {
  /**
   * @param transport ({model, body, id}) => Promise<{status, retryAfter, json, ms}>
   * @param tiers {fast, strong, agent, answer}: lists of "provider:model"
   * @param abort (id) => void, cancels an in-flight request in the main process
   */
  /**
   * @param policy escalation policy from the main process (providers.js escalation()): lowConfidence etc.
   */
  constructor(transport, tiers, { cooldowns = new Cooldowns(), abort = () => {}, policy = {} } = {}) {
    this.transport = transport;
    this.tiers = tiers;
    this.cooldowns = cooldowns;
    this.abort = abort;
    this.policy = { schemaFail: true, validationFail: true, lowConfidence: 0.6, failuresBeforeEscalate: 2, ...policy };
    this.onRateLimit = null;
    this.onProblem = null;  // (message) => void: a key the provider refused
    this.calls = [];  // last calls {model, ms, status, tokens, usd, why}, for traces and benchmarks
    this.refused = new Set();
  }

  async call(model, body, signal, why = '') {
    const id = `r${nextId++}`;
    const onAbort = () => this.abort(id);
    signal?.addEventListener('abort', onAbort, { once: true });
    const effort = reasoningEffort(model);
    try {
      const res = await this.transport({ model, id, body: effort ? { ...body, reasoning_effort: effort } : body });
      this.calls.push({ t: Date.now(), model, ms: res.ms, status: res.status, tokens: res.json?.usage?.total_tokens ?? 0, usd: res.usd ?? 0, cached: Boolean(res.cached), why });
      if (this.calls.length > 200) this.calls.shift();
      if (res.status === 429) this.cooldowns.note(model, res.retryAfter);
      // A refused key is said once on screen; that provider is then skipped (its models cool for a minute).
      if (res.json?.error?.rejected) {
        this.cooldowns.note(model, 60);
        const p = model.split(':')[0];
        if (!this.refused.has(p)) { this.refused.add(p); this.onProblem?.(res.json.error.message); }
      }
      return res;
    } finally { signal?.removeEventListener('abort', onAbort); }
  }

  /**
   * The router: ask the first tier; if its answer doesn't parse, doesn't fit the schema, or fails
   * `check` (returns a reason string, e.g. 'lowConfidence'), ask the next tier (Claude). Each escalation
   * is recorded on the call (`why`) so traces and benchmarks show it.
   * @returns {value, tier, escalations: [{tier, why}]} — value null if every tier failed
   */
  async decide(system, user, { tiers = ['fast', 'strong'], schema = null, check = null, maxTokens = 400, signal = null, hedgeMs = 0 } = {}) {
    const escalations = [];
    let last = null;
    for (const tier of tiers) {
      const models = this.tiers[tier] ?? [];
      if (!models.length || signal?.aborted) continue;
      const before = this.calls.length;
      const raw = await this.json(system, user, models, maxTokens, { schema, signal, hedgeMs: escalations.length ? 0 : hedgeMs });
      if (escalations.length) for (const c of this.calls.slice(before)) c.why = escalations.at(-1).why;
      let v = null;
      try { v = JSON.parse(raw); } catch {}  // unparseable = a schema failure, handled below
      const why = v == null ? (raw == null ? 'noAnswer' : 'schemaFail') : !matches(schema, v) ? 'schemaFail' : (check?.(v) || null);
      if (!why) return { value: v, tier, escalations };
      if (v != null) last = { value: v, tier };
      escalations.push({ tier, why });
      // Only reasons the policy escalates on go further (noAnswer always does: nothing to act on).
      const key = why.startsWith('validation') ? 'validationFail' : why;
      if (why !== 'noAnswer' && this.policy[key] === false) break;
    }
    return { value: last?.value ?? null, tier: last?.tier ?? null, escalations, failed: true };
  }

  /** Tool-calling completion for the browser agent. Returns the assistant message. models: a tier's list. */
  async chat(messages, tools = TOOLS, signal, models = this.tiers.agent, why = '') {
    const compacted = compactingOldPages(messages);
    let last = null;
    for (let round = 0; round < 3 && !signal?.aborted; round++) {
      for (const model of models) {
        if (this.cooldowns.cooling(model)) continue;
        last = await this.call(model, { messages: readsImages(model) ? compacted : strippingImages(compacted), tools, tool_choice: 'required', max_tokens: 1024, temperature: 0 }, signal, why);
        if (last.status !== 429 && last.status !== 402) break;  // rate limited or past its spend cap: next model
      }
      if (last && last.status !== 429) break;
      if (round === 2) break;
      const wait = this.cooldowns.secondsUntilAnyFree(models);
      this.onRateLimit?.(Math.ceil(wait));
      await sleep(wait * 1000);
    }
    if (!models?.length) throw new Error('No model is set up for this (check the keys)');
    if (!last) throw new Error('All models are rate limited; try again in a few seconds.');
    if (last.status !== 200) throw new Error(`API error (${last.status}): ${last.json?.error?.message ?? 'unknown'}`);
    const message = last.json?.choices?.[0]?.message;
    if (!message) throw new Error('Invalid response from API');
    return message;
  }

  /** One JSON answer about a screenshot (vision models only). Returns the content string or null. */
  async vision(system, text, jpegBase64, models, { schema = null, signal = null, maxTokens = 200 } = {}) {
    const body = {
      max_tokens: maxTokens, temperature: 0,
      response_format: schema ? { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } } : { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } }] }],
    };
    for (const model of models.filter((m) => readsImages(m) && !this.cooldowns.cooling(m))) {
      if (signal?.aborted) return null;
      const res = await this.call(model, body, signal);
      if (res.status === 200) return res.json?.choices?.[0]?.message?.content ?? null;
    }
    return null;
  }

  /**
   * One JSON completion. Returns the content string or null.
   * opts.schema: strict JSON schema; opts.signal: AbortSignal; opts.hedgeMs: start the next model if the
   * first hasn't answered by then (first good answer wins, the other is aborted).
   */
  async json(system, user, models, maxTokens = 500, { schema = null, signal = null, hedgeMs = 0 } = {}) {
    const body = {
      max_tokens: maxTokens, temperature: 0,
      response_format: schema ? { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } } : { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
    const usable = models.filter((m) => !this.cooldowns.cooling(m));
    if (!usable.length) return null;
    const attempt = async (model, sig) => {
      const res = await this.call(model, body, sig);
      if (res.status !== 200) { if (res.status !== 499) console.error('[llm]', model, res.status, res.json?.error?.message); return null; }
      return res.json?.choices?.[0]?.message?.content ?? null;
    };
    if (hedgeMs > 0 && usable.length > 1) {
      const a = new AbortController(), b = new AbortController();
      signal?.addEventListener('abort', () => { a.abort(); b.abort(); }, { once: true });
      const first = attempt(usable[0], a.signal);
      const second = new Promise((resolve) => {
        const t = setTimeout(() => resolve(attempt(usable[1], b.signal)), hedgeMs);
        first.then((r) => { if (r != null) { clearTimeout(t); resolve(null); } });
      });
      const winner = await Promise.race([first.then((r) => r ?? second), second.then((r) => r ?? first)]);
      a.abort(); b.abort();
      if (winner != null) return winner;
      for (const m of usable.slice(2)) { const r = await attempt(m, signal); if (r != null) return r; }
      return null;
    }
    for (const model of usable) {
      if (signal?.aborted) return null;
      const r = await attempt(model, signal);
      if (r != null) return r;
    }
    return null;
  }
}
