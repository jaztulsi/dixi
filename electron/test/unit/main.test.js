import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groqChat } from '../../src/main/groq.js';
import { loadConfig } from '../../src/main/config.js';

const config = { groqAPIKey: 'k', agentModel: 'qwen/qwen3.8-27b', voiceModel: 'openai/gpt-oss-20b' };

test('groq proxy: model allowlist, size cap, missing key, passes through 429', async () => {
  assert.equal((await groqChat(config, { model: 'evil/model' })).status, 400);
  assert.equal((await groqChat({ ...config, groqAPIKey: '' }, { model: 'qwen/qwen3.8-27b' })).status, 401);
  assert.equal((await groqChat(config, { model: 'qwen/qwen3.8-27b', x: 'a'.repeat(1_600_000) })).status, 413);
  const fake = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer k');
    return { status: 429, headers: new Map([['retry-after', '7']]), text: async () => '{"error":{"message":"slow down"}}' };
  };
  const r = await groqChat(config, { model: 'openai/gpt-oss-120b' }, fake);
  assert.deepEqual([r.status, r.retryAfter], [429, '7']);
});

test('config: env overrides and model defaults', () => {
  const c = loadConfig({ GROQ_API_KEY: 'g', AGENT_MODEL: 'openai/gpt-oss-120b' });
  assert.equal(c.groqAPIKey, 'g');
  assert.equal(c.agentModel, 'openai/gpt-oss-120b');
  assert.equal(c.voiceModel, 'openai/gpt-oss-20b');
});
