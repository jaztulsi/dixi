import { test } from 'node:test';
import assert from 'node:assert/strict';
import { granted, permWord, norm, dupes, keepers, clean, timeLabel, dayLabel, byDay, statusText } from '../../src/renderer/dashboard/dashboard-lib.js';

test('only complete, non-repeated commands are saved, trimmed', () => {
  const list = [
    { id: 'a', phrase: ' Claude ', action: 'app', target: ' Claude ', enabled: true },
    { phrase: 'claude!', action: 'website', target: 'claude.ai' },      // repeat of a saved one
    { phrase: 'YouTube', action: 'website', target: '' },               // no target yet
    { phrase: '  ', action: 'app', target: 'Mail' },                    // no phrase yet
    { phrase: 'Mail', action: 'app', target: 'Mail', enabled: false },
  ];
  assert.deepEqual(dupes(list), [false, true, false, false, false]);
  assert.deepEqual(keepers(list).map(clean), [
    { id: 'a', phrase: 'Claude', action: 'app', target: 'Claude', enabled: true },
    { phrase: 'Mail', action: 'app', target: 'Mail', enabled: false },
  ]);
  assert.equal(keepers(list)[0], list[0]);   // same objects, so ids from main can be put back
});

test('typing a repeat above a saved command never knocks the saved one out', () => {
  const list = [{ phrase: 'mail', action: 'app', target: '' }, { id: 'm', phrase: 'Mail', action: 'app', target: 'Mail' }];
  assert.deepEqual(dupes(list), [true, false]);
  const fresh = [{ phrase: 'news', action: 'app', target: '' }, { phrase: 'News', action: 'website', target: 'news.com' }];
  assert.deepEqual(dupes(fresh), [true, false]);   // the complete one wins
  assert.equal(norm('  Dixi,  Open   CLAUDE! '), 'dixi open claude');
});

test('activity is grouped by day, newest first, with 12-hour times', () => {
  const now = new Date(2026, 9, 30, 15, 0).getTime();
  const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
  const groups = byDay([
    { t: at(29, 20, 5), kind: 'done', line: 'b' },
    { t: at(30, 9, 12), kind: 'run', line: 'c' },
    { t: at(27, 8, 0), kind: 'ask', line: 'a' },
    { t: 'later', kind: 'step', line: 'no time' },
    { t: at(30, 14, 1), kind: 'step', line: 'd' },
  ], now, 'en-US');
  assert.deepEqual(groups.map((g) => g.label), ['Today', 'Yesterday', 'Tuesday, October 27']);
  assert.deepEqual(groups[0].items.map((i) => i.line), ['d', 'c']);
  assert.match(timeLabel(at(30, 9, 12), 'en-US'), /^9:12\sAM$/);
  assert.equal(dayLabel(new Date(2025, 11, 31, 23).getTime(), now, 'en-US'), 'Wednesday, December 31, 2025');
  assert.deepEqual(byDay(undefined), []);
});

test('permission words and the status pill', () => {
  assert.equal(granted('granted'), true);
  assert.equal(granted('true'), false);
  assert.deepEqual(['granted', true, 'denied', false, 'restricted', 'not-determined', null, 'unknown', undefined].map(permWord),
    ['On', 'On', 'Off', 'Off', 'Blocked on this Mac', 'Not set up yet', 'Not set up yet', 'Not checked yet', 'Not checked yet']);
  assert.equal(statusText({ prefs: { listening: true } }), 'Listening');
  assert.equal(statusText({ prefs: { listening: false } }), 'Mic off');
  assert.equal(statusText({ prefs: { listening: true }, watching: 'the download finishes' }), '👁 Watching: the download finishes');
  assert.equal(statusText(null), 'Mic off');
});
