// LLM client for the renderer. The HTTP call happens in the main process (keys stay there); `transport`
// is injected so this runs in unit tests. Models are "provider:model" ids from the tier lists in
// src/main/providers.js. Per-model cooldowns after rate limits, abort, and hedged requests live here.

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

export const readsImages = (model) => /qwen/.test(model);

/** Keeps reasoning models from spending latency on thinking. */
export function reasoningEffort(model) {
  if (!model.startsWith('groq:')) return null;
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
  constructor(transport, tiers, { cooldowns = new Cooldowns(), abort = () => {} } = {}) {
    this.transport = transport;
    this.tiers = tiers;
    this.cooldowns = cooldowns;
    this.abort = abort;
    this.onRateLimit = null;
    this.calls = [];  // last calls {model, ms, status, tokens}, for traces
  }

  async call(model, body, signal) {
    const id = `r${nextId++}`;
    const onAbort = () => this.abort(id);
    signal?.addEventListener('abort', onAbort, { once: true });
    const effort = reasoningEffort(model);
    try {
      const res = await this.transport({ model, id, body: effort ? { ...body, reasoning_effort: effort } : body });
      this.calls.push({ model, ms: res.ms, status: res.status, tokens: res.json?.usage?.total_tokens ?? 0, cached: Boolean(res.cached) });
      if (this.calls.length > 50) this.calls.shift();
      if (res.status === 429) this.cooldowns.note(model, res.retryAfter);
      return res;
    } finally { signal?.removeEventListener('abort', onAbort); }
  }

  /** Tool-calling completion for the browser agent. Returns the assistant message. */
  async chat(messages, tools = TOOLS, signal) {
    const compacted = compactingOldPages(messages);
    const models = this.tiers.agent;
    let last = null;
    for (let round = 0; round < 3 && !signal?.aborted; round++) {
      for (const model of models) {
        if (this.cooldowns.cooling(model)) continue;
        last = await this.call(model, { messages: readsImages(model) ? compacted : strippingImages(compacted), tools, tool_choice: 'required', max_tokens: 1024, temperature: 0 }, signal);
        if (last.status !== 429) break;
      }
      if (last && last.status !== 429) break;
      if (round === 2) break;
      const wait = this.cooldowns.secondsUntilAnyFree(models);
      this.onRateLimit?.(Math.ceil(wait));
      await sleep(wait * 1000);
    }
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
