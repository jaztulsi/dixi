import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openIndex } from '../../src/main/index.js';
import { indexFolder, watchFolder, extractText, indexNotes, indexMail, indexActivity, addTurn } from '../../src/main/ingest.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idxIn = (d) => openIndex(path.join(d, 'index.db'), { embed: async (ts) => ts.map(() => null) });
const mac = process.platform === 'darwin' ? {} : { skip: 'textutil and PDFKit are macOS' };

test('a folder: text, Word and PDF are read; hidden folders and node_modules are not; gone files are forgotten', mac, async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-ing-'));
  const docs = path.join(d, 'Docs');
  fs.mkdirSync(path.join(docs, 'node_modules'), { recursive: true }); fs.mkdirSync(path.join(docs, '.secret'));
  fs.writeFileSync(path.join(docs, 'boiler.txt'), 'The boiler service is booked for March 14. Call Raj at the plumbing company.');
  execFileSync('textutil', ['-convert', 'docx', path.join(docs, 'boiler.txt'), '-output', path.join(docs, 'boiler.docx')]);
  fs.writeFileSync(path.join(d, 'pdf.txt'), 'Quarterly budget: marketing gets forty thousand.');
  fs.writeFileSync(path.join(docs, 'budget.pdf'), execFileSync('/usr/sbin/cupsfilter', [path.join(d, 'pdf.txt')], { stdio: ['ignore', 'pipe', 'ignore'] }));
  fs.writeFileSync(path.join(docs, 'node_modules', 'x.txt'), 'boiler'); fs.writeFileSync(path.join(docs, '.secret', 'x.txt'), 'boiler');
  fs.writeFileSync(path.join(docs, 'photo.jpg'), 'not text');
  assert.match(await extractText(path.join(docs, 'budget.pdf')), /marketing gets forty thousand/);
  const idx = idxIn(d);
  assert.deepEqual(await indexFolder(idx, docs), { added: 3, same: 0, removed: 0 });
  assert.deepEqual((await idx.search('boiler service')).map((h) => h.title).sort(), ['boiler.docx', 'boiler.txt']);
  assert.equal((await idx.search('marketing budget'))[0].title, 'budget.pdf');
  assert.deepEqual(await indexFolder(idx, docs), { added: 0, same: 3, removed: 0 }, 'unchanged: nothing re-read');
  fs.rmSync(path.join(docs, 'boiler.docx'));
  assert.deepEqual(await indexFolder(idx, docs), { added: 0, same: 2, removed: 1 });
});

test('the watch: a new or changed file is in the index a moment later; a deleted one leaves it', async () => {
  // The file events are handed in by the test, so nothing here waits on macOS's timing.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-watch-'));
  const idx = idxIn(d);
  let event = null;
  const w = watchFolder(idx, d, { settleMs: 1e9, watch: (_dir, _opts, fn) => { event = fn; return { close() {} }; } });
  try {
    fs.writeFileSync(path.join(d, 'trip.md'), '# Trip\nFlight to Lisbon on December 3, TAP 203.');
    fs.writeFileSync(path.join(d, 'index.db-x.bin'), 'ignored');
    event('rename', 'trip.md'); event('rename', 'index.db-x.bin'); event('change', path.join('node_modules', 'x.md'));
    await w.flush();
    assert.equal((await idx.search('Lisbon flight'))[0]?.title, 'trip.md');
    assert.deepEqual(idx.stats(), { file: 1 }, 'only the Markdown file');
    fs.writeFileSync(path.join(d, 'trip.md'), '# Trip\nFlight to Porto instead.');
    fs.utimesSync(path.join(d, 'trip.md'), new Date(), new Date(Date.now() + 5000));   // a new mtime, even within the same millisecond
    event('change', 'trip.md');
    await w.flush();
    assert.equal((await idx.search('Lisbon')).length, 0);
    assert.equal((await idx.search('Porto'))[0]?.title, 'trip.md');
    fs.rmSync(path.join(d, 'trip.md'));
    event('rename', 'trip.md');
    await w.flush();
    assert.deepEqual(idx.stats(), {});
  } finally { w.close(); }
});

test('the watch on real macOS file events (waits for the result, up to 5 s)', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-watch-real-'));
  const idx = idxIn(d);
  const w = watchFolder(idx, d, { settleMs: 50 });
  const until = async (ok) => { for (const end = Date.now() + 5000; Date.now() < end; await sleep(50)) if (await ok()) return true; return false; };
  try {
    await sleep(100);   // the watch is live before the first write
    fs.writeFileSync(path.join(d, 'trip.md'), '# Trip\nFlight to Lisbon on December 3, TAP 203.');
    assert.ok(await until(async () => (await idx.search('Lisbon'))[0]?.title === 'trip.md'), 'a new file is indexed');
    fs.rmSync(path.join(d, 'trip.md'));
    assert.ok(await until(() => !Object.keys(idx.stats()).length), 'a deleted file leaves the index');
  } finally { w.close(); }
});

test('Notes, Mail, past requests and conversations become sources with their kind', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-src-'));
  const idx = idxIn(d);
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, args.length]);
    return args[3]?.includes('Notes') ? JSON.stringify([{ id: 'x-coredata://1', title: 'Gate code', text: 'Side gate opens with the blue fob.', at: 5 }, { id: 'x-coredata://2', title: 'Empty', text: '', at: 6 }])
      : JSON.stringify([{ id: '<abc@mail>', title: 'Demo moved (from Priya)', text: 'The demo moved to Friday at 10.', at: Date.now() }]);
  };
  assert.equal(await indexNotes(idx, { run }), 1);
  assert.equal(await indexMail(idx, { run }), 1);
  assert.ok(calls.every(([cmd]) => cmd === 'osascript'));
  await indexActivity(idx, { read: () => [{ t: 100, kind: 'run', text: 'find flights to Lisbon', app: 'Safari' }, { t: 101, kind: 'click' }] });
  await addTurn(idx, { said: 'what should I cook tonight', answer: 'How about the lentil soup recipe you saved?', at: 200 });
  assert.deepEqual(idx.stats(), { command: 1, mail: 1, note: 1, session: 1 });
  assert.equal((await idx.search('demo Friday'))[0].kind, 'mail');
  assert.equal((await idx.search('Lisbon flights'))[0].title, 'You asked (in Safari)');
  assert.match((await idx.search('lentil soup'))[0].text, /^You said: what should I cook tonight\nDixi answered:/);
});
