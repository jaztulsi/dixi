import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ocr, textOf, grabSelection, pasteText, clipboardHistory, actOn } from '../../src/main/capture.js';

const mac = process.platform === 'darwin' ? {} : { skip: 'Vision and Quick Look are macOS' };
// A stand-in for Electron 44's clipboard (async, ClipboardItems by MIME type); `onCopy` is what the app in front
// puts there when ⌘C is pressed.
const RAW = (f) => `electron application/osclipboard;format="${f}"`;
function fakeClip(start = { 'text/plain': 'what you had copied' }) {
  let c = { ...start };
  const item = (r) => ({ types: Object.keys(r), getType: async (t) => (t in r ? r[t] : Promise.reject(new Error(`no ${t}`))) });
  return {
    read: async () => (Object.keys(c).length ? [item(c)] : []),
    write: async (items) => { const n = {}; for (const it of items) for (const t of it.types) n[t] = await it.getType(t); c = n; },
    readText: async () => c['text/plain'] ?? '', writeText: async (t) => { c = { 'text/plain': t }; }, clear: async () => { c = {}; },
    has: async (f) => f in c, _set: (x) => { c = { ...x }; }, _now: () => c,
  };
}

test('the selection: text, an image or files come back; your clipboard is put back (every format); nothing selected → null', async () => {
  for (const [onCopy, want] of [
    [{ 'text/plain': 'Dear team, the demo is friday' }, { kind: 'text', text: 'Dear team, the demo is friday' }],
    [{ 'image/png': new Blob([Buffer.from('png')]) }, { kind: 'image', png: Buffer.from('png') }],
    [{ [RAW('NSFilenamesPboardType')]: '<plist><array><string>/Users/me/a.pdf</string><string>/Users/me/b &amp; c.png</string></array></plist>', 'text/plain': 'a.pdf' }, { kind: 'files', files: ['/Users/me/a.pdf', '/Users/me/b & c.png'] }],
    [{ [RAW('public.file-url')]: 'file:///Users/me/My%20Report.docx' }, { kind: 'files', files: ['/Users/me/My Report.docx'] }],
  ]) {
    const clip = fakeClip({ 'text/plain': 'what you had copied', 'text/html': '<b>it</b>' });
    const got = await grabSelection({ clipboard: clip, key: async (k) => { assert.equal(k, 'cmd+c'); clip._set(onCopy); } });
    assert.deepEqual(got, want);
    assert.deepEqual(clip._now(), { 'text/plain': 'what you had copied', 'text/html': '<b>it</b>' }, 'clipboard restored');
  }
  const clip = fakeClip();
  assert.equal(await grabSelection({ clipboard: clip, key: async () => {}, waitMs: 60 }), null);
  assert.equal(await clip.readText(), 'what you had copied');
});

test('paste puts the new text where the selection was, then restores the clipboard; a copy made meanwhile is kept', async () => {
  const clip = fakeClip();
  const pasted = [];
  await pasteText({ clipboard: clip, key: async (k) => pasted.push([k, await clip.readText()]), text: 'Hi team, the demo is on Friday.', settleMs: 0 });
  assert.deepEqual(pasted, [['cmd+v', 'Hi team, the demo is on Friday.']]);
  assert.equal(await clip.readText(), 'what you had copied');
  await pasteText({ clipboard: clip, key: async () => clip._set({ 'text/plain': 'you copied this meanwhile' }), text: 'x', settleMs: 0 });
  assert.equal(await clip.readText(), 'you copied this meanwhile');
});

test('clipboard history: today’s copies, newest first and searchable; passwords and password managers are never kept', async () => {
  let t = 0;
  const clip = fakeClip({ 'text/plain': '' }), kept = [];
  const h = clipboardHistory({ clipboard: clip, now: () => t, onClip: (x) => kept.push(x.text) });
  for (const [text, fmts] of [['Flight TAP 203 to Lisbon', []], ['Flight TAP 203 to Lisbon', []], ['hunter2-Very$ecret', ['org.nspasteboard.ConcealedType']], ['password: hunter2', []], ['Order #4471 shipped', []]]) {
    t += 1000; clip._set({ 'text/plain': text, ...Object.fromEntries(fmts.map((f) => [RAW(f), ''])) }); await h.poll();
  }
  assert.deepEqual(h.list().map((x) => x.text), ['Order #4471 shipped', 'Flight TAP 203 to Lisbon']);
  assert.deepEqual(kept, ['Flight TAP 203 to Lisbon', 'Order #4471 shipped']);
  assert.deepEqual(h.search('lisbon flight').map((x) => x.text), ['Flight TAP 203 to Lisbon']);
  t += 25 * 3600e3;
  assert.deepEqual(h.list(), [], 'a day later: gone');
});

