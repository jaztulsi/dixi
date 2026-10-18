import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakable, say } from '../../src/main/speakable.js';

test('speakable: numbers are said as words (what Dixi actually says in the demo)', () => {
  assert.equal(say(1615), 'one thousand six hundred fifteen');
  assert.equal(speakable('Your bag total is $1,615.16.'), 'Your bag total is one thousand six hundred fifteen dollars and sixteen cents.');
  assert.equal(speakable('The iPhone 18 Pro 256GB Black costs $1,199.00.'), 'The iPhone eighteen Pro two hundred fifty-six gigabytes Black costs one thousand one hundred ninety-nine dollars.');
  assert.equal(speakable('The channel has 15.8 million subscribers.'), 'The channel has fifteen point eight million subscribers.');
  assert.equal(speakable('15.8M subscribers'), 'fifteen point eight million subscribers');
  assert.equal(speakable('It has a rating of 4.8 out of 5 stars.'), 'It has a rating of four point eight out of five stars.');
  assert.equal(speakable('a 6.3-inch display at 120Hz with the A19 chip'), 'a six point three inch display at one hundred twenty hertz with the A nineteen chip');
  assert.equal(speakable('Quantity is now 2, 21st in line, 50% off'), 'Quantity is now two, twenty-first in line, fifty percent off');
  assert.equal(speakable('a 4K video'), 'a 4K video'.replace('4K', 'four K'));
});
