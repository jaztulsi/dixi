import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntentModel, ReplyCache, intentForSteps, say } from '../../src/renderer/core/learn.js';

const intentOf = (m, t) => m.predict(t)?.intent ?? null;

test('model: paraphrases map to the right intent with no API call', () => {
  const m = new IntentModel();
  const cases = {
    'put on the second clip': 'play_nth', 'start the top one': 'play_nth', 'play first video': 'play_nth',
    'click on the first result': 'play_nth', 'pause the music': 'pause', 'hit pause please': 'pause',
    'make it louder': 'volume_up', 'turn it down a bit': 'volume_down', 'scroll down some more': 'scroll_down',
    'take me back': 'back', 'refresh the page please': 'reload', 'open a new tab': 'new_tab',
    'close this tab': 'close_tab', 'speed it up': 'faster', 'skip this ad': 'skip_ad', 'play the next song': 'next_video',
    'rewind ten seconds': 'rewind', 'turn on subtitles': 'captions',
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(intentOf(m, text), want, text);
});

test('model: chatter and free-text commands are left to the AI', () => {
  const m = new IntentModel();
  for (const t of ['this is working pretty well', 'click the videos filter', 'type hello world in the box',
    'I think the weather is nice', 'sort by price low to high', 'five six seven seconds']) {
    assert.equal(intentOf(m, t), null, t);
  }
});

test('model: keeps which one you asked for', () => {
  const m = new IntentModel();
  assert.equal(say(intentOf(m, 'put on the second clip'), 'put on the second clip'), 'play video number 2');
  assert.equal(say('play_nth', 'start the top one'), 'play the first video');
  assert.equal(say('play_nth', 'watch the last one'), 'play the last video');
});

test('model: learns a new phrasing from the AI and remembers it across launches', () => {
  const store = new Map();
  const ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const m = new IntentModel(ls);
  const phrase = 'yeet me down the page';
  assert.equal(intentOf(m, phrase), null);
  m.learn(phrase, intentForSteps([{ action: 'scroll', target: 'page', detail: 'down' }]));
  assert.equal(intentOf(m, phrase), 'scroll_down');
  assert.equal(intentOf(new IntentModel(ls), phrase), 'scroll_down', 'persisted');
});

test('reply cache: same clause on the same site skips the AI', () => {
  const c = new ReplyCache();
  const steps = [{ action: 'click', target: 'Videos filter', detail: '' }];
  c.set('https://www.youtube.com/results?search_query=x', 'Click the videos filter.', steps);
  assert.deepEqual(c.get('https://youtube.com/watch?v=1', 'click the videos filter'), steps);
  assert.equal(c.get('https://amazon.com/', 'click the videos filter'), null);
});
