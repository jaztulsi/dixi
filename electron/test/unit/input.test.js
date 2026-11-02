import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A fake osascript first on PATH: it logs its script and, for a held key, sleeps like a real hold. No real events are posted.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-input-'));
const log = path.join(dir, 'log');
fs.writeFileSync(path.join(dir, 'osascript'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\ncase "$*" in *'"hold":3'*) exec sleep 5;; esac\n`, { mode: 0o755 });
process.env.PATH = `${dir}:${process.env.PATH}`;
const input = await import('../../src/main/input.js');
const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []);

test('C3: the kill switch stops a held key mid-press and lets go of it', async () => {
  const t0 = Date.now();
  const cut = assert.rejects(input.key('a', { holdSecs: 3 }), 'the press was cut short');
  await new Promise((r) => setTimeout(r, 300));
  await input.stopAll();
  await cut;
  assert.ok(Date.now() - t0 < 2500, 'did not wait for the hold');
  assert.ok(calls().some((l) => l.includes('CGEventCreateKeyboardEvent(null, 0, false)')), 'key-up for "a" posted');
  assert.equal(await input.releaseAll(), false, 'nothing left held');
});

test('C3: a mouse button held down is let go by stopAll; a finished press leaves nothing held', async () => {
  fs.rmSync(log, { force: true });
  await input.mouseButton({ x: 10, y: 20 }, true);
  await input.stopAll();
  assert.ok(calls().some((l) => l.includes('CGEventCreateMouseEvent(null, 2, {x: 10, y: 20}, 0)')), 'mouse-up at the held point');
  await input.key('a');
  assert.equal(await input.releaseAll(), false);
});
