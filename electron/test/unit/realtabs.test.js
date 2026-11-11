// RealTabs: your own browser behind the executor's `tabs` contract, through a fake Apple Events bridge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { RealTabs, wrapJS, browserOf, makeBridge, JS_OFF } from '../../src/main/realtabs.js';

/** A tab whose page is a plain JS context (no DOM): enough to test the wrapper, promises, URLs and errors. */
function fakeBrowser({ url = 'https://shop.example/p/1', error = null } = {}) {
  const page = vm.createContext({ JSON, document: { readyState: 'complete' }, history: {}, location: {} });
  page.window = page;
  const log = [];
  let at = url;
  const bridge = {
    call: async (m) => {
      log.push(m.op);
      if (error) return { id: 1, error };
      if (m.op === 'go') { at = m.url; return { url: at, title: 'New', loading: false }; }
      if (m.op === 'js') { const value = vm.runInContext(m.js, page); await Promise.resolve(); return { value, url: at, title: 'Shop', loading: false }; }
      return { url: at, title: 'Shop', loading: false };
    },
  };
  return { tabs: new RealTabs({ bridge, browser: { app: 'Google Chrome', kind: 'chromium' } }), page, log };
}

test('the browser in front: Chrome-family and Safari by bundle id or name; anything else is not one', () => {
  assert.equal(browserOf({ bundle: 'com.google.Chrome' }).kind, 'chromium');
  assert.equal(browserOf({ app: 'Safari' }).kind, 'safari');
  assert.equal(browserOf({ bundle: 'com.apple.Notes', app: 'Notes' }), null);
});

test('exec: values come back as values; page errors as "JS error"; the URL and title are kept for the sync getters', async () => {
  const { tabs } = fakeBrowser();
  assert.deepEqual(await tabs.exec(null, '[1, "two", {a: true}]'), [1, 'two', { a: true }]);
  assert.equal(await tabs.exec(null, 'undefined'), null);
  assert.match(await tabs.exec(null, 'nope.boom'), /^JS error: .*nope/);
  assert.equal(tabs.getCurrentURL(), 'https://shop.example/p/1');
  assert.equal(tabs.activeTab.title, 'Shop');
});

test('a promise in the page (the toolkit\'s quiet) is read back by polling until it settles', async () => {
  const { tabs, page } = fakeBrowser();
  page.later = () => new Promise((r) => setTimeout(() => r('settled'), 150));
  page.setTimeout = setTimeout;
  assert.equal(await tabs.exec(null, 'later()', 3000), 'settled');
});

test('JavaScript from Apple Events turned off is named, so Dixi can say how to turn it on', async () => {
  const { tabs } = fakeBrowser({ error: 'Executing JavaScript through AppleScript is turned off. To turn it on, from the menu bar, go to View > Developer > Allow JavaScript from Apple Events.' });
  assert.match(await tabs.exec(null, '1'), /^JS error/);
  assert.equal(tabs.problem, 'js-off');
  assert.ok(JS_OFF.test('Safari: You must enable "Allow JavaScript from Apple Events"'));
});

test('navigate: http(s) only; resolves once the new address is in and parsed', async () => {
  const { tabs } = fakeBrowser();
  await assert.rejects(tabs.navigate('javascript:alert(1)'), /Refused/);
  await assert.rejects(tabs.navigate('file:///etc/passwd'), /Refused/);
  assert.equal(await tabs.navigate('shop.example/cart'), 'navigate');
  assert.equal(tabs.getCurrentURL(), 'https://shop.example/cart');
});

test('wrapJS installs the toolkit for toolkit calls and returns a JSON string either way', () => {
  const w = wrapJS('1 + 1');
  assert.equal(vm.runInNewContext(w, { JSON }), '2');
  assert.match(wrapJS('foo()', 7), /__p:7/);
});

test('the bridge: one worker, answers matched by id, a hang kills it and the next call starts a new one', async () => {
  const kids = [];
  const spawn = () => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.stdin = { write: (l) => { const m = JSON.parse(l); if (m.op !== 'hang') setImmediate(() => c.stdout.emit('data', `${JSON.stringify({ id: m.id, url: 'u' + m.id })}\n`)); } };
    c.kill = () => c.emit('exit'); kids.push(c); return c;
  };
  const b = makeBridge({ spawn });
  const [a, z] = await Promise.all([b.call({ op: 'state' }), b.call({ op: 'state' })]);
  assert.deepEqual([a.url, z.url, kids.length], ['u1', 'u2', 1]);
  assert.match((await b.call({ op: 'hang' }, 50)).error, /did not answer/);
  assert.equal((await b.call({ op: 'state' })).url, 'u4');
  assert.equal(kids.length, 2);
});
