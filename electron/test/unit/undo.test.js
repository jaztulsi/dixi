import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUndo } from '../../src/main/undo.js';

const box = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-undo-'));
  const f = (...p) => path.join(d, ...p);
  fs.mkdirSync(f('Downloads')); fs.mkdirSync(f('Trash'));
  for (const n of ['a.pdf', 'b.png', 'c.pdf']) fs.writeFileSync(f('Downloads', n), n);
  return { f, u: createUndo(f('undo.jsonl'), { trashDir: f('Trash') }) };
};

test('a clean-up is one group: undo puts every file back and removes the folders it made', async () => {
  const { f, u } = box();
  const g = u.group('Tidy Downloads');
  assert.equal(await u.move(f('Downloads', 'a.pdf'), f('Downloads', 'PDFs', 'a.pdf'), g), f('Downloads', 'PDFs', 'a.pdf'));
  await u.move(f('Downloads', 'c.pdf'), f('Downloads', 'PDFs', 'c.pdf'), g);
  await u.move(f('Downloads', 'b.png'), f('Downloads', 'Images', 'b.png'), g);
  assert.deepEqual(fs.readdirSync(f('Downloads')).sort(), ['Images', 'PDFs']);
  assert.deepEqual(await u.undo(), { label: 'Tidy Downloads', restored: 3, skipped: 0 });
  assert.deepEqual(fs.readdirSync(f('Downloads')).sort(), ['a.pdf', 'b.png', 'c.pdf']);
  assert.equal(await u.undo(), null, 'nothing left to undo');
  assert.equal((fs.statSync(f('undo.jsonl')).mode & 0o777), 0o600);
});

test('never overwrites, never deletes: a taken name gets a number; the Trash can be undone', async () => {
  const { f, u } = box();
  fs.writeFileSync(f('Downloads', 'x.pdf'), 'other');
  assert.equal(await u.rename(f('Downloads', 'a.pdf'), 'x.pdf'), f('Downloads', 'x 2.pdf'));
  assert.equal(fs.readFileSync(f('Downloads', 'x.pdf'), 'utf8'), 'other');
  await u.trash(f('Downloads', 'b.png'));
  assert.ok(fs.existsSync(f('Trash', 'b.png')));
  await u.undo();
  assert.ok(fs.existsSync(f('Downloads', 'b.png')), 'out of the Trash');
  await u.undo();
  assert.ok(fs.existsSync(f('Downloads', 'a.pdf')));
  assert.deepEqual((await u.history()).map((h) => [h.label, h.undone]), [['Move to Trash', true], ['Rename', true]]);
});

test('undo leaves alone what changed since, and bad names or paths are refused', async () => {
  const { f, u } = box();
  await u.move(f('Downloads', 'a.pdf'), f('Downloads', 'Old', 'a.pdf'));
  fs.writeFileSync(f('Downloads', 'a.pdf'), 'a new file with the same name');
  assert.deepEqual((await u.undo()).skipped, 1);
  assert.equal(fs.readFileSync(f('Downloads', 'a.pdf'), 'utf8'), 'a new file with the same name');
  await assert.rejects(u.rename(f('Downloads', 'c.pdf'), '../../etc/x'), /can't name/);
  await assert.rejects(u.move('relative.pdf', f('x.pdf')), /not a full path/);
  await assert.rejects(u.move(f('Downloads', 'gone.pdf'), f('x.pdf')), /ENOENT/);
});
