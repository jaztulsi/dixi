import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

test('gate: unit tests are offline: a real API host is refused by the guard at once, even with keys in .env', async () => {
  const t = Date.now();
  const err = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' }).then(() => null, (e) => e);
  assert.equal(err?.cause?.code, 'ENETUNREACH', `refused by test/no-network.js, not by being offline: ${err?.cause?.message}`);
  assert.match(err.cause.message, /no network in unit tests \(api\.anthropic\.com\)/);
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t} ms`);
});

test('gate: loopback still works (local ws/http fixtures)', async () => {
  const server = net.createServer((s) => s.end('ok')).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const got = await new Promise((res, rej) => { let d = ''; net.connect(server.address().port, '127.0.0.1').on('data', (c) => { d += c; }).on('end', () => res(d)).on('error', rej); });
  server.close();
  assert.equal(got, 'ok');
});

test('gate: NODE_OPTIONS=--import no-network.js is live in Electron\'s main process: a dummy-key ElevenLabs STT and TTS are refused', async () => {
  const { spawnSync } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '../..');
  const env = { ...process.env, NODE_OPTIONS: `--import=${path.join(root, 'test/no-network.js')}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(createRequire(import.meta.url)('electron'), [path.join(root, 'test/fixtures/electron-guard-main.mjs')], { env, encoding: 'utf8', timeout: 15000 });
  const out = JSON.parse(r.stdout.trim().split('\n').at(-1) || '{}');
  assert.match(out.probe ?? r.stderr, /no network in unit tests \(192\.0\.2\.1\)/);
  assert.match(out.stt.error, /no network in unit tests \(api\.elevenlabs\.io\)/);
  assert.equal(out.tts, 'ENETUNREACH no network in unit tests (api.elevenlabs.io)');
});
