import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { norm, cleanCommand, cleanList, loadCommands, saveCommands, matchCommand, homePath, ACTIONS } from '../../src/main/commands.js';

const list = [
  { id: 'a', phrase: 'Claude', action: 'app', target: 'Claude', enabled: true },
  { id: 'b', phrase: 'my bank', action: 'website', target: 'chase.com', enabled: true },
  { id: 'c', phrase: 'Taxes', action: 'file', target: '~/Documents/Taxes', enabled: false },
];

test('the words that pick a command', () => {
  assert.equal(norm('Hey Dixi, please open Claude.'), 'open claude');
  assert.equal(norm('Dixi, Claude please'), 'claude');
  for (const said of ['Claude', 'claude.', 'open Claude', 'Dixi, launch Claude please', 'can you open claude', 'start the Claude']) assert.equal(matchCommand(said, list)?.id, 'a', said);
  assert.equal(matchCommand('go to my bank', list)?.id, 'b');
  assert.equal(matchCommand('Taxes', list), null);   // turned off
  for (const said of ['what is Claude', 'open Claude and write a poem', 'Claudette', '', 'Dixi']) assert.equal(matchCommand(said, list), null, said);
});

test('commands are checked: known action, phrase, target, no control characters', () => {
  assert.equal(cleanCommand({ phrase: 'x', action: 'rm -rf', target: 'y' }), null);
  assert.equal(cleanCommand({ phrase: '  ', action: 'app', target: 'Claude' }), null);
  assert.equal(cleanCommand({ phrase: 'Claude', action: 'app', target: '' }), null);
  const c = cleanCommand({ phrase: 'Cl‮aude', action: 'app', target: 'Claude\n', id: '../evil' });
  assert.equal(c.phrase, 'Claude'); assert.equal(c.target, 'Claude'); assert.match(c.id, /^c/);
  assert.equal(ACTIONS.length, 6);
});

test('a phrase used twice is refused', () => {
  const r = cleanList([{ phrase: 'Claude', action: 'app', target: 'Claude' }, { phrase: 'open claude!', action: 'website', target: 'claude.ai' }]);
  assert.equal(r.ok, false); assert.match(r.error, /twice/);
});

test('saved to a file only you can read, and read back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-cmd-'));
  const file = path.join(dir, 'commands.json');
  assert.equal(saveCommands(file, list).ok, true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(loadCommands(file).map((c) => c.id), ['a', 'b', 'c']);
  fs.writeFileSync(file, 'not json');
  assert.deepEqual(loadCommands(file), []);
});

test('files and folders stay inside your home folder', () => {
  assert.equal(homePath('~/Documents/Taxes', '/Users/me'), '/Users/me/Documents/Taxes');
  assert.equal(homePath('~', '/Users/me'), '/Users/me');
  for (const p of ['/etc/passwd', '~/../other', '/Users/meme/x', 'Documents', '']) assert.equal(homePath(p, '/Users/me'), null, p);
});
