// The purchase gate in a real browser (Chromium, no app, no keys): every way of pressing something that could
// pay or place an order must ask first. Pages are served from a fake shop so the address counts too.
import { test, expect, chromium } from '@playwright/test';
import { DX, PAGE_LIB } from '../../src/renderer/ui/pagekit.js';

const PRODUCT = `
  <form id="add" onsubmit="event.preventDefault(); window.sent = 'add'">
    <button type="submit">Add to cart • $25.00</button>
  </form>
  <button>Buy now</button>
  <button>Rent HD $3.99</button>
  <button onclick="window.sent = 'start'">Order now</button>
  <fieldset><legend>Purchase options</legend>
    <label><input type="radio" name="po" value="sns">Subscribe & Save: deliver every 2 weeks</label>
    <label><input type="radio" name="po" value="once">One-time purchase</label>
  </fieldset>
  <iframe id="pay" src="https://wallet.test/"></iframe>
  <a href="/p/book-light">Book Light for Reading, $12.99</a>
  <form id="find" onsubmit="event.preventDefault(); window.sent = 'search'"><input id="q" type="search" name="q"><button>Search</button></form>
  <div role="dialog" style="position:fixed;inset:0;background:#fff;opacity:.98">Add protection for $4.99? <button>Continue</button></div>`;
const CHECKOUT = `
  <form id="order" onsubmit="event.preventDefault(); window.sent = 'order'">
    <input id="gift" name="gift-message" placeholder="Gift message">
    <input id="cc" autocomplete="cc-number">
    <button type="submit" id="go">Continue</button>
    <button type="button" id="icon" aria-label=""><svg width="20" height="20"></svg></button>
    <button type="button">Order now</button>
  </form>`;

let browser, page;
test.beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route('https://shop.test/**', (r) => r.fulfill({ contentType: 'text/html', body: r.request().url().includes('/checkout') ? CHECKOUT : PRODUCT }));
  await page.route('https://wallet.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<input id="w" placeholder="Card">' }));
});
test.afterAll(() => browser?.close());

// A page that plants a fake toolkit under the old fixed name, before Dixi's arrives.
const open = async (path) => { await page.goto('https://shop.test' + path); await page.evaluate(() => { window.__dx = { clickRef: () => 'ok' }; }); await page.evaluate(PAGE_LIB); };
const dx = (fn, ...args) => page.evaluate(([n, f, a]) => window[n][f](...a), [DX, fn, args]);
const refOf = (pick) => page.evaluate(([n, p]) => window[n].elements().find((e) => (e.name + ' ' + e.hint).includes(p))?.ref, [DX, pick]);
const click = async (pick) => dx('clickRef', await refOf(pick), false);
const sent = () => page.evaluate(() => window.sent ?? null);

test('a bare "Buy now" and a priced "Rent" ask first; add to cart, "Order now" and a product link do not', async () => {
  await open('/p/lamp');
  expect(await click('Buy now')).toMatch(/^confirm: Buy now/);
  expect(await click('Rent HD')).toMatch(/^confirm/);
  expect(await click('Add to cart')).toMatch(/^ok/);
  expect(await sent()).toBe('add');
  expect(await click('Order now')).toMatch(/^ok/);   // starts a restaurant order
  expect(await sent()).toBe('start');
  expect(await click('Book Light')).toMatch(/^ok/);   // last: following the link leaves the page
  await page.waitForURL('**/book-light');
});

test('a repeating purchase option is never chosen without a yes', async () => {
  await open('/p/lamp');
  expect(await dx('choose', 'radio:po', '')).toMatch(/^confirm: subscribe/i);
  expect(await page.evaluate(() => document.querySelector('[value=sns]').checked)).toBe(false);
  expect(await dx('choose', 'radio:po', 'one-time purchase')).toBe('ok');
});

test('an offer box with a price is not dismissed like a cookie banner', async () => {
  await open('/p/lamp');
  await page.evaluate(() => document.querySelector('[role=dialog] button').addEventListener('click', () => { window.sent = 'offer'; }));
  expect(await dx('dismissOverlays')).toBe(0);
  expect(await sent()).toBe(null);
});

test('Enter and submit in a search box still go through; Enter in a frame Dixi can\'t read asks', async () => {
  await open('/p/lamp');
  expect(await dx('focus', await refOf('q'))).toBe('ok');
  expect(await dx('enterGate')).toBe(null);
  expect(await dx('submitSearch', await refOf('q'))).toBe('clicked');
  expect(await sent()).toBe('search');
  await page.frame({ url: /wallet\.test/ }).focus('#w');
  expect(await dx('enterGate')).toMatch(/^confirm: Enter inside/);
});

test('on a payment page: Enter, the form submit, an unnamed button, "Continue" and "Order now" all ask, and nothing is sent', async () => {
  await open('/checkout');
  expect(await dx('focus', await refOf('gift'))).toBe('ok');
  expect(await dx('enterGate')).toMatch(/^confirm/);
  expect(await dx('submitSearch', await refOf('gift'))).toMatch(/^confirm/);
  expect(await dx('formURL', await refOf('gift'))).toBe(null);
  expect(await click('icon')).toMatch(/^confirm: the unlabeled button/);
  expect(await click('Continue')).toMatch(/^confirm/);
  expect(await click('Order now')).toMatch(/^confirm/);
  expect(await sent()).toBe(null);
});
