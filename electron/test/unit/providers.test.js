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

test('dead services: 401/402/quota are dead, 429/5xx are not; a mark persists across instances and expires after 6 h', async () => {
  const { Dead, deadAnswer, DEAD_MS } = await import('../../src/main/providers.js');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  assert.deepEqual([401, 402, 429, 500, 0].map((s) => deadAnswer(s)), [true, true, false, false, false]);
  assert.equal(deadAnswer(400, '{"detail":{"status":"quota_exceeded"}}'), true);
  assert.equal(deadAnswer(429, 'rate limited, slow down'), false);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-dead-')), 'sub', 'dead.json');
  let now = 1e12;
  const a = new Dead(file, { now: () => now });
  assert.equal(a.is('elevenlabs'), false);
  a.mark('elevenlabs', 'TTS 401');
  assert.equal(new Dead(file, { now: () => now }).is('elevenlabs'), true, 'survives a relaunch');
  now += DEAD_MS - 1;
  assert.equal(new Dead(file, { now: () => now }).is('elevenlabs'), true);
  now += 2;
  assert.equal(new Dead(file, { now: () => now }).is('elevenlabs'), false, 'retried after 6 h');
  assert.equal(new Dead('/nonexistent/x.json').is('elevenlabs'), false, 'no file = nothing dead');
});
