import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitOnConjunctions, isQuestion, yesOrNo, afterWakeWord, parseSearch, platformFor, resolveURL,
  directNavigationURL, searchURL, agentTask, stepFingerprint, clauseKey, looksLikeURL,
} from '../../src/renderer/core/text.js';

test('splits clauses, tolerating Deepgram punctuation and fillers', () => {
  const cases = [
    ['open YouTube and search for lofi beats and, like, play the first video', ['open YouTube', 'search for lofi beats', 'play the first video']],
    ['open YouTube and search for lofi beats n, like, play the first video', ['open YouTube', 'search for lofi beats', 'play the first video']],
    ['Open YouTube, and then search for lofi beats.', ['Open YouTube', 'search for lofi beats.']],
    ['um, go to Amazon then search for bean burrito', ['go to Amazon', 'search for bean burrito']],
    ['search for songs like this', ['search for songs like this']],
    ['search for android phones', ['search for android phones']],
    ['search for nintendo games', ['search for nintendo games']],
    // No "and": Flux's commas/periods, or a command that can't be part of a query, start the next one.
    ['open YouTube, search lofi beats, play the first video.', ['open YouTube', 'search lofi beats', 'play the first video.']],
    ['Open YouTube. Search lofi beats. Play the first video', ['Open YouTube', 'Search lofi beats', 'Play the first video']],
    ['open youtube search lofi beats play the first video', ['open youtube', 'search lofi beats', 'play the first video']],
    ['search lofi beats, play the first one, turn it up', ['search lofi beats', 'play the first one', 'turn it up']],
    ['search for how to play guitar', ['search for how to play guitar']],
  ];
  for (const [input, want] of cases) assert.deepEqual(splitOnConjunctions(input), want, input);
});

test('questions vs polite commands', () => {
  assert.equal(isQuestion('who made this video and how many subs'), true);
  assert.equal(isQuestion('How many subscribers do they have?'), true);
  assert.equal(isQuestion('is this in stock'), true);
  assert.equal(isQuestion('can you open YouTube'), false);
  assert.equal(isQuestion('open YouTube'), false);
});

test('yes / no / neither', () => {
  assert.equal(yesOrNo('Yes.'), true);
  assert.equal(yesOrNo('yeah do it'), true);
  assert.equal(yesOrNo('No, cancel'), false);
  assert.equal(yesOrNo('nothing here'), null);
  assert.equal(yesOrNo('open youtube'), null);
});

test('wake word', () => {
  assert.equal(afterWakeWord('Dixi, open YouTube.'), 'open YouTube.');
  assert.equal(afterWakeWord('Dixie, open YouTube and search for lo fi beats.'), 'open YouTube and search for lo fi beats.');  // how Flux spells it
  assert.equal(afterWakeWord('Hey, Dixy. Search for lofi beats.'), 'Search for lofi beats.');
  assert.equal(afterWakeWord('Dixi'), '');
  assert.equal(afterWakeWord('this is working pretty well'), null);
  assert.equal(afterWakeWord('the runtime is slow'), null);
  assert.equal(afterWakeWord('we drove through dixon'), null);
});

test('instant search parsing', () => {
  const yt = 'https://www.youtube.com/watch?v=x';
  assert.deepEqual(parseSearch('Search for lofi beats.', yt), { query: 'lofi beats', platform: 'youtube' });
  assert.deepEqual(parseSearch('search for bean burrito on amazon', 'about:blank'), { query: 'bean burrito', platform: 'amazon' });
  assert.deepEqual(parseSearch('look up cute dogs', 'https://www.google.com/search?q=a'), { query: 'cute dogs', platform: 'google' });
  assert.equal(parseSearch('search for lofi beats n, play the first video', yt), null, 'query with another command');
  assert.equal(parseSearch('search for tv', 'https://www.bestbuy.com'), null, 'unknown site goes to the agent');
  assert.equal(parseSearch('click the second one', yt), null);
});

test('platform detection by host', () => {
  const cases = [['https://www.youtube.com/watch?v=abc', 'youtube'], ['youtube.com', 'youtube'], ['https://www.amazon.com/s?k=x', 'amazon'],
    ['https://www.netflix.com', null], ['https://x.com/home', 'x'], ['https://www.google.com/maps/place/x', 'google maps'],
    ['https://www.google.com/search?q=a', 'google'], ['https://mail.google.com/mail/u/0', 'gmail'], ['about:blank', null], ['https://www.bestbuy.com', null]];
  for (const [url, want] of cases) assert.equal(platformFor(url), want, url);
});

test('navigation helpers', () => {
  assert.equal(resolveURL('YouTube and'), 'https://www.youtube.com');
  assert.equal(resolveURL('facebook marketplace'), 'https://www.facebook.com/marketplace');
  assert.equal(resolveURL('example.org'), 'https://example.org');
  assert.equal(directNavigationURL('go to amazon'), 'https://www.amazon.com');
  assert.equal(directNavigationURL('go to amazon and search headphones'), null);
  assert.equal(searchURL('youtube', 'lofi beats'), 'https://www.youtube.com/results?search_query=lofi%20beats');
  assert.equal(looksLikeURL('example.com'), true);
  assert.equal(looksLikeURL('go to example'), false);
});

test('agent task wording is plain language', () => {
  assert.equal(agentTask({ action: 'click', target: 'first video', detail: 'current page' }, ''), 'Click first video');
  assert.equal(agentTask({ action: 'type', target: '', detail: 'hello' }, 'type hello'), 'Type "hello" into the right field. (The user said: "type hello")');
});

test('fingerprints and clause keys', () => {
  assert.equal(stepFingerprint({ action: 'open', target: 'youtube', detail: '' }), 'navigate:https://www.youtube.com');
  assert.equal(stepFingerprint({ action: 'search', target: 'youtube', detail: 'Lofi' }), 'search:lofi');
  assert.equal(clauseKey('Search for lofi beats.'), clauseKey('search for lofi beats'));
});
