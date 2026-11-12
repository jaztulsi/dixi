// Which spoken commands go to the page in your browser, and that "this" never guesses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { forPage, underPointer, jsOffHelp } from '../../src/main/browse.js';

test('page commands go to the browser in front: rules for the common ones, the model only for the rest', () => {
  for (const said of ['add this to my cart', 'add the first one to my cart', 'remove it', 'remove the milk from my cart', 'take the bagels out of my cart',
    'add two oat milks to my cart', 'make it two', 'open the second one', 'go back', 'scroll down', 'go to my cart',
    'what does this page say about returns' /* recognized by rule; only the answer needs a model */]) assert.equal(forPage(said), 'rule', said);
  for (const said of ['go there', 'click sign in', 'sort by lowest price']) assert.equal(forPage(said), 'model', said);
  for (const said of ['open Notes', 'turn the volume down', 'quit Spotify']) assert.equal(forPage(said), null, said);
});

test('"this" under the pointer: a card or link the pointer is on; between products is nothing, never the first link', () => {
  const page = (els) => vm.runInNewContext(underPointer({ x: 50, y: 60 }), {
    screenX: 0, screenY: 0, outerWidth: 800, innerWidth: 800, outerHeight: 600, innerHeight: 600, String,
    getComputedStyle: (e) => ({ position: e.pos ?? 'static' }),
    document: { elementsFromPoint: () => els },
  });
  const card = { innerText: 'Oat milk  $4', querySelector: () => ({ href: 'https://s.example/p/oat' }) };
  const inCard = { nodeType: 1, parentElement: null, closest: (sel) => (sel === 'a[href]' ? null : card) };
  const banner = { nodeType: 1, pos: 'fixed', parentElement: null, closest: () => null };
  const gap = { nodeType: 1, parentElement: null, closest: () => null };
  assert.equal(JSON.stringify(page([banner, inCard])), JSON.stringify({ href: 'https://s.example/p/oat', text: 'Oat milk $4' }), 'a cookie banner on top is looked through');
  assert.equal(page([gap]), null);
});

test('when the browser refuses page scripts, Dixi says exactly where to turn them on', () => {
  assert.match(jsOffHelp({ app: 'Google Chrome', kind: 'chromium' }), /View → Developer → "Allow JavaScript from Apple Events"/);
  assert.match(jsOffHelp({ app: 'Safari', kind: 'safari' }), /Develop → "Allow JavaScript from Apple Events"/);
});

import { fastPath } from '../../src/renderer/core/interpret.js';
test('"search for X" searches the site you are on, no model; a named site, "my …" and "find" are not this rule', () => {
  assert.deepEqual(fastPath('search for oat milk').steps.map((s) => [s.act, s.query]), [['search', 'oat milk']]);
  assert.deepEqual(fastPath('look for running shoes').steps.map((s) => [s.act, s.query]), [['search', 'running shoes']]);
  for (const t of ['search lo-fi beats on apple music', 'search for my resume', 'find my resume']) assert.ok(!fastPath(t)?.steps?.some((s) => s.act === 'search'), t);
});

import { remark } from '../../src/renderer/core/everywhere-words.js';
test('thinking out loud is not a command; anything with a command in it still is', () => {
  for (const t of ['hmm, what else do I need', 'uh, let me think', 'that looks good', "wow, that's cheap", 'okay, interesting', 'hmm']) assert.equal(remark(t), true, t);
  for (const t of ['add this to my cart', 'I need milk', 'what time is it', "that's good, add it", 'what else is in my cart? show me']) assert.equal(remark(t), false, t);
});

import { pickFromAnswer } from '../../src/renderer/core/execute.js';
test('"which one?" answers: ordinals, digits, or the one name that matches; never a guess', () => {
  const list = [{ text: 'Oatly Barista Edition' }, { text: 'Minor Figures Oat Milk' }, { text: 'Planet Oat Extra Creamy' }];
  for (const [a, n] of [['the second one', 2], ['third', 3], ['the minor figures one', 2], ['the oatly', 1], ['2', 2], ['the last one', -1], ['oat', 0], ['', 0], [null, 0]]) assert.equal(pickFromAnswer(a, list), n, String(a));
});
