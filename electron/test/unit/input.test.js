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

// A2 fixtures: a fake front window (no real AX, no clicks). press only ever focuses by AX path.
const box = (role, label, path) => ({ role, labels: [label], path, value: '' });
function win({ focus = null, boxes = [], emptyUntil = 0 } = {}) {
  const log = { press: [], list: 0, enable: 0, keys: [] };
  let cur = focus;
  return { log, set: (f) => { cur = f; }, d: {
    now: async () => cur,
    list: async () => (log.list++ < emptyUntil ? [] : boxes),
    press: async (path) => { log.press.push(path); cur = boxes.find((b) => b.path === path) ?? cur; return 'ok'; },
    enable: async () => { log.enable++; }, front: async () => ({ pid: 7 }), send: async (k) => { log.keys.push(k); }, wait: async () => {},
  } };
}
test('A2: already in a text box → no press, no search, nothing clicked', async () => {
  const w = win({ focus: box('AXTextArea', 'Enter a prompt here', [0]) });
  const r = await input.focusField({}, w.d);
  assert.deepEqual([r.ok, r.how, w.log.press.length, w.log.list], [true, 'focused', 0, 0]);
});
test('A2: not focused → the box found by role and name, focused by AX (the address bar is never it)', async () => {
  const prompt = box('AXTextArea', 'Enter a prompt here', [1, 4]);
  const w = win({ focus: box('AXButton', 'New chat', [1, 0]), boxes: [box('AXTextField', 'Address and search bar', [0, 2]), box('AXTextField', 'Search for chats', [1, 1]), prompt] });
  const r = await input.focusField({ name: 'Gemini' }, w.d);
  assert.deepEqual([r.ok, r.how, w.log.press], [true, 'ax', [[1, 4]]]);
});
test('A2: no AX tree (Chrome/Electron) → switched on, read again, then found', async () => {
  const w = win({ boxes: [box('AXTextArea', 'Message', [3])], emptyUntil: 2 });
  const r = await input.focusField({}, w.d);
  assert.deepEqual([r.ok, r.how, w.log.enable], [true, 'enable', 1]);
});
test('A2: a field in a web view with no AX name → the site key, learned for next time; at most 2 tries, then one line', async () => {
  const w = win({ boxes: [box('AXTextField', '', [0]), box('AXTextField', '', [1])] });
  w.d.send = async (k) => { w.log.keys.push(k); w.set(box('AXTextField', '', [1])); };
  const r = await input.focusField({ where: 'https://www.youtube.com/watch?v=x' }, w.d);
  assert.deepEqual([r.ok, r.how, w.log.keys], [true, 'key', ['/']]);
  const again = win({ boxes: [] }); again.d.send = w.d.send; again.d.now = async () => null;
  const miss = await input.focusField({ where: 'https://example.com', name: 'Gemini' }, again.d);
  assert.deepEqual(miss, { ok: false, why: "Couldn't find the Gemini input." });
  assert.ok(again.log.list <= 6 && again.log.enable === 1, 'two ways tried (AX, AX switched on), no wandering');
});
test('A2: a paste is checked; nothing landed → one more way to the box, then a clear failure', async () => {
  const seen = [{ len: 0, has: false }, { len: 0, has: false }, { len: 12, has: true }];
  let pasted = 0;
  const d = { paste: async () => { pasted++; }, has: async () => seen.shift(), focus: async (o) => ({ ok: true, how: 'ax', skip: o.skip }) };
  assert.deepEqual(await input.pasteChecked('hello Gemini', { name: 'Gemini' }, d), { ok: true, checked: true });
  assert.equal(pasted, 2);
  const never = { paste: async () => {}, has: async () => ({ len: 5, has: false }), focus: async () => ({ ok: true }) };
  assert.deepEqual(await input.pasteChecked('x', { name: 'Gemini' }, never), { ok: false, why: "The text didn't show up in the Gemini input." });
  const canvas = { paste: async () => {}, has: async () => ({ read: false, len: 0, has: false }) };
  assert.deepEqual(await input.pasteChecked('x', {}, canvas), { ok: true, checked: false }, 'a box with no value: not claimed as checked');
});
