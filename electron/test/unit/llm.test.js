import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LLM, TOOLS, SUB_AGENT_TOOLS, Cooldowns, compactingOldPages, strippingImages, reasoningEffort } from '../../src/renderer/core/llm.js';

const config = { agentModel: 'qwen/qwen3.8-27b', voiceModel: 'openai/gpt-oss-20b' };
const ok = (msg) => ({ status: 200, json: { choices: [{ message: msg }] } });

test('tool schemas: no empty "required" (Groq rejects it), sub-agents cannot fork', () => {
  const goBack = TOOLS.find((t) => t.function.name === 'go_back');
  assert.equal('required' in goBack.function.parameters, false);
  for (const t of TOOLS) {
    const p = t.function.parameters;
    if (p.required) assert.deepEqual([...p.required].sort(), Object.keys(p.properties).sort(), t.function.name);
  }
  assert.equal(SUB_AGENT_TOOLS.some((t) => ['fork_tasks', 'new_tab', 'switch_tab'].includes(t.function.name)), false);
});

test('only the newest page snapshot is sent in full; old screenshots dropped', () => {
  const page = (img) => ({ role: 'user', content: [{ type: 'text', text: 'Current URL: u\nPage title: t\n\nInteractive elements:\n[0] a' }, ...(img ? [{ type: 'image_url', image_url: { url: 'x' } }] : [])] });
  const msgs = [{ role: 'system', content: 's' }, page(true), { role: 'assistant', content: null }, page(true)];
  const out = compactingOldPages(msgs);
  assert.equal(out[1].content, 'Current URL: u\nPage title: t\n(older page snapshot trimmed)');
  assert.equal(out[3], msgs[3]);
  assert.equal(strippingImages(out)[3].content.length, 1);
});

test('reasoning effort per model', () => {
  assert.equal(reasoningEffort('qwen/qwen3.8-27b'), 'none');
  assert.equal(reasoningEffort('openai/gpt-oss-120b'), 'low');
  assert.equal(reasoningEffort('other'), null);
});

test('429 falls back to the next model; images stripped for text-only models', async () => {
  const sent = [];
  const llm = new LLM(async (body) => { sent.push(body); return body.model.startsWith('qwen') ? { status: 429, retryAfter: '5' } : ok({ tool_calls: [] }); }, config);
  const msgs = [{ role: 'user', content: [{ type: 'text', text: 'p' }, { type: 'image_url', image_url: { url: 'x' } }] }];
  await llm.chat(msgs);
  assert.deepEqual(sent.map((b) => b.model), ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']);
  assert.equal(sent[0].messages[0].content.length, 2, 'qwen gets the screenshot');
  assert.equal(sent[1].messages[0].content.length, 1, 'gpt-oss gets text only');
  assert.equal(sent[0].reasoning_effort, 'none');
  // A model in cooldown is skipped, not hammered.
  sent.length = 0;
  await llm.chat(msgs);
  assert.deepEqual(sent.map((b) => b.model), ['openai/gpt-oss-120b']);
});

test('cooldowns', () => {
  let now = 0;
  const c = new Cooldowns(() => now);
  c.note('m', '5');
  assert.equal(c.cooling('m'), true);
  assert.equal(c.secondsUntilAnyFree(['m']), 5);
  now = 6000;
  assert.equal(c.cooling('m'), false);
});

test('json(): first healthy model wins, errors give null', async () => {
  const llm = new LLM(async (b) => (b.model === 'a' ? { status: 429 } : { status: 200, json: { choices: [{ message: { content: '{"x":1}' } }] } }), config);
  assert.equal(await llm.json('s', 'u', ['a', 'b']), '{"x":1}');
  const bad = new LLM(async () => ({ status: 500, json: { error: { message: 'boom' } } }), config);
  assert.equal(await bad.json('s', 'u', ['b']), null);
});
