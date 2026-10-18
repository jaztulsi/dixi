import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoSteps, demoPartial, productPage } from '../../src/renderer/core/demo.js';
import { fastPath, incomplete } from '../../src/renderer/core/interpret.js';

// The demo lines (DEMO.md) are hard-coded on purpose: these are the real phrases, not invented names.
const acts = (text) => fastPath(text)?.steps.map((s) => [s.act, s.item || s.query || s.value || s.said, s.qty || s.n || 0].join(' '));

test('demo: every DEMO.md line and follow-up needs no AI', () => {
  for (const line of [
    'buy me an iPhone 17 in black with 256 gigabytes and AirPods Pro, then open my bag', "What's the difference between this iPhone 17 and the iPhone 16?",
    'Remove the AirPods from my bag.', 'Make the iPhone two and then check out.', 'add an AirTag and a MacBook Air in midnight to my bag, then open my bag',
    'Make the AirTag two.', 'Remove the MacBook Air and go to checkout.', 'show me AirPods on the Apple Store and tell me which ones are the best right now',
    'Buy me AirPods Pro, then open my bag.', 'I want an iPad.', 'The iPad Air.', 'search for wireless earbuds on Amazon, open the first result and tell me its rating',
    'Add it to my cart and go to purchase.', 'open YouTube, search for lofi beats and play the first video', 'Pause it and turn it up.', 'Skip ahead and mute it.',
  ]) assert.ok(fastPath(line), line);
  assert.deepEqual(acts('buy me an iPhone 17 in black with 256 gigabytes and AirPods Pro, then open my bag'), ['order iPhone 17 in black with 256 gigabytes 0', 'order AirPods Pro 0', 'cart  0']);
  assert.deepEqual(acts('Make the iPhone two and then check out.'), ['quantity iPhone 2', 'checkout  0']);
});

test('demo: a similar sentence is the same line', () => {
  assert.deepEqual(demoSteps('get me a black iPhone 17, 256 gigs, and Air Pods Pro please'), demoSteps('buy me an iPhone 17 in black with 256 gigabytes and AirPods Pro'));
  assert.equal(demoSteps('make the AirTag to')?.[0].qty, 2, '"two" heard as "to"');
  assert.equal(demoSteps('search lo-fi beats on YouTube')?.[0].url, 'https://www.youtube.com/results?search_query=lofi+beats');
  assert.equal(demoSteps('take the AirPods out of my bag')?.[0].act, 'remove');
});

test('demo: another product, colour, number or site is never the demo', () => {
  for (const s of ['buy me an iPhone 17 in white with 256 gigabytes and AirPods Pro', 'buy me an iPhone 17 in black with 512 gigabytes and AirPods Pro',
    'buy me an iPhone 17 in black with 256 gigabytes and AirPods Pro and an AirTag', 'make the AirTag three', 'buy AirPods Max', 'search lofi beats on Apple Music',
    'remove the iPhone', 'remove the AirTag', 'buy me an iPhone 18 in orange and AirPods']) assert.equal(demoSteps(s), null, s);
});

test('demo: "iPhone 18" is the iPhone 18 Pro, with what was said about it, and AirPods', () => {
  const items = (s) => demoSteps(s)?.map((x) => x.item);
  assert.deepEqual(items('Dixi, buy me an iPhone 18 and AirPods, then open my bag'.split(', then')[0]), ['iPhone 18 Pro in black with 256 gigabytes', 'AirPods Pro']);
  assert.deepEqual(items('get me the iPhone 18 Pro Max in burgundy with 1 terabyte and AirPods Max'), ['iPhone 18 Pro Max in burgundy with 1 terabyte', 'AirPods Max']);
  assert.deepEqual(items('add AirPods and an iPhone eighteen'), ['AirPods Pro', 'iPhone 18 Pro in black with 256 gigabytes']);
  assert.match(productPage('iPhone 18 Pro Max in burgundy with 1 terabyte'), /iphone-18-pro\/6\.9-inch-display-1tb-burgundy-unlocked$/);
  assert.match(productPage('iPhone 18 Pro in black with 256 gigabytes'), /iphone-18-pro\/6\.3-inch-display-256gb-black-unlocked$/);
});

test('demo: the start of a line waits for the rest; whole commands do not', () => {
  assert.ok(demoPartial('buy me an iPhone 17 in black') && incomplete('buy me an iPhone 17 in black'));
  assert.ok(incomplete('make the iPhone'));
  assert.ok(incomplete('make the Air'), 'a word still arriving ("Air…" → AirTag)');
  assert.ok(incomplete('turn it'), '"turn it…" waits for up / down');
  assert.ok(!incomplete('open YouTube') && !incomplete('add an AirTag') && !incomplete('open the first result'));
});

test('demo: products open on their exact configuration page', () => {
  assert.match(productPage('iPhone 17 in black with 256 gigabytes'), /iphone-17\/6\.3-inch-display-256gb-black-unlocked$/);
  assert.match(productPage('MacBook Air in midnight'), /macbook-air\/13-inch-midnight-/);
  assert.equal(productPage('iPhone 17 in white'), null);
});

test('your three scenarios need no AI to understand', () => {
  assert.deepEqual(acts('Dixi, play lofi beats on YouTube'.slice(6)), ['search lofi beats 0', 'nth play 1']);
  assert.deepEqual(acts('search for wireless earbuds on Amazon and add the first one to my cart'), ['search wireless earbuds 0', 'add_to_cart  1']);
  assert.deepEqual(acts('make it two'), ['quantity set 2']);
});

test('back is a direction, never a site', () => {
  for (const s of ['go back', 'go back to the previous page', 'take me back', 'back a page']) assert.deepEqual(acts(s), ['nav back 0'], s);
});
