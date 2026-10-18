import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartCount } from '../../src/renderer/core/execute.js';

test('cartCount: a badge going up counts; a page caught mid-load or prices never do', () => {
  // Before and after a real add (a bag badge appears), and a refused one read mid-load.
  assert.equal(cartCount('Add to Bag|Add to Bag|Shopping Bag'), 0);
  assert.ok(cartCount('Shopping Bag with item count : 1 1|Review Bag') > 0);
  assert.equal(cartCount(''), null);
  assert.equal(cartCount('JS error: tab not ready'), null);
  assert.equal(cartCount(null), null);
  // Prices and the add buttons' own numbers are left out; item counts and bare badges are read.
  assert.equal(cartCount('Add to Cart $249.00|Subtotal $0.00 cart'), 0);
  assert.equal(cartCount('0 items in cart 0 Cart'), 0);
  assert.equal(cartCount('2 items in cart 2 Cart'), 4);
  assert.equal(cartCount('Bag (3)'), 3);
});
