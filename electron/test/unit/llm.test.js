import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LLM, Cooldowns, reasoningEffort } from '../../src/renderer/core/llm.js';
import { chat, Spend } from '../../src/main/providers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const okReply = (content, ms = 0) => sleep(ms).then(() => ({ status: 200, json: { choices: [{ message: { content } }] } }));

test('hedged request: a slow first model is overtaken by the second; the loser is aborted', async () => {
  const aborted = [];
  const llm = new LLM(({ model }) => (model === 'slow' ? okReply('slow', 300) : okReply('fast', 20)), {}, { abort: (id) => aborted.push(id) });
  const t0 = Date.now();
  assert.equal(await llm.json('s', 'u', ['slow', 'fast'], 50, { hedgeMs: 50 }), 'fast');
  assert.ok(Date.now() - t0 < 200);
});

test('rate-limited models cool down and are skipped', async () => {
  const seen = [];
  const llm = new LLM(({ model }) => { seen.push(model); return model === 'a' ? { status: 429, retryAfter: '5', json: {} } : okReply('b'); }, {});
  assert.equal(await llm.json('s', 'u', ['a', 'b']), 'b');
  assert.equal(await llm.json('s', 'u', ['a', 'b']), 'b');
  assert.deepEqual(seen, ['a', 'b', 'b']);
});

test('reasoning effort per provider/model family', () => {
  assert.equal(reasoningEffort('groq:qwen/qwen3.8-27b'), 'none');
  assert.equal(reasoningEffort('groq:openai/gpt-oss-20b'), 'low');
  assert.equal(reasoningEffort('cerebras:gpt-oss-120b'), null);
});

test('providers: spend cap stops calls; keys never needed in the renderer', async () => {
  const spend = new Spend('/dev/null/none', 0.000001);
  spend.add('groq:openai/gpt-oss-20b', { prompt_tokens: 100000, completion_tokens: 0 });
  const r = await chat({ keys: { groq: 'k' }, env: {} }, spend, { model: 'groq:openai/gpt-oss-20b', body: {} }, async () => { throw new Error('should not call'); });
  assert.equal(r.status, 402);
  const none = await chat({ keys: {}, env: {} }, null, { model: 'groq:x', body: {} });
  assert.equal(none.status, 401);
});

test('providers: Anthropic replies come back in the same shape as the others', async () => {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.tool_choice.name, 'emit');
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { steps: [] } }], usage: { input_tokens: 10, output_tokens: 2 } }), { status: 200 });
  };
  const r = await chat({ keys: { anthropic: 'k' }, env: {} }, null, { model: 'anthropic:claude-haiku-5-5', body: { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], response_format: { type: 'json_schema', json_schema: { schema: { type: 'object' } } } } }, fetchImpl);
  assert.equal(r.json.choices[0].message.content, '{"steps":[]}');
});

test('cooldowns', () => {
  let now = 0;
  const c = new Cooldowns(() => now);
  c.note('m', '2');
  assert.equal(c.cooling('m'), true);
  now = 2500;
  assert.equal(c.cooling('m'), false);
});
