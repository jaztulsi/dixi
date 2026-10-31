import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localVoice } from '../../src/main/localvoice.js';

test('the text goes after "--", the bytes come back, the temp file is gone', async () => {
  let seen;
  const run = async (args) => { seen = args; fs.writeFileSync(args[1], 'RIFF....WAVE'); };
  const bytes = await localVoice('-v say this', { voice: 'Samantha', rate: 180, run });
  assert.equal(Buffer.from(bytes).toString(), 'RIFF....WAVE');
  assert.deepEqual(seen.slice(2), ['--data-format=LEI16@22050', '-v', 'Samantha', '-r', '180', '--', '-v say this']);
  assert.equal(fs.existsSync(seen[1]), false);
});

test('a failed or timed-out voice rejects and leaves no file', async () => {
  let file;
  const run = async (args) => { file = args[1]; fs.writeFileSync(file, 'half'); throw new Error('timed out'); };
  await assert.rejects(localVoice('hello', { run }), /timed out/);
  assert.equal(fs.existsSync(file), false);
});

test('the real Mac voice makes a WAV', { skip: process.platform !== 'darwin' }, async () => {
  const bytes = await localVoice('Hi.');
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), 'RIFF');
  assert.ok(bytes.length > 1000);
});
