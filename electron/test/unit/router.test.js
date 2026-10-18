// The model stack: modes, discovery, key problems, Claude request shapes, retries, the escalation router.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LLM, matches } from '../../src/renderer/core/llm.js';
import { badCall } from '../../src/renderer/core/agent.js';
import { chat, tiers, problems, discoverModels, anthropicRequest, fromAnthropic, escalation } from '../../src/main/providers.js';

const keys = { cerebras: 'c', anthropic: 'a' };
const found = { cerebras: ['fast-one', 'other-one'], anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], rejected: {}, listed: { cerebras: true } };
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers });

test('modes: hybrid splits the work, cerebras-only and claude-only use one provider each', () => {
  const h = tiers({ keys, env: {} }, found);
  assert.deepEqual(h.fast, ['cerebras:fast-one', 'cerebras:other-one']);
  assert.deepEqual(h.plan, ['anthropic:claude-sonnet-5-5']);
  assert.deepEqual(h.hard, ['anthropic:claude-opus-5-5']);
  const c = tiers({ keys, env: { DIXI_MODE: 'cerebras' } }, found);
  assert.ok(Object.values(c).flat().every((m) => m.startsWith('cerebras:')));
  const a = tiers({ keys, env: { DIXI_MODE: 'claude' } }, found);
  assert.ok(Object.values(a).flat().every((m) => m.startsWith('anthropic:')));
  // An explicit tier override still wins.
  assert.deepEqual(tiers({ keys, env: { DIXI_FAST: 'anthropic:claude-haiku-5-5' } }, found).fast, ['anthropic:claude-haiku-5-5']);
});

test('a missing or refused key is reported in words, and that provider is not used', () => {
  assert.deepEqual(problems({ keys: { anthropic: 'a' }, env: {} }, found), ['CEREBRAS_API_KEY is not set (DIXI_MODE=hybrid needs it)']);
  const refused = { ...found, rejected: { anthropic: 401 } };
  assert.match(problems({ keys, env: {} }, refused).join(), /Anthropic rejected ANTHROPIC_API_KEY \(HTTP 401\)/);
  assert.deepEqual(tiers({ keys, env: {} }, refused).plan, []);
  assert.deepEqual(problems({ keys: { anthropic: 'a' }, env: { DIXI_MODE: 'claude' } }, found), []);
});

test('model discovery: the benchmark ranking first (if still listed), then the provider order', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-')), 'models.json');
  fs.writeFileSync(file, JSON.stringify({ cerebras: ['b', 'gone'] }));
  const fetchImpl = async (url) => (url.includes('cerebras') ? json({ data: [{ id: 'a' }, { id: 'b' }] }) : json({ error: {} }, 401));
  const f = await discoverModels({ keys, env: {} }, { fetchImpl, file });
  assert.deepEqual(f.cerebras, ['b', 'a']);
  assert.equal(f.rejected.anthropic, 401);
});

test('Claude requests: thinking off in the form each model takes, never a forced tool on Sonnet/Opus 5.5', () => {
  const body = { messages: [{ role: 'system', content: 'rules' }, { role: 'system', content: 'task' }, { role: 'user', content: 'page' }], tools: [{ type: 'function', function: { name: 'click', description: 'd', parameters: { type: 'object' } } }], tool_choice: 'required' };
  const sonnet = JSON.parse(anthropicRequest('k', 'claude-sonnet-5-5', body).body);
  assert.deepEqual(sonnet.thinking, { type: 'between_tools' });
  assert.equal(sonnet.tool_choice.type, 'auto');
  assert.equal(sonnet.system.length, 2);
  assert.ok(sonnet.system[1].cache_control && !sonnet.system[0].cache_control);
  assert.ok(sonnet.tools[0].cache_control && sonnet.tools[0].strict);
  const opus = JSON.parse(anthropicRequest('k', 'claude-opus-5-5', body).body);
  assert.deepEqual(opus.output_config, { effort: 'low' });
  assert.equal(opus.thinking, undefined);
  assert.equal(JSON.parse(anthropicRequest('k', 'claude-haiku-5-5', body).body).tool_choice.type, 'any');
});

