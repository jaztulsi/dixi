// Groq chat completions, called from the renderer over IPC so the key stays in the main process.
// Returns { status, retryAfter, json } and leaves model fallback / cooldowns to the caller (llm.js).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_BODY_BYTES = 1_500_000; // screenshots are ~100 KB base64; anything bigger is a bug

export function allowedModels(config) {
  return new Set([config.agentModel, config.voiceModel, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
}

export async function groqChat(config, body, fetchImpl = fetch) {
  if (!config.groqAPIKey) return { status: 401, json: { error: { message: 'GROQ_API_KEY is not set in .env' } } };
  if (!body || !allowedModels(config).has(body.model)) {
    return { status: 400, json: { error: { message: `Model not allowed: ${body?.model}` } } };
  }
  const payload = JSON.stringify(body);
  if (payload.length > MAX_BODY_BYTES) return { status: 413, json: { error: { message: 'Request too large' } } };

  try {
    const res = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqAPIKey}`, 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 300) } }; }
    return { status: res.status, retryAfter: res.headers.get('retry-after'), json };
  } catch (err) {
    return { status: 0, json: { error: { message: `Network error: ${err.message}` } } };
  }
}
