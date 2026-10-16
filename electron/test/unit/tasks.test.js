import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTask, homeURL } from '../../src/renderer/core/tasks.js';

// What each request turns into: URLs opened/searched, then commands/orders/questions, in order.
const plan = (say, site = 'about:blank', extra = {}) => (planTask(say, { site, ...extra }) ?? null)?.map((s) =>
  s.do === 'command' ? `cmd:${s.text}` : s.do === 'order' ? `order:${s.item}` : s.do === 'ask' ? 'ask' : s.url.replace(/^https:\/\/(www\.)?/, ''));

test('tasks: the same request in any order gives the same steps', () => {
  const cases = [
    ['go to Burger King order me a chicken burger', ['bk.com/menu', 'cmd:find chicken burger on the menu', 'cmd:add it to the order']],
    ['order me a chicken burger from Burger King with no pickles', ['bk.com/menu', 'cmd:find chicken burger with no pickles on the menu', 'cmd:add it to the order']],
    ['a chicken burger from Burger King, order it', ['bk.com/menu', 'cmd:find chicken burger on the menu', 'cmd:add it to the order']],
    ['fries and a burger from McDonalds please', ['mcdonalds.com/menu', 'cmd:find fries and burger on the menu', 'cmd:add it to the order']],
    ['order me a burger', ['doordash.com/search/store/burger/']],
    ['buy me a phone charger', ['amazon.com/s?k=phone%20charger']],
    ['AirPods, Amazon, add to cart', ['amazon.com/s?k=airpods', 'cmd:open the first result', 'cmd:add it to cart']],
    ['cart, Amazon, AirPods', ['amazon.com/s?k=airpods', 'cmd:open the first result', 'cmd:add it to cart']],
    ['to my Amazon cart add a phone charger', ['amazon.com/s?k=phone%20charger', 'cmd:open the first result', 'cmd:add it to cart']],
    ['find AirPods on Amazon', ['amazon.com/s?k=airpods']],
    ['Amazon AirPods', ['amazon.com/s?k=airpods']],
    ['search Amazon for AirPods', ['amazon.com/s?k=airpods']],
    ['look for a gaming laptop on Best Buy', ['bestbuy.com/site/searchpage.jsp?st=gaming%20laptop']],
    ['play baby shark', ['youtube.com/results?search_query=baby%20shark', 'cmd:play the first video']],
    ['lofi beats YouTube play', ['youtube.com/results?search_query=lofi%20beats', 'cmd:play the first video']],
    ['YouTube, lofi, first video', ['youtube.com/results?search_query=lofi', 'cmd:play the first video']],
    ['play the second lofi video on YouTube', ['youtube.com/results?search_query=lofi', 'cmd:play video number 2']],
    ['search for cats on YouTube no wait dogs', ['youtube.com/results?search_query=dogs']],
    ['open Amazon actually open Best Buy', ['bestbuy.com']],
    ['who is the CEO of Tesla', ['google.com/search?q=who%20is%20the%20CEO%20of%20Tesla']],
    ["I'm hungry, find burger places near me", ['google.com/maps/search/burger%20places']],
    ['find the nearest Starbucks', ['google.com/maps/search/starbucks']],
    ['show me the Taco Bell menu', ['tacobell.com/menu']],
    ['go to Burger King', ['bk.com']],
    ['take me to GitHub', ['github.com']],
    ['open the Home Depot website', ['homedepot.com']],
    ['new tab, Wikipedia, black holes', ['cmd:new tab', 'en.wikipedia.org/wiki/Special:Search?search=black%20holes']],
  ];
  for (const [say, want] of cases) assert.deepEqual(plan(say), want, say);
});

test('tasks: follow-ups use where you are', () => {
  assert.deepEqual(plan('order me a Whopper', 'https://www.bk.com'), ['cmd:find whopper on the menu', 'cmd:add it to the order']);
  assert.deepEqual(plan('search jazz', 'https://www.youtube.com/results?search_query=lofi'), ['youtube.com/results?search_query=jazz']);
  assert.deepEqual(plan('tell me how tall it is', 'https://en.wikipedia.org/wiki/Special:Search?search=eiffel'), ['ask']);
  assert.deepEqual(plan('show it on Google Maps', 'https://en.wikipedia.org/wiki/Eiffel_Tower', { lastQuery: 'eiffel tower' }), ['google.com/maps/search/eiffel%20tower']);
  assert.deepEqual(plan('search them', 'https://www.amazon.com/s?k=headphones'), []);
  assert.deepEqual(plan('open it', 'https://www.amazon.com/s?k=headphones'), ['cmd:open the first result']);
});

test('tasks: leaves alone what the rules or the AI should handle', () => {
  for (const say of ['play the first video', 'pause it', 'scroll down', 'get me that thing', 'go to the top of the page', 'open the first one']) {
    const p = plan(say, 'https://www.youtube.com/watch?v=x');
    assert.ok(p == null || say === 'go to the top of the page', `${say} → ${JSON.stringify(p)}`);
  }
  assert.equal(homeURL('Panda Express'), 'https://www.pandaexpress.com');
});
