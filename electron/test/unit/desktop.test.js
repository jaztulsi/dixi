import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopIntent, runDesktop, layoutRect, parseBattery, parseDuration, validSite, DESKTOP } from '../../src/main/desktop.js';

const I = desktopIntent;
// A fake exec: records every call, answers from `replies` (a function of the joined args) or ''.
const rig = (reply = () => '', extra = {}) => {
  const calls = [], said = [], timers = [];
  const deps = {
    exec: async (cmd, args) => { calls.push([cmd, ...args]); const r = reply(cmd, args); if (r instanceof Error) throw r; return r ?? ''; },
    say: (t) => said.push(t), approve: async () => true, now: () => new Date(2026, 9, 30, 14, 5, 9), home: '/Users/sam',
    setTimer: (ms, fn) => { const t = { ms, fn, cancelled: false }; timers.push(t); return () => { t.cancelled = true; }; },
    screens: () => [{ x: 0, y: 25, width: 1440, height: 875 }, { x: 1440, y: 0, width: 1920, height: 1080 }],
    live: [], ...extra,
  };
  return { deps, calls, said, timers };
};

test('phrasings match the right verb', () => {
  const cases = {
    'volume up': { verb: 'volume', op: 'up' }, 'turn the volume down': { verb: 'volume', op: 'down' }, 'louder': { verb: 'volume', op: 'up' },
    'set the volume to 30 percent': { verb: 'volume', op: 'set', pct: 30 }, 'Dixi, volume 80.': { verb: 'volume', op: 'set', pct: 80 }, 'volume to 250': { verb: 'volume', op: 'set', pct: 100 },
    'mute': { verb: 'volume', op: 'mute' }, 'unmute the sound': { verb: 'volume', op: 'unmute' },
    'pause the music': { verb: 'media', op: 'pause', app: undefined }, 'play spotify': { verb: 'media', op: 'play', app: 'Spotify' }, 'resume the music': { verb: 'media', op: 'play', app: undefined },
    'next song': { verb: 'media', op: 'next' }, 'skip this track': { verb: 'media', op: 'next' }, 'previous song': { verb: 'media', op: 'previous' }, "what's playing": { verb: 'media', op: 'now' }, 'what song is this': { verb: 'media', op: 'now' },
    'go to youtube.com': { verb: 'site', url: 'https://youtube.com/' }, 'open nytimes.com': { verb: 'site', url: 'https://nytimes.com/' }, 'please visit www.bbc.co.uk/news': { verb: 'site', url: 'https://www.bbc.co.uk/news' }, 'go to youtube dot com': { verb: 'site', url: 'https://youtube.com/' },
    'snap it left': { verb: 'window', op: 'left' }, 'move this window to the right half': { verb: 'window', op: 'right' }, 'maximize': { verb: 'window', op: 'full' }, 'make it full screen': { verb: 'window', op: 'full' },
    'center the window': { verb: 'window', op: 'center' }, 'move it to the other screen': { verb: 'window', op: 'other' }, 'left half': { verb: 'window', op: 'left' },
    'set a timer for 10 minutes': { verb: 'timer', ms: 600000 }, 'timer for an hour and 30 minutes': { verb: 'timer', ms: 5400000 }, 'set a 5 minute timer': { verb: 'timer', ms: 300000 },
    'remind me in 5 minutes to call mom': { verb: 'timer', ms: 300000, label: 'call mom' }, 'remind me to take my pills in half an hour': { verb: 'timer', ms: 1800000, label: 'take my pills' },
    'what timers do I have': { verb: 'timers' }, 'cancel the timer': { verb: 'cancel', all: false }, 'cancel all timers': { verb: 'cancel', all: true },
    'turn on dark mode': { verb: 'dark', mode: 'on' }, 'dark mode': { verb: 'dark', mode: 'on' }, 'turn dark mode off': { verb: 'dark', mode: 'off' }, 'light mode': { verb: 'dark', mode: 'off' }, 'toggle dark mode': { verb: 'dark', mode: 'toggle' },
    'lock the screen': { verb: 'lock' }, 'lock my mac': { verb: 'lock' },
    'battery': { verb: 'battery' }, 'how much battery do I have left': { verb: 'battery' }, "what's my battery": { verb: 'battery' },
    'take a screenshot': { verb: 'screenshot' }, 'screenshot': { verb: 'screenshot' },
    'turn wifi off': { verb: 'wifi', on: false }, 'turn on the Wi-Fi': { verb: 'wifi', on: true }, 'disable wifi': { verb: 'wifi', on: false },
    'quit Safari': { verb: 'quit', app: 'Safari' }, 'quit the Google Chrome app': { verb: 'quit', app: 'Google Chrome' },
  };
  for (const [t, want] of Object.entries(cases)) assert.deepEqual(I(t), want, t);
});