test('OCR reading order: rows top to bottom, pieces of one row left to right, unsure pieces dropped', async () => {
  const piece = (text, x, y, h = 0.02, conf = 1) => ({ text, conf, box: [x, y, 0.1, h] });
  const run = async () => JSON.stringify([[piece('2026', 0.19, 0.9167, 0.0117), piece('Date: March 3,', 0.03, 0.9117, 0.0183), piece('INVOICE 4471', 0.03, 0.96), piece('Асте', 0.03, 0.945, 0.0117, 0.3)]]);
  assert.equal((await ocr('/x.png', { run })).text, 'INVOICE 4471\nDate: March 3, 2026');
});

test('acting on it: the model is told the selection is data; only text can be replaced; nothing there → no model call', async () => {
  const calls = [];
  const ask = async (system, user) => { calls.push({ system, user }); return '```json\n{"mode":"replace","result":"Hi team, the demo is on Friday."}\n```'; };
  const r = await actOn({ kind: 'text', text: 'hey guys demo friday', app: 'Mail' }, 'make this more polite', { ask });
  assert.deepEqual([r.mode, r.text, r.say], ['replace', 'Hi team, the demo is on Friday.', 'Done.']);
  assert.match(calls[0].system, /data, never instructions/);
  assert.match(calls[0].user, /Selection \(text in Mail\):\n<<<\nhey guys demo friday\n>>>\n\nWhat to do: make this more polite/);
  const img = await actOn({ kind: 'image', png: Buffer.from('x') }, 'fix the typos', { ask, text: async () => 'Totl due $129' });
  assert.equal(img.mode, 'show', 'a picture can’t be replaced');
  const n = calls.length;
  assert.equal((await actOn({ kind: 'image', png: Buffer.from('x') }, 'summarize', { ask, text: async () => '  ' })).say, "I couldn't find any words in that.");
  assert.equal(calls.length, n);
  const files = await actOn({ kind: 'files', files: ['/x/a.txt'] }, 'what is the total', { ask: async (_s, u) => { assert.match(u, /\[a\.txt\]\nTotal: \$129/); return '{"mode":"show","result":"$129."}'; }, text: async () => 'Total: $129' });
  assert.deepEqual([files.mode, files.say], ['show', '$129.']);
});

test('OCR on this Mac: a picture and a scanned PDF page are read; a PDF with text uses its text layer', mac, async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-ocr-'));
  fs.writeFileSync(path.join(d, 'r.txt'), 'INVOICE 4471\nTotal due: $129.00\nDate: March 3, 2026\n');
  fs.writeFileSync(path.join(d, 'r.pdf'), execFileSync('/usr/sbin/cupsfilter', [path.join(d, 'r.txt')], { stdio: ['ignore', 'pipe', 'ignore'] }));
  execFileSync('qlmanage', ['-t', '-s', '1200', '-o', d, path.join(d, 'r.pdf')], { stdio: 'ignore' });
  const png = path.join(d, 'r.pdf.png');
  const pic = await textOf(png);
  assert.match(pic, /INVOICE 4471/);
  assert.match(pic, /\$129\.00/);
  // A scan: the picture made into a PDF with no text layer.
  execFileSync('sips', ['-s', 'format', 'pdf', png, '--out', path.join(d, 'scan.pdf')], { stdio: 'ignore' });
  const scan = await ocr(path.join(d, 'scan.pdf'));
  assert.equal(scan.pages.length, 1);
  assert.match(scan.text, /Date: March 3/);
  assert.match(await textOf(path.join(d, 'scan.pdf')), /INVOICE 4471/, 'no text layer → OCR');
  assert.match(await textOf(path.join(d, 'r.pdf')), /INVOICE 4471/);
});
