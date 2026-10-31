// One quick text answer from the main process: the first model in the list that answers wins. Groq first
// (gpt-oss-120b answered a cited one-liner in ~0.3 s here), then the fallbacks. chatFn is providers.js
// chat() bound to config and spend, so keys, spend caps and record/replay all still apply.
export const FAST_MODELS = ['groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b', 'cerebras:gpt-oss-120b', 'anthropic:claude-haiku-5-5'];

export function makeAsk(chatFn, models = FAST_MODELS, { log = () => {}, now = () => performance.now() } = {}) {
  return async (system, user, { maxTokens = 400 } = {}) => {
    let why = 'no model is set up';
    for (const model of models) {
      const t0 = now();
      const r = await chatFn({ model, body: { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.2,
        ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}) } }).catch((err) => ({ status: 0, json: { error: { message: err.message } } }));
      const text = r?.json?.choices?.[0]?.message?.content;
      log({ step: 'model', model, ok: r?.status === 200 && Boolean(text), ms: Math.round(now() - t0) });
      if (r?.status === 200 && text) return text;
      why = r?.json?.error?.message ?? `status ${r?.status}`;
    }
    throw new Error(why);
  };
}