test('Claude agent history: tool calls and results become blocks; same-role turns merge', () => {
  const msgs = [{ role: 'system', content: 's' }, { role: 'user', content: 'p1' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't1', function: { name: 'click', arguments: '{"elementIndex":0}' } }] },
    { role: 'tool', tool_call_id: 't1', content: 'ok' }, { role: 'user', content: 'p2' }];
  const p = JSON.parse(anthropicRequest('k', 'claude-haiku-5-5', { messages: msgs }).body);
  assert.deepEqual(p.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(p.messages[1].content[0], { type: 'tool_use', id: 't1', name: 'click', input: { elementIndex: 0 } });
  assert.deepEqual(p.messages[2].content.map((c) => c.type), ['tool_result', 'text']);
  const back = fromAnthropic({ content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', id: 'x', name: 'done', input: { success: true, result: 'r' } }], usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 100 } });
  assert.equal(back.choices[0].message.tool_calls[0].function.name, 'done');
  assert.equal(back.usage.cache_read_input_tokens, 100);
});

test('retries: 5xx and dropped connections back off and retry; a long 429 is returned at once', async () => {
  let n = 0;
  const flaky = async () => { n++; if (n === 1) return json({}, 529); if (n === 2) throw new TypeError('fetch failed'); return json({ choices: [{ message: { content: '{}' } }] }); };
  const r = await chat({ keys, env: {} }, null, { model: 'cerebras:x', body: {} }, flaky, { backoffMs: 1 });
  assert.equal(r.status, 200); assert.equal(r.attempts, 3);
  let m = 0;
  const limited = async () => { m++; return json({ error: { message: 'slow down' } }, 429, { 'retry-after': '30' }); };
  const r2 = await chat({ keys, env: {} }, null, { model: 'cerebras:x', body: {} }, limited, { backoffMs: 1 });
  assert.equal(r2.status, 429); assert.equal(m, 1);
  const refused = await chat({ keys, env: {} }, null, { model: 'anthropic:claude-haiku-5-5', body: { messages: [] } }, async () => json({ error: {} }, 401));
  assert.match(refused.json.error.message, /Anthropic rejected ANTHROPIC_API_KEY/);
});

test('schema check catches what a provider let through', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['index', 'confidence'], properties: { index: { type: 'integer' }, confidence: { type: 'number' } } };
  assert.equal(matches(schema, { index: 2, confidence: 0.9 }), true);
  assert.equal(matches(schema, { index: 2.5, confidence: 0.9 }), false);
  assert.equal(matches(schema, { index: 2 }), false);
  assert.equal(matches(schema, { index: 2, confidence: 1, extra: 1 }), false);
  assert.equal(matches({ type: 'array', items: { type: 'string', enum: ['a'] } }, ['a', 'b']), false);
});

test('router: a fast answer that fails a check goes to Claude; the reason is recorded', async () => {
  const replies = { 'cerebras:f': '{"index":3,"confidence":0.3}', 'anthropic:s': '{"index":1,"confidence":0.95}' };
  const llm = new LLM(async ({ model }) => ({ status: 200, ms: 1, json: { choices: [{ message: { content: replies[model] } }] } }), { fast: ['cerebras:f'], strong: ['anthropic:s'] });
  const schema = { type: 'object', required: ['index', 'confidence'], properties: { index: { type: 'integer' }, confidence: { type: 'number' } } };
  const r = await llm.decide('s', 'u', { schema, check: (v) => (v.confidence < llm.policy.lowConfidence ? 'lowConfidence' : '') });
  assert.equal(r.value.index, 1); assert.equal(r.tier, 'strong');
  assert.deepEqual(r.escalations, [{ tier: 'fast', why: 'lowConfidence' }]);
  assert.equal(llm.calls.at(-1).why, 'lowConfidence');
  // Escalation on that reason turned off by policy: the fast answer stands as the last word.
  const llm2 = new LLM(llm.transport, llm.tiers, { policy: { lowConfidence: false } });
  const r2 = await llm2.decide('s', 'u', { schema, check: (v) => (v.confidence < 0.6 ? 'lowConfidence' : '') });
  assert.equal(r2.tier, 'fast'); assert.equal(r2.failed, true);
  // Garbage from the fast tier = schemaFail.
  const llm3 = new LLM(async ({ model }) => ({ status: 200, json: { choices: [{ message: { content: model === 'cerebras:f' ? 'sure!' : '{"index":0,"confidence":1}' } }] } }), llm.tiers);
  assert.deepEqual((await llm3.decide('s', 'u', { schema })).escalations, [{ tier: 'fast', why: 'schemaFail' }]);
  assert.deepEqual(escalation({ env: { DIXI_ESCALATE: '{"lowConfidence":0.8,"bogus":1}' } }).lowConfidence, 0.8);
});

test('agent: a reply that is no call, a bad call, or a missing element is not acted on', () => {
  const call = (name, args) => ({ tool_calls: [{ id: '1', function: { name, arguments: JSON.stringify(args) } }] });
  assert.equal(badCall({ content: 'I will click it' }, 3), 'noToolCall');
  assert.equal(badCall(call('hack', {}), 3), 'unknownTool');
  assert.equal(badCall(call('click', { elementIndex: 7 }), 3), 'noSuchElement');
  assert.equal(badCall(call('click', { elementIndex: '1' }), 3), 'schemaFail');
  assert.equal(badCall(call('click', { elementIndex: 1 }), 3), '');
});

test('a question the page cannot answer goes to Claude with a web search, told which page you are on', async () => {
  const { askPage } = await import('../../src/renderer/core/pageQA.js');
  const tabs = { getTitle: async () => 'Fhumsh Wireless Earbuds - Amazon', getCurrentURL: () => 'https://shop.test/p/1', executeJS: async () => 'TITLE: Earbuds\n' + 'specs '.repeat(20) };
  const llm = { json: async () => JSON.stringify({ answer: 'The page does not show a product rating.', quote: '', found: false }) };
  let asked = null;
  const a = await askPage('what is the rating of this product', { tabs, llm, models: ['m'], webAnswer: async (q) => { asked = q; return 'It is rated 4.4 out of 5.'; } });
  assert.equal(a.web, true); assert.equal(a.text, 'It is rated 4.4 out of 5.');
  assert.match(asked, /what is the rating of this product \(context: I'm on the page "Fhumsh Wireless Earbuds - Amazon"\)/);
  // A real answer from the page is kept (no web search).
  const llm2 = { json: async () => JSON.stringify({ answer: 'It costs $29.', quote: 'specs specs', found: true }) };
  assert.equal((await askPage('how much is it', { tabs, llm: llm2, models: ['m'], webAnswer: async () => { throw new Error('no'); } })).grounded, true);
});
