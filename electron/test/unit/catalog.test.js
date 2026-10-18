import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCatalog } from '../../src/renderer/core/catalog.js';

// A stand-in catalog in the same shape as data/apple-catalog.json (tests never read the real one).
const data = { refreshed: new Date().toISOString().slice(0, 10), storeURL: 'https://store.fixture/', families: [
  { name: 'AirPods' }, { name: 'iPhone' }, { name: 'MacBook Air' }, { name: 'Apple Watch' }, { name: 'Magic Keyboard' }, { name: 'Apple TV' }, { name: 'AirTag' }] };
const c = makeCatalog(data);

test('catalog: families match however they are spoken, including models not listed by name', () => {
  for (const [item, fam] of [['AirPods', 'AirPods'], ['air pods', 'AirPods'], ['AirPods Pro 3', 'AirPods'], ['a mac book air', 'MacBook Air'], ['an iPhone 19', 'iPhone'],
    ['AirTags', 'AirTag'], ['a Magic Keyboard', 'Magic Keyboard'], ['I phone', 'iPhone']]) assert.equal(c.match(item)?.family, fam, item);
});

test('catalog: generic words and look-alikes never trigger it', () => {
  for (const item of ['apples', 'a phone', 'headphones', 'apple juice', 'a watch', 'keyboard', 'air fryer']) assert.equal(c.match(item), null, item);
});

test('catalog: an accessory for a product, or one of Apple\'s own, is searched on Apple\'s store (Apple first)', () => {
  const acc = makeCatalog({ ...data, accessoryWords: ['case', 'charger', 'pencil', 'protector', 'screen'], appleWords: ['magsafe'] });
  for (const item of ['a charger for my iPhone', 'a case for my MacBook Air', 'iPhone case', 'an iPhone screen protector', 'MagSafe charger', 'Apple Pencil']) assert.equal(acc.match(item)?.search, true, item);
  // The product itself, with its options, is never an accessory; a generic accessory isn't Apple's.
  for (const item of ['iPhone in black', 'MacBook Air 512GB in midnight']) assert.equal(acc.match(item)?.search, undefined, item);
  assert.equal(acc.match('a phone charger'), null);
});

test('catalog: a family with several current models and none named asks which; digits inside numbers never match', () => {
  const m = makeCatalog({ ...data, families: [...data.families, { name: 'iPhone 17', url: 'u17' }, { name: 'iPhone Air', url: 'uair' }, { name: 'AirPods Max 2', url: 'umax' }, { name: 'AirPods 5', url: 'u5' }] });
  assert.deepEqual(m.match('a black iPhone').models, ['iPhone 17', 'iPhone Air']);
  assert.notEqual(m.match('AirPods with 200 GB')?.family, 'AirPods Max 2');
});

test('catalog: missing or old catalog', () => {
  assert.equal(makeCatalog(null), null);
  assert.equal(makeCatalog({ ...data, refreshed: '2020-01-01' }).stale, true);
});