test('screen questions, general requests and things left out do not match', () => {
  for (const t of ['what is this', 'open the first link', 'click send', 'open Spotify', 'open Notes', 'play lo fi beats', 'play the song despacito', 'remind me to call mom tomorrow',
    'center this text', 'open notes.md', 'open index.html', 'go to the next page', 'volume', 'quit', 'quit this', 'quit it', 'quit Dixi',
    'empty the trash', 'shut down', 'restart the computer', 'delete this file', 'delete all my files', 'turn it up', 'set a timer', 'lock the door', 'what is the battery of this screen mean?',
    'what song is it', 'how do I turn on dark mode in this app and also email it', 'skip', 'next', 'move it somewhere']) assert.equal(I(t), null, t);
  for (const t of ['empty the trash', 'shut down the mac', 'restart', 'delete my files', 'open Spotify', 'click send', 'what is this']) assert.ok(!DESKTOP.test(t), t);
  assert.equal(I('quit Dixi'), null);
});

test('the voice regex catches the same lines', () => {
  for (const t of ['volume up', 'Dixi, pause the music', 'go to youtube.com', 'set a timer for 10 minutes', "what's my battery", 'quit Safari', 'turn wifi off', 'snap it left']) assert.ok(DESKTOP.test(t), t);
});

test('durations and sites', () => {
  assert.equal(parseDuration('10 minutes'), 600000);
  assert.equal(parseDuration('ninety seconds'), 0);   // not a number word it knows: no timer rather than a wrong one
  assert.equal(parseDuration('90 seconds'), 90000);
  assert.equal(parseDuration('48 hours'), 0);
  assert.equal(I('set a timer for 48 hours'), null);
  assert.equal(validSite('youtube.com'), 'https://youtube.com/');
  for (const h of ['localhost', 'notes.md', '-bad.com', 'a b.com', '1.2.3.4']) assert.equal(validSite(h), null, h);
});

test('volume: reads the level first, clamps, and puts only a number in the script', async () => {
  let r = rig((c, a) => (/get volume settings/.test(a[1]) ? '55' : ''));
  assert.match((await runDesktop(I('volume up'), r.deps)).say, /65 percent/);
  assert.deepEqual(r.calls[1], ['osascript', '-e', 'set volume output volume 65 without output muted']);
  r = rig(() => '3');
  await runDesktop(I('volume down'), r.deps);
  assert.match(r.calls[1][2], /volume 0 /);
  r = rig();
  await runDesktop(I('set volume to 40'), r.deps);
  assert.equal(r.calls.length, 1);
  await runDesktop(I('mute'), r.deps);
  assert.match(r.calls[1][2], /with output muted/);
  await runDesktop(I('unmute'), r.deps);
  assert.match(r.calls[2][2], /without output muted/);
});

