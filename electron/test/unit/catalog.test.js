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

test('catalog: an accessory FOR a product asks whose', () => {
  assert.ok(c.match('a charger for my iPhone').ask);
  assert.ok(c.match('a case for my MacBook Air').ask);
});

test('catalog: missing or old catalog', () => {
  assert.equal(makeCatalog(null), null);
  assert.equal(makeCatalog({ ...data, refreshed: '2020-01-01' }).stale, true);
});
