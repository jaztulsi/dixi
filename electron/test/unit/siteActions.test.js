import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSiteAction, runSiteAction, ordinal } from '../../src/renderer/core/siteActions.js';

const yt = 'https://www.youtube.com/results?search_query=lofi';
const amz = 'https://www.amazon.com/s?k=burrito';
const g = 'https://www.google.com/search?q=x';
const label = (c, u) => matchSiteAction(c, u)?.label ?? null;

test('matches common actions per site', () => {
  assert.equal(label('play the first video', yt), 'Playing video 1');
  assert.equal(label('Play the second video.', yt), 'Playing video 2');
  assert.equal(label('open the last one', yt), 'Playing video (last)');
  assert.equal(label('click on video 3', yt), 'Playing video 3');
  assert.equal(label('skip ad', yt), 'Skipping ad');
  assert.equal(label('skip the ads', yt), 'Skipping ad');
  assert.equal(label('add it to my cart', amz), 'Adding to cart');
  assert.equal(label('open the first result', g), 'Opening result 1');
  assert.equal(label('pause the video', yt), 'Paused');
  assert.equal(label('scroll down', g), 'Scrolling down');
  assert.equal(label('go back', g), 'Going back');
});

test('leaves everything else to the AI', () => {
  assert.equal(label('search for lofi beats', yt), null);
  assert.equal(label('who made this video', yt), null);
  assert.equal(label('add to cart', yt), null, 'cart only on Amazon');
  assert.equal(label('play the first video', 'about:blank'), null);
});

test('ordinals', () => {
  assert.deepEqual(ordinal('the third one'), { index: 2, label: '3' });
  assert.deepEqual(ordinal('video number two'), { index: 1, label: '2' });
  assert.equal(ordinal('a video'), null);
});

test('generated scripts are valid JavaScript', () => {
  for (const [c, u] of [['play the first video', yt], ['skip ad', yt], ['add the second one to cart', amz], ['add it to cart', amz], ['pause', yt], ['scroll down', g], ['open the first result', g]]) {
    assert.doesNotThrow(() => new Function(`return ${matchSiteAction(c, u).js}`), c);
  }
});

test('run retries while the page says wait, then reports', async () => {
  let calls = 0;
  const tabs = { waitUntilLoaded: async () => {}, executeJS: async () => (++calls < 3 ? 'wait' : 'ok: lofi hip hop radio') };
  assert.equal(await runSiteAction({ js: 'x', patience: 5 }, tabs), 'lofi hip hop radio');
  assert.equal(calls, 3);
  const never = { waitUntilLoaded: async () => {}, executeJS: async () => 'wait' };
  assert.equal(await runSiteAction({ js: 'x', patience: 0 }, never), "Couldn't find that on this page");
});
