import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notchOf } from '../../src/main/notch.js';

const display = (x, width, bar) => ({ bounds: { x, y: 0, width, height: 900 }, workArea: { x, y: bar, width, height: 900 - bar } });

test('notch: NSScreen safe area decides; the island takes the notch\'s own size; an external display is a pill', () => {
  const screens = [{ x: 0, w: 1470, top: 32, notch: 179 }, { x: 1470, w: 1920, top: 0, notch: 0 }];   // read on this MBA + an external
  assert.deepEqual(notchOf(display(0, 1470, 32), screens), { w: 179, h: 32 });
  assert.equal(notchOf(display(1470, 1920, 25), screens), null);
  assert.equal(notchOf(null, screens), null);
});

test('notch: without NSScreen, a menu bar taller than 30 pt means a notch', () => {
  assert.deepEqual(notchOf(display(0, 1512, 37), []), { w: 180, h: 37 });
  assert.equal(notchOf(display(0, 1440, 24), []), null);
});
