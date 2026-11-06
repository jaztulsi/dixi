import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickIntent, quickAnswer, QUICK } from '../../src/main/quick.js';

// Fixed clock: Friday 2026-10-30 18:05 UTC; the user is in New York (EDT, UTC-4 → 2:05 PM).
const now = new Date('2026-10-30T18:05:00Z');
const tz = 'America/New_York';
const ask = (q, web) => quickAnswer(q, { now, tz, webAnswer: web });

test('time and date', async () => {
  assert.match((await ask('what time is it')).say, /^It's two oh five PM\.$/);
  assert.match((await ask("what's the time in Tokyo")).say, /^It's three oh five AM tomorrow in Tokyo\.$/);
  assert.match((await ask('what time is it in London right now')).say, /^It's six oh five PM in London\.$/);
  assert.match((await ask('what time is it in India')).text, /^11:35 PM in India$/);
  assert.match((await ask('what time is it in Narnia')).say, /don't have a time zone/);
  assert.equal((await ask("what's the date")).text, 'Friday, October 30, 2026');
  assert.match((await ask('what day is it')).say, /^It's Friday, October thirtieth\.$/);
  assert.match((await ask("what's the date in 3 weeks")).text, /Friday, November 20, 2026/);
  assert.match((await ask('what is the date 2 days from now')).text, /Sunday, November 1, 2026/);
});

test('math', async () => {
  assert.equal((await ask("what's 15 percent of 80")).text, '15 % of 80 = 12');
  assert.match((await ask('12 times 37')).say, /four hundred forty-four/);
  assert.match((await ask('square root of 144')).say, /twelve/);
  assert.match((await ask("what's 1200 divided by 7")).say, /about one hundred seventy-one point four three/);
  assert.match((await ask('what is 5 squared plus 2')).say, /twenty-seven/);
  assert.match((await ask('10 minus 3 times 2')).say, /four/);
  assert.match((await ask('what is 1 divided by 0')).say, /divide by zero/);
  assert.equal(quickIntent('what is 2 plus eval(1)'), null);
  assert.equal(quickIntent("what's 5 and 6"), null);
  // spoken numbers, and the Calculator ask from a real run (it got stuck on "Press Enter?")
  assert.equal((await ask('Open up my calculator and search up ten times ten.')).text, '10 * 10 = 100');
  assert.match((await ask('what is twenty-five plus seven hundred')).say, /seven hundred twenty-five/);
  assert.equal((await ask("I got a five out of thirty two. What's my grade?")).text, '5/32 = 15.6%');
  for (const t of ['one', 'I got one of them', '3 out of 4 people agree', 'type ten times ten']) assert.equal(quickIntent(t), null, t);
});

test('conversions', async () => {
  assert.match((await ask('convert 5 miles to km')).say, /five miles is about eight point oh five kilometers|eight point zero five/);
  assert.match((await ask('what is 70 F in celsius')).text, /70 degrees fahrenheit ≈ 21\.1 degrees celsius/);
  assert.match((await ask('how many tablespoons in a cup')).say, /sixteen tablespoons/);
  assert.match((await ask('60 mph to km/h')).text, /96\.6/);
  assert.match((await ask('2 pounds in kilograms')).say, /about zero point nine one/);
  assert.match((await ask('5 kg to miles')).say, /can't turn/);
});

test('days until', async () => {
  assert.match((await ask('how many days until Christmas')).say, /Christmas is in fifty-six days/);
  assert.match((await ask('how many days until new year')).text, /^63 days/);
  assert.match((await ask('how many days until my birthday on May 3')).say, /Your birthday is in one hundred eighty-five days/);
  assert.match((await ask('how many days until Halloween')).say, /in one day|tomorrow/);
  assert.match((await ask('how many days till my birthday')).say, /Tell me the date/);
  assert.equal(quickIntent('how many days until the exam'), null);
});

test('spelling', async () => {
  const r = await ask('how do you spell necessary');
  assert.equal(r.say, 'necessary is spelled N, E, C, E, S, S, A, R, Y.');
  assert.equal(quickIntent('how do you spell this'), null);
});

test('web questions use the injected answerer', async () => {
  const asked = [];
  const web = async (q) => { asked.push(q); return 'Sunny, around seventy.'; };
  for (const q of ["what's the weather today", 'who won the Lakers game', "what's the news", 'who is the CEO of Apple']) assert.equal(quickIntent(q).kind, 'web', q);
  const r = await ask("what's the weather today", web);
  assert.equal(r.say, 'Sunny, around seventy.');
  assert.deepEqual(asked, ["what's the weather today"]);
  assert.match((await ask('what is the news', async () => null)).say, /couldn't look that up/);
  assert.match((await ask('what is the news', async () => { throw new Error('x'); })).say, /couldn't look that up/);
});

test('never matches the screen or an app', () => {
  for (const q of ['what is this', "what's on my screen", 'what does this button do', 'explain this email', "what's next", "what's my day",
    'what time is the meeting on this page', 'how many days until this deadline', 'summarize this', 'click send', 'open Safari', 'read this to me',
    'who is this', 'what is that', 'how old is this file', "what's the news on this page", 'what is the weather in this app', 'hello', 'what is 5']) {
    assert.equal(quickIntent(q), null, q);
  }
});

test('QUICK prefilter catches the real ones', () => {
  for (const q of ['what time is it', 'how do you spell cat', "what's the weather today", 'twelve times 37', 'how many days until Christmas', 'square root of 144']) assert.ok(QUICK.test(q), q);
});
