import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { stillWhenAway } from '../../src/main/still.js';

const fakeWin = ({ focusable = true, visible = false, focused = false } = {}) => {
  const w = new EventEmitter(), wc = new EventEmitter(), css = new Set();
  let n = 0;
  Object.assign(wc, { isDestroyed: () => false, insertCSS: async () => { const k = `k${++n}`; css.add(k); return k; }, removeInsertedCSS: async (k) => { css.delete(k); } });
  Object.assign(w, { webContents: wc, isFocusable: () => focusable, isVisible: () => visible, isFocused: () => focused, css });
  return w;
};
const tick = () => new Promise((r) => setTimeout(r, 5));

test('still: a hidden window loads with animations paused; focus resumes them, blur pauses again (one CSS, never stacked)', async () => {
  const w = fakeWin();
  stillWhenAway(w);
  w.webContents.emit('did-finish-load'); await tick();
  assert.equal(w.css.size, 1);
  w.emit('focus'); await tick();
  assert.equal(w.css.size, 0);
  w.emit('blur'); w.emit('hide'); w.emit('minimize'); await tick();
  assert.equal(w.css.size, 1);
});

test('still: the island (never focusable) is never paused', async () => {
  const w = fakeWin({ focusable: false });
  stillWhenAway(w);
  w.webContents.emit('did-finish-load'); w.emit('blur'); await tick();
  assert.equal(w.css.size, 0);
  assert.equal(w.listenerCount('blur'), 0);
});

test('still: a window shown and focused at load keeps animating', async () => {
  const w = fakeWin({ visible: true, focused: true });
  stillWhenAway(w);
  w.webContents.emit('did-finish-load'); await tick();
  assert.equal(w.css.size, 0);
});
