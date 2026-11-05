import test from 'node:test';
import assert from 'node:assert/strict';

test('gate: unit tests are offline: a real API host fails at once, even with keys in .env', async () => {
  const t = Date.now();
  await assert.rejects(fetch('https://api.anthropic.com/v1/messages', { method: 'POST' }));
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t} ms`);
});