test('media: asks whether the app is running first, and does nothing if it is not', async () => {
  let r = rig((c, a) => (/Spotify" is running/.test(a[1]) ? 'false' : 'true'));
  const res = await runDesktop(I('pause the music'), r.deps);
  assert.match(res.say, /Paused/);
  assert.deepEqual(r.calls.map((c) => c[2]), ['application "Spotify" is running', 'application "Music" is running', 'tell application "Music" to pause']);
  r = rig(() => 'false');
  assert.match((await runDesktop(I('next song'), r.deps)).say, /aren't open/);
  assert.ok(r.calls.every((c) => /is running/.test(c[2])));   // nothing was told to do anything
  r = rig((c, a) => (/is running/.test(a[1]) ? 'true' : 'Song by Band'));
  assert.equal((await runDesktop(I("what's playing"), r.deps)).say, 'Playing Song by Band.');
  r = rig(() => 'true');
  await runDesktop(I('play spotify'), r.deps);
  assert.deepEqual(r.calls.map((c) => c[2]), ['application "Spotify" is running', 'tell application "Spotify" to play']);
});

test('open a website: only https and a valid host reach `open`', async () => {
  const r = rig();
  const res = await runDesktop(I('go to youtube.com'), r.deps);
  assert.deepEqual(r.calls, [['open', 'https://youtube.com/']]);
  assert.equal(res.say, 'Opening youtube.com.');
  const bad = rig();
  await runDesktop({ verb: 'site', url: 'javascript:alert(1)' }, bad.deps);
  await runDesktop({ verb: 'site', url: 'file:///etc/passwd' }, bad.deps);
  assert.equal(bad.calls.length, 0);
});

test('window layout: halves, maximize, centre and the other screen, from the screens it is given', () => {
  const screens = [{ x: 0, y: 25, width: 1440, height: 875 }, { x: 1440, y: 0, width: 1920, height: 1080 }];
  const win = { pos: [100, 100], size: [800, 600] };
  assert.deepEqual(layoutRect('left', screens, win), [0, 25, 720, 875]);
  assert.deepEqual(layoutRect('right', screens, win), [720, 25, 720, 875]);
  assert.deepEqual(layoutRect('full', screens, win), [0, 25, 1440, 875]);
  assert.deepEqual(layoutRect('center', screens, win), [320, 163, 800, 600]);
  assert.deepEqual(layoutRect('other', screens, win), [2000, 240, 800, 600]);
  assert.deepEqual(layoutRect('left', screens, { pos: [2000, 100], size: [800, 600] }), [1440, 0, 960, 1080]);   // on the second screen
  assert.equal(layoutRect('other', [screens[0]], win), null);
});

test('window verb: reads the front window, then sets it; the numbers go in as JSON', async () => {
  const r = rig((c, a) => (/JSON.stringify/.test(a[3]) ? JSON.stringify({ pos: [100, 100], size: [800, 600] }) : ''));
  const res = await runDesktop(I('snap it left'), r.deps);
  assert.equal(res.say, 'Left half.');
  assert.equal(r.calls.length, 2);
  assert.match(r.calls[1][4], /^const A = \{"r":\[0,25,720,875\]\};/);
  const one = rig((c, a) => JSON.stringify({ pos: [100, 100], size: [800, 600] }), { screens: () => [{ x: 0, y: 0, width: 1440, height: 900 }] });
  assert.match((await runDesktop(I('move it to the other screen'), one.deps)).say, /one screen/);
  assert.equal(one.calls.length, 1);
});

test('timers: in memory, fire through say, list and cancel', async () => {
  const r = rig();
  assert.equal((await runDesktop(I('set a timer for 10 minutes'), r.deps)).say, 'Timer set for 10 minutes.');
  assert.equal((await runDesktop(I('remind me in 5 minutes to call mom'), r.deps)).say, "Okay, I'll remind you in 5 minutes.");
  assert.deepEqual(r.timers.map((t) => t.ms), [600000, 300000]);
  assert.equal((await runDesktop(I('what timers do I have'), r.deps)).say, 'You have 2 timers: 10 minutes left, and 5 minutes left to call mom.');
  r.timers[1].fn();   // the reminder fires
  assert.deepEqual(r.said, ['Reminder: call mom.']);
  assert.equal(r.deps.live.length, 1);
  assert.equal((await runDesktop(I('cancel the timer'), r.deps)).say, 'Cancelled.');
  assert.ok(r.timers[0].cancelled);
  assert.match((await runDesktop(I('what timers do I have'), r.deps)).say, /don't have any/);
  assert.match((await runDesktop(I('cancel the timer'), r.deps)).say, /don't have any/);
  assert.equal(r.calls.length, 0);   // no program was run for timers
});

test('dark mode, lock, battery, screenshot', async () => {
  let r = rig(() => 'true');
  assert.equal((await runDesktop(I('dark mode'), r.deps)).say, 'Dark mode on.');
  assert.match(r.calls[0][4], /^const A = \{"mode":"on"\};/);
  r = rig(() => 'false');
  assert.equal((await runDesktop(I('toggle dark mode'), r.deps)).say, 'Dark mode off.');
  r = rig();
  await runDesktop(I('lock the screen'), r.deps);
  assert.deepEqual(r.calls, [['pmset', 'displaysleepnow']]);
  r = rig(() => "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t84%; charging; 0:42 remaining present: true");
  assert.equal((await runDesktop(I('battery'), r.deps)).say, '84 percent, charging.');
  assert.deepEqual(r.calls, [['pmset', '-g', 'batt']]);
  assert.equal(parseBattery("\t60%; discharging; 3:10 remaining"), '60 percent, on battery');
  assert.equal(parseBattery("Now drawing from 'AC Power'"), null);
  r = rig();
  await runDesktop(I('take a screenshot'), r.deps);
  assert.deepEqual(r.calls, [['screencapture', '-x', '/Users/sam/Desktop/Screenshot 2026-10-30 at 14.05.09.png']]);
});

test('wifi: off and on, no question first (no-confirmation rule)', async () => {
  const ports = 'Hardware Port: Ethernet\nDevice: en5\n\nHardware Port: Wi-Fi\nDevice: en1\n';
  const r = rig((c, a) => (a[0] === '-listallhardwareports' ? ports : ''), { approve: async () => assert.fail('never asks') });
  assert.equal((await runDesktop(I('turn wifi off'), r.deps)).say, 'Wi-Fi off.');
  assert.deepEqual(r.calls.at(-1), ['networksetup', '-setairportpower', 'en1', 'off']);
  await runDesktop(I('turn wifi on'), r.deps);
  assert.deepEqual(r.calls.at(-1), ['networksetup', '-setairportpower', 'en1', 'on']);
});

test('quit: only a running app, no question first, and the name is an argument', async () => {
  let r = rig((c, a) => (/is running/.test(a[1]) ? 'true' : ''), { approve: async () => assert.fail('never asks') });
  assert.equal((await runDesktop(I('quit Safari'), r.deps)).say, 'Quit Safari.');
  const last = r.calls.at(-1);
  assert.equal(last.at(-1), 'Safari');                       // the name rides as argv
  assert.ok(!last[2].includes('Safari'));                    // never inside the script
  r = rig(() => 'false');
  assert.match((await runDesktop(I('quit Notes'), r.deps)).say, /isn't open/);
  r = rig();
  await runDesktop({ verb: 'quit', app: 'x" to quit\ndo shell script "rm -rf ~' }, r.deps);   // a hostile name never gets near a script
  assert.equal(r.calls.length, 0);
});

test('a missing Automation permission is explained, not thrown', async () => {
  const r = rig(() => new Error('execution error: Not authorized to send Apple events to System Events. (-1743)'));
  const res = await runDesktop(I('dark mode'), r.deps);
  assert.match(res.say, /permission/);
  assert.match((await runDesktop(null, r.deps)).say, /don't know/);
});

test('a song on Apple Music: your library first, no subscription said plainly, else open it and press Play by its name', async () => {
  assert.deepEqual(desktopIntent('play Here Comes the Sun on Apple Music'), { verb: 'media', op: 'song', q: 'Here Comes the Sun', app: 'Music' });
  const noNet = { fetch: async () => assert.fail('no search needed'), find: async () => assert.fail('no press needed'), wait: async () => {} };
  const lib = rig((c, a) => (/search library/.test(a[1]) ? 'Here Comes the Sun by The Beatles' : ''), noNet);
  assert.equal((await runDesktop(desktopIntent('play Here Comes the Sun on Apple Music'), lib.deps)).say, 'Playing Here Comes the Sun by The Beatles.');
  assert.equal(lib.calls[0].at(-1), 'Here Comes the Sun', 'the song name goes in as an argument, never as script text');
  const free = rig((c, a) => (/Join Apple Music/.test(a[1]) ? 'true' : ''), noNet);
  assert.equal((await runDesktop(desktopIntent('play Here Comes the Sun on Apple Music'), free.deps)).say, 'Apple Music needs a subscription to play this.');
  assert.ok(!free.calls.some((c) => c[0] === 'open'), 'nothing opened, no YouTube');
  const pressed = [];
  const sub = rig((c, a) => (/player state is playing/.test(a?.[1]) && pressed.length ? 'Here Comes the Sun by The Beatles' : /Join Apple Music/.test(a?.[1]) ? 'false' : ''), {
    fetch: async (u) => { assert.match(u, /^https:\/\/itunes\.apple\.com\/search\?term=Here\+Comes\+the\+Sun&/); return { json: async () => ({ results: [{ trackName: 'Here Comes the Sun', trackViewUrl: 'https://music.apple.com/us/album/here-comes-the-sun/1441164426?i=1441164589&uo=4' }] }) }; },
    find: async (name) => (name === 'Play' ? [{ path: [0, 3], labels: ['Play'] }] : []),
    press: async (p, l) => { pressed.push([p, l]); return 'ok'; }, wait: async () => {},
  });
  assert.equal((await runDesktop(desktopIntent('play Here Comes the Sun on Apple Music'), sub.deps)).say, 'Playing Here Comes the Sun by The Beatles.');
  assert.deepEqual(sub.calls.find((c) => c[0] === 'open'), ['open', 'music://music.apple.com/us/album/here-comes-the-sun/1441164426?i=1441164589&uo=4']);
  assert.deepEqual(pressed, [[[0, 3], ['Play']]]);
});

test('"open a new Finder window": the app comes to the front, then ⌘N; never pressed into another app', async () => {
  assert.deepEqual(desktopIntent('open a new Finder window'), { verb: 'newwin', app: 'Finder' });
  assert.deepEqual(desktopIntent('open a new window in Safari'), { verb: 'newwin', app: 'Safari' });
  assert.equal(desktopIntent('open a new private window'), null, 'a kind of window is not an app');
  const keys = []; let fronts = ['Dixi', 'Finder'];
  const ok = rig(() => '', { open: async (a) => a === 'Finder', front: async () => ({ name: fronts.shift() ?? 'Finder' }), key: async (k) => keys.push(k), wait: async () => {} });
  assert.equal((await runDesktop(desktopIntent('open a new Finder window'), ok.deps)).say, 'New Finder window.');
  assert.deepEqual(keys, ['cmd+n']);
  keys.length = 0;
  const stuck = rig(() => '', { open: async () => true, front: async () => ({ name: 'Google Chrome' }), key: async (k) => keys.push(k), wait: async () => {} });
  assert.match((await runDesktop(desktopIntent('open a new Finder window'), stuck.deps)).say, /didn't come to the front/);
  assert.deepEqual(keys, [], 'no ⌘N into the wrong app');
  const none = rig(() => '', { open: async () => false, key: async () => assert.fail('no key') });
  assert.equal((await runDesktop(desktopIntent('open a new Flurb window'), none.deps)).say, "There's no app called Flurb on this Mac.");
});

test('"start a new note": the front app\'s New key; after "open Notes", only once Notes is in front', async () => {
  assert.deepEqual(desktopIntent('start a new note'), { verb: 'new', what: 'note' });
  for (const c of ['start a new line', 'make a new folder on my desktop called homework', 'create a new password']) assert.notEqual(desktopIntent(c)?.verb, 'new', c);
  const keys = [], key = async (k) => keys.push(k);
  await runDesktop(desktopIntent('open a new tab'), rig(() => '', { key }).deps);
  await runDesktop({ verb: 'new', what: 'note', app: 'Notes' }, rig(() => '', { open: async () => true, front: async () => ({ name: 'Notes' }), key, wait: async () => {} }).deps);
  assert.deepEqual(keys, ['cmd+t', 'cmd+n']);
  const r = await runDesktop({ verb: 'new', what: 'note', app: 'Notes' }, rig(() => '', { open: async () => true, front: async () => ({ name: 'Mail' }), key, wait: async () => {} }).deps);
  assert.deepEqual([r.ok, keys.length], [false, 2], 'Notes never came: no ⌘N into Mail');
});

test('"play some music": Music carries on, else shuffles your library; an empty library with no subscription is said plainly', async () => {
  assert.deepEqual(desktopIntent('play some music'), { verb: 'media', op: 'play', app: undefined });
  const off = (reply) => rig((c, a) => (/is running/.test(a[1]) ? 'false' : reply(a[1])));
  const lib = off((s) => (/play library playlist 1/.test(s) ? 'Yesterday by The Beatles' : ''));
  assert.equal((await runDesktop(desktopIntent('play some music'), lib.deps)).say, 'Playing Yesterday by The Beatles.', 'nothing open: Music opens and plays');
  const empty = off((s) => (/play library playlist 1/.test(s) ? 'empty' : /Join Apple Music/.test(s) ? 'true' : ''));
  assert.equal((await runDesktop(desktopIntent('play some music'), empty.deps)).say, "Your music library is empty, and Apple Music needs a subscription, so there's nothing to play.");
  const spot = rig((c, a) => (/"Spotify" is running/.test(a[1]) ? 'true' : ''));
  assert.equal((await runDesktop(desktopIntent('play some music'), spot.deps)).say, 'Playing.', 'Spotify open: it carries on there');
  assert.ok(spot.calls.some((c) => c.includes('tell application "Spotify" to play')));
});

test('search on Apple Music: opens its search page, and says so only once results for the words show', async () => {
  assert.deepEqual(desktopIntent('search lo-fi beats on Apple Music'), { verb: 'media', op: 'search', q: 'lo-fi beats', app: 'Music' });
  assert.equal(desktopIntent('search Apple Music for chill jazz').q, 'chill jazz');
  assert.equal(desktopIntent('search for chill jazz in Music').q, 'chill jazz');
  const shown = rig(() => '', { texts: async () => ['Search', 'Home', 'Lo‑Fi Station', 'Study Beats'], wait: async () => {} });
  assert.equal((await runDesktop(desktopIntent('search lo-fi beats on Apple Music'), shown.deps)).say, 'Here are the Apple Music results for lo-fi beats.');
  assert.match(shown.calls[0].at(-1), /^music:\/\/music\.apple\.com\/[a-z]{2}\/search\?term=lo-fi%20beats$/);
  const blank = rig(() => '', { texts: async () => ['Search', 'Home'], wait: async () => {} });
  assert.equal((await runDesktop(desktopIntent('search lo-fi beats on Apple Music'), blank.deps)).say, 'I opened Music, but no results for lo-fi beats showed up.', 'never "Done." on nothing');
});
