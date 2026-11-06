import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READ_IT, readIntent, chunks, looksPrivate, readSelection, readOut } from '../../src/main/reader.js';

const jx = (o) => async () => JSON.stringify({ sel: '', value: '', subrole: '', labels: [], page: '', ...o });
const image = () => ({});
const shot = { b64: 'x' };
const fakeClaude = (text) => { const f = async () => { f.calls++; return { content: [{ type: 'text', text }] }; }; f.calls = 0; return f; };

test('intents match, and the neighbours do not', () => {
  for (const t of ['read this to me', 'read me this', 'read the selected text', 'read it out loud', 'what does the highlighted part say']) assert.equal(readIntent(t), 'selection', t);
  for (const t of ['read this page', 'read this email to me']) assert.equal(readIntent(t), 'page', t);
  for (const t of ['copy the text in this picture', 'copy the text on my screen', 'grab the text from this image']) assert.equal(readIntent(t), 'image', t);
  for (const t of ['read my email', 'what is this', 'take dictation', 'where was I', 'read my emails to me']) { assert.equal(readIntent(t), null, t); assert.ok(!READ_IT.test(t), t); }
});

test('chunks split at sentence ends, stay short, lose nothing', () => {
  const s = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i} of the long text.`).join(' ');
  const c = chunks(s);
  assert.ok(c.length > 1 && c.every((x) => x.length <= 350));
  assert.ok(c.slice(0, -1).every((x) => /[.!?]$/.test(x)));
  assert.equal(c.join(' '), s);
  assert.ok(chunks('x'.repeat(900) + ' end').every((x) => x.length <= 350));
  assert.deepEqual(chunks(''), []);
});

test('private text: Luhn card, code, password; ordinary numbers pass', () => {
  assert.ok(looksPrivate('Card 4242 4242 4242 4242 exp 12/30'));
  assert.ok(!looksPrivate('Order 1234 5678 9012 3456 shipped'));
  assert.ok(looksPrivate('Your verification code is 482913'));
  assert.ok(looksPrivate('password: hunter2'));
  assert.ok(!looksPrivate('Meet at 5 on the 12th, room 301.'));
});

test('selection comes first: Haiku is never called when AX had text', async () => {
  const claude = fakeClaude('nope');
  const r = await readOut({ intent: 'selection', shot, claude, image, jxaRun: jx({ sel: 'Hello there. General Kenobi.' }), pid: 1 });
  assert.equal(claude.calls, 0);
  assert.equal(r.say[0], 'This is a short one. Hello there. General Kenobi.');
});

test('page: falls back to window text; long text says how long', async () => {
  const words = Array.from({ length: 300 }, () => 'word').join(' ') + '.';
  const r = await readOut({ intent: 'page', shot, claude: fakeClaude(''), image, jxaRun: jx({ page: words }), pid: 1 });
  assert.match(r.say[0], /^This is about 2 minutes long\./);
});

test('secure field is never read, and nothing goes to the model', async () => {
  const claude = fakeClaude('secret');
  const r = await readOut({ intent: 'selection', shot, claude, image, jxaRun: jx({ subrole: 'AXSecureTextField', sel: 'hunter2' }), pid: 1 });
  assert.match(r.say[0], /look/i); assert.equal(claude.calls, 0);
  assert.deepEqual(await readSelection({ jxaRun: jx({ labels: ['Verification code'], sel: '123456' }), pid: 1 }), { text: '', secret: true });
});

test('nothing in AX: one Haiku call; image intent copies to the clipboard', async () => {
  const claude = fakeClaude('Line one\nLine two\nLine three');
  let clip = '';
  const r = await readOut({ intent: 'image', shot, claude, image, jxaRun: jx({ sel: 'ignored' }), writeClipboard: (t) => { clip = t; }, pid: 1 });
  assert.equal(claude.calls, 1); assert.equal(clip, 'Line one\nLine two\nLine three');
  assert.deepEqual(r.say, ['Copied 3 lines. Paste it with command V.']);
  const r2 = await readOut({ intent: 'selection', shot, claude: fakeClaude('From the picture.'), image, jxaRun: jx({}), pid: 1 });
  assert.match(r2.say[0], /From the picture\./);
});

test('image text that looks private is refused and not copied', async () => {
  let clip = null;
  const r = await readOut({ intent: 'image', shot, claude: fakeClaude('4242 4242 4242 4242'), image, writeClipboard: (t) => { clip = t; }, pid: 1 });
  assert.equal(clip, null); assert.equal(r.say[0], "I won't copy that; it looks private.");
});

test('"what\'s on my screen": AX first, then on-device OCR, the picture last, and it says which answered', async () => {
  for (const t of ["what's on my screen", 'what’s on the screen', 'what am I looking at', 'describe my screen']) assert.equal(readIntent(t), 'screen', t);
  const app = { name: 'Safari', pid: 1 }, claude = fakeClaude('A news page.');
  const ax = await readOut({ intent: 'screen', claude, image, app, jxaRun: jx({ page: 'Top stories. Rain all week.' }), screenText: async () => assert.fail('no OCR when AX had text') });
  assert.deepEqual([ax.how, ax.say[0]], ['ax', "You're in Safari. It says: Top stories. Rain all week."]);
  const ocr = await readOut({ intent: 'screen', claude, image, app, jxaRun: jx({}), screenText: async () => 'Invoice  42' });
  assert.deepEqual([ocr.how, ocr.say[0]], ['ocr', "You're in Safari. It says: Invoice 42"]);
  assert.equal(claude.calls, 0, 'no model for either');
  assert.equal((await readOut({ intent: 'screen', claude, image, app, jxaRun: jx({}) })).text, '', 'nothing: the caller takes the picture');
  const v = await readOut({ intent: 'screen', shot, claude, image, app, jxaRun: jx({ page: 'skipped' }) });
  assert.deepEqual([v.how, v.say[0], claude.calls], ['vision', 'A news page.', 1]);
  assert.equal((await readOut({ intent: 'screen', claude, image, app, jxaRun: jx({}), screenText: async () => 'Your code is 834221' })).text, "I won't read that out; it looks private.");
});
