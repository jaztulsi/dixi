// Groq client logic (ported from LLMService.swift + GroqJSON.swift): tool schemas, history
// compaction, per-model fallback and shared rate-limit cooldowns. The HTTP call itself happens
// in the main process (keys stay there); `transport` is injected so this runs in unit tests.

// Kept terse on purpose: tool schemas are resent on every agent step and count against the free
// tier's tokens/min. Property names are self-explanatory, so most have no description.
const tool = (name, description, properties = {}) => ({
  type: 'function',
  function: {
    name, description, strict: true,
    parameters: {
      type: 'object', additionalProperties: false, properties,
      // Groq rejects "required" when there are no properties (go_back), even if empty.
      ...(Object.keys(properties).length ? { required: Object.keys(properties).sort() } : {}),
    },
  },
});
const num = { type: 'number' }, str = { type: 'string' };

export const TOOLS = [
  tool('click', 'Click element by index.', { elementIndex: num }),
  tool('type_text', "Replace an input's text; pressEnter submits.", { elementIndex: num, text: str, pressEnter: { type: 'boolean' } }),
  tool('scroll', 'Scroll the page.', { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number', description: 'pixels' } }),
  tool('navigate', 'Go to a URL.', { url: str }),
  tool('wait', 'Wait for content to load (max 10s).', { seconds: num }),
  tool('new_tab', 'Open a URL in a new tab.', { url: str }),
  tool('switch_tab', 'Switch tab by 0-based index.', { tabIndex: num }),
  tool('go_back', 'Browser back.'),
  tool('evaluate_js', 'Run JavaScript in the page; returns the result as text.', { code: str }),
  tool('fork_tasks', 'Run independent tasks in parallel, each in its own tab (max 5).', {
    tasks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['task', 'url'],
      properties: { url: { type: 'string', description: 'start URL' }, task: str } } },
  }),
  tool('done', 'Task complete; give a short summary.', { result: str }),
];
/** Sub-agents can't fork or juggle tabs (no recursion, no conflicts). */
export const SUB_AGENT_TOOLS = TOOLS.filter((t) => !['fork_tasks', 'new_tab', 'switch_tab'].includes(t.function.name));

export const FALLBACK_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
export const readsImages = (model) => model.startsWith('qwen/');

/** Keeps reasoning models from spending latency and max_tokens on thinking. */
export function reasoningEffort(model) {
  if (model.startsWith('qwen/')) return 'none';           // hybrid model: "none" = instruct mode
  if (model.startsWith('openai/gpt-oss')) return 'low';   // always reasons; "low" is the minimum
  return null;
}

/**
 * Only the newest page snapshot is sent in full. Older user (page-state) messages shrink to their
 * URL + title lines and lose screenshots: keeps each step under the free tier's tokens/min and
 * Groq's 3-images-per-request cap. The task lives in the system prompt, so nothing essential is lost.
 */
export function compactingOldPages(messages) {
  const latest = messages.findLastIndex((m) => m.role === 'user');
  if (latest < 0) return messages;
  return messages.map((m, i) => {
    if (i === latest || m.role !== 'user') return m;
    const text = typeof m.content === 'string' ? m.content
      : (m.content ?? []).map((p) => p.text).filter(Boolean).join('\n');
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
  /** Seconds until the first of `models` is usable again (1...30). */
  secondsUntilAnyFree(models) {
    const soonest = Math.min(...models.map((m) => this.until.get(m) ?? 0));
    return Math.min(30, Math.max(1, (soonest - this.now()) / 1000));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class LLM {
  /**
   * @param transport (body) => Promise<{status, retryAfter, json}>, the main-process Groq call
   * @param config {agentModel, voiceModel}
   */
  constructor(transport, config, cooldowns = new Cooldowns()) {
    this.transport = transport;
    this.config = config;
    this.cooldowns = cooldowns;
    this.onRateLimit = null;
  }

  get agentModels() { return [this.config.agentModel, ...FALLBACK_MODELS.filter((m) => m !== this.config.agentModel)]; }

  /** Tool-calling completion for the browser agent. Returns the assistant message. */
  async chat(messages, tools = TOOLS) {
    const compacted = compactingOldPages(messages);
    const models = this.agentModels;
    let last = null;
    for (let round = 0; round < 3; round++) {
      for (const model of models) {
        if (this.cooldowns.cooling(model)) continue;
        const body = {
          model,
          // Text-only fallbacks get the page snapshot without the screenshot instead of a 400.
          messages: readsImages(model) ? compacted : strippingImages(compacted),
          tools, tool_choice: 'required', max_tokens: 1024,
        };
        const effort = reasoningEffort(model);
        if (effort) body.reasoning_effort = effort;
        last = await this.transport(body);
        if (last.status !== 429) break;
        this.cooldowns.note(model, last.retryAfter);
      }
      if (last && last.status !== 429) break;
      if (round === 2) break;
      const wait = this.cooldowns.secondsUntilAnyFree(models);
      this.onRateLimit?.(Math.ceil(wait));
      await sleep(wait * 1000);
    }
    if (!last) throw new Error('All Groq models are rate limited; try again in a few seconds.');
    if (last.status !== 200) throw new Error(`API error (${last.status}): ${last.json?.error?.message ?? 'unknown'}`);
    const message = last.json?.choices?.[0]?.message;
    if (!message) throw new Error('Invalid response from API');
    return message;
  }

  /** One JSON-mode completion (voice intent, page Q&A). Returns content string or null. */
  async json(system, user, models, maxTokens = 500) {
    for (const model of models) {
      if (this.cooldowns.cooling(model)) continue;
      const body = {
        model, max_tokens: maxTokens, temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      };
      const effort = reasoningEffort(model);
      if (effort) body.reasoning_effort = effort;
      const res = await this.transport(body);
      if (res.status === 429) { this.cooldowns.note(model, res.retryAfter); continue; }
      if (res.status !== 200) { console.error('[groq]', model, res.status, res.json?.error?.message); return null; }
      return res.json?.choices?.[0]?.message?.content ?? null;
    }
    return null;
  }
}
