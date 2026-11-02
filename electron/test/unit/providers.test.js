import { test } from 'node:test';
import assert from 'node:assert/strict';

test('prewarm(): a keyless GET to the Anthropic API, at most once per 20 s, never throws', async () => {
  const { prewarm, ENDPOINTS: E } = await import('../../src/main/providers.js');
  const calls = [];
  const f = async (url, init) => { calls.push([url, init]); throw new Error('offline'); };
  assert.equal(prewarm(f, 1e12), true);
  assert.equal(prewarm(f, 1e12 + 19000), false, 'throttled');
  assert.equal(prewarm(f, 1e12 + 21000), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, [[E.anthropic.url, undefined], [E.anthropic.url, undefined]], 'no headers, so no key');
});
