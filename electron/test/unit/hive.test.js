import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHive, TOOLS } from '../../src/main/hive.js';

// A stand-in for `claude`: reads the task on stdin, prints stream-json like the real one.
// "fail" in the task → an error result; "hang" → never answers (until stopped).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-'));
const bin = path.join(tmp, 'fake-claude.mjs');
fs.writeFileSync(bin, `#!/usr/bin/env node
let task = '';
process.stdin.on('data', (d) => { task += d; }).on('end', () => {
  const say = (o) => console.log(JSON.stringify(o));
  say({ type: 'system', subtype: 'init', cwd: process.cwd() });
  if (task.includes('hang')) return setInterval(() => {}, 1000);
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { query: task } }] } });
  setTimeout(() => {
    say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Found it.' }] } });
    const failed = task.includes('fail');
    say({ type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, total_cost_usd: 0.01,
      result: failed ? 'could not finish' : JSON.stringify({ task, cwd: process.cwd(), args: process.argv.slice(2) }) });
  }, 50);
});
`, { mode: 0o755 });

test('runs every task in its own folder, a few at a time, with only the safe tools', async () => {
  const updates = [];
  let running = 0, most = 0;
  const onUpdate = (u) => {
    updates.push(u);
    const now = new Set(updates.filter((x) => x.status === 'running').map((x) => x.i));
    for (const x of updates) if (x.status === 'done' || x.status === 'failed') now.delete(x.i);
    running = now.size; most = Math.max(most, running);
  };
  const out = await runHive(['find a plumber', 'compare two phones', 'this one will fail'], { bin, cwd: tmp, maxParallel: 2, onUpdate });
  assert.deepEqual(out.map((r) => r.ok), [true, true, false]);
  assert.equal(out[2].result, 'could not finish');
  assert.ok(most <= 2, `at most 2 at once (saw ${most})`);
  assert.ok(updates.some((u) => u.i === 0 && u.status === 'running' && u.step.startsWith('WebSearch')));
  const r = JSON.parse(out[0].result);
  assert.equal(r.task, 'find a plumber');                         // the task went in on stdin
  assert.ok(fs.realpathSync(r.cwd).startsWith(fs.realpathSync(tmp)) && r.cwd !== tmp);   // its own folder
  assert.equal(r.args[r.args.indexOf('--tools') + 1], TOOLS.join(','));
  assert.ok(!TOOLS.includes('Bash') && r.args.includes('--restricted') && r.args.includes('--strict-mcp-config'));
  assert.equal(r.args[r.args.indexOf('--permission-prompts') + 1], 'none');
  assert.equal(out[0].costUsd, 0.01);
});

test('stopping ends every agent, including ones not started yet', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 300);
  const t0 = Date.now();
  const out = await runHive(['hang here', 'hang too', 'never starts'], { bin, cwd: tmp, maxParallel: 2, signal: ac.signal });
  assert.ok(Date.now() - t0 < 3000);
  assert.deepEqual(out.map((r) => [r.ok, r.result]), [[false, 'Stopped'], [false, 'Stopped'], [false, 'Stopped']]);
});

test('a missing Claude Code says so', async () => {
  const [r] = await runHive(['anything'], { bin: path.join(tmp, 'nope'), cwd: tmp });
  assert.equal(r.ok, false);
  assert.match(r.result, /isn't installed/);
});
