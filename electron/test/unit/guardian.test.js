import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContext, checkText, coolingOff, held, track, blocking, setRule, POLICY, COOL_MS, findingsNote } from '../../src/main/guardian.js';

const web = (url) => ({ name: 'Google Chrome', bundle: 'com.google.Chrome', url, title: '' });
const rules = (found) => found.map((f) => f.rule);

test('real sites pass', () => {
  for (const u of ['https://paypal.com/', 'https://www.apple.com/', 'https://accounts.google.com/signin', 'https://chase.com/', 'https://www.irs.gov/refunds',
    'https://www.amazon.co.uk/', 'https://smile.amazon.com/', 'https://support.apple.com/', 'https://login.microsoftonline.com/', 'https://www.ssa.gov/',
    'https://tools.usps.com/go/TrackConfirmAction', 'https://apple.stackexchange.com/', 'https://www.paypal-community.com/', 'https://www.google-analytics.com/',
    'https://www.wellsfargoadvisors.com/', 'https://www.applebees.com/', 'https://www.purchase.com/', 'https://phase.com/', 'https://github.com/', 'https://en.wikipedia.org/',
    'https://www.amazon.jobs/', 'https://www.google.de/', 'https://apple.news/x', 'https://drive.google.com/', 'http://localhost:3000/', 'http://192.168.1.1/', 'file:///Users/me/a.html', '']) {
    assert.deepEqual(checkContext(web(u)), [], u);
  }
  assert.deepEqual(checkContext({ name: 'Notes', bundle: 'com.apple.Notes' }), []);
  assert.deepEqual(checkContext(null), []);
});

test('look-alike addresses are stopped', () => {
  for (const u of ['https://paypa1.com/', 'https://apple-id-verify.com/', 'https://chase.com.login-secure.net/', 'https://xn--pple-43d.com/', 'https://arnazon.com/',
    'https://paypal.com.secure-login.xyz/', 'https://usps.com-track.info/', 'https://micros0ft.com/', 'https://rnicrosoft-support.com/', 'https://wellsfargo-login.net/',
    'https://www.bankofamerca.com/', 'https://paypalsecure.com/', 'https://paypal.xyz/', 'https://ups-tracking-help.top/', 'https://аpple.com/']) {
    const f = checkContext(web(u));
    assert.equal(f[0]?.rule, 'lookalike', u);
    assert.equal(f[0].level, 'stop', u);
  }
  assert.match(checkContext(web('https://paypa1.com/'))[0].say, /PayPal/);
});

test('other look-alike letters warn', () => {
  assert.deepEqual(rules(checkContext(web('https://xn--mnchen-3ya.de/'))), ['punycode']);   // münchen.de: real, but worth a look
});

test('remote-access apps and their download pages warn', () => {
  for (const ctx of [{ name: 'AnyDesk', bundle: 'com.philandro.anydesk' }, { name: 'TeamViewer', bundle: 'com.teamviewer.TeamViewer' },
    { name: 'ScreenConnect Client', bundle: '' }, { name: 'RustDesk', bundle: 'com.carriez.rustdesk' }, { name: 'Splashtop Streamer' },
    { name: 'Zoho Assist' }, { name: 'LogMeIn Client' }, { name: 'UltraViewer' }, web('https://anydesk.com/en/downloads'), web('https://remotedesktop.google.com/support')]) {
    const f = checkContext(ctx);
    assert.deepEqual(rules(f), ['remote-access'], ctx.name + (ctx.url ?? ''));
    assert.equal(f[0].level, 'warn');
    assert.equal(f[0].say, "If someone on the phone asked you to open this, it's likely a scam. Hang up first.");
  }
});

test('scam text is caught', () => {
  const cases = {
    'tech-support': ['WARNING! Your computer is infected with 3 viruses. Call 1-888-555-0199 now.', 'Call Microsoft Support immediately',
      'Your Mac has been locked. Contact Apple at (844) 555-0123.', 'Do not close this window or restart your computer'],
    'gift-card': ['buy five $100 gift cards', 'You can pay the IRS fine with Google Play gift cards', 'Read me the numbers on the back of the card, the gift cards', 'go buy $500 in Apple gift cards'],
    'crypto-wire': ['Send the payment in Bitcoin to this wallet', 'Go to the Bitcoin ATM at the gas station', 'Move your savings to a safe account to protect it', 'wire $5,000 to the agent', 'pay by Western Union today'],
    urgency: ['Act now or lose access', 'Your account will be closed within 24 hours', 'Final notice: verify your account now'],
    refund: ['We accidentally refunded you $5,000 instead of $50', 'Our system refunded you too much', 'Please send back the difference'],
  };
  for (const [rule, samples] of Object.entries(cases)) for (const s of samples) assert.ok(rules(checkText(s)).includes(rule), `${rule}: ${s}`);
});

test('ordinary text is not', () => {
  for (const s of ['Your order has shipped', 'Pay with a gift card', 'Enter your gift card number and PIN', 'Earn a $200 gift card when you open an account',
    'Buy a gift card for a friend', 'Buy 2 gift cards for the grandkids', 'If your account is locked, call us at 1-800-935-9935', 'Questions? Call 1-800-555-0100',
    'Track your package', 'Antivirus software reviews', 'Coinbase: buy bitcoin', 'Send Money Online | Western Union', '']) {
    assert.deepEqual(checkText(s), [], s);
  }
});

test('stops come first, one finding per rule', () => {
  const f = checkText('Act now! Your computer is infected, call 1-888-555-0199. Pay with gift cards to fix it, five of them.');
  assert.equal(f[0].level, 'stop');
  assert.equal(f.at(-1).rule, 'urgency');
  assert.equal(new Set(rules(f)).size, f.length);
  assert.match(findingsNote(f), /Never contradict/);
  assert.equal(findingsNote([]), '');
});

test('cooling-off: a stop holds that site for 15 minutes, then lets go', () => {
  const t0 = 1_000_000;
  const scam = web('https://paypa1.com/login');
  const [f] = checkContext(scam);
  let s = coolingOff(undefined, f, scam, t0);
  assert.equal(held(s, web('https://paypa1.com/other-page'), t0 + 60000).mins, 14);   // same site, any page
  assert.match(held(s, scam, t0 + 60000).say, /14 more minutes/);
  assert.equal(held(s, web('https://chase.com/'), t0), null);                         // other sites are free
  assert.equal(held(s, scam, t0 + COOL_MS - 1).mins, 1);
  assert.equal(held(s, scam, t0 + COOL_MS), null);
  // A warn never holds; a new stop restarts the clock; expired holds are dropped.
  assert.deepEqual(coolingOff({}, { level: 'warn', rule: 'urgency' }, scam, t0).holds, {});
  s = coolingOff(s, f, scam, t0 + 10 * 60000);
  assert.equal(held(s, scam, t0 + 20 * 60000).mins, 5);
  assert.deepEqual(coolingOff(s, null, scam, t0 + 60 * 60000).holds, {});
  // No web page: the app is held.
  const app = { name: 'Messages' };
  s = coolingOff({}, checkText('buy five $100 gift cards')[0], app, t0);
  assert.ok(held(s, app, t0));
  assert.equal(held(s, { name: 'Notes' }, t0), null);
});

test('no approval while a finding is open or a cooling-off runs', () => {
  const t0 = 1_000_000;
  const clean = web('https://chase.com/');
  assert.equal(blocking(undefined, t0), null);
  assert.equal(blocking(track({}, [], clean, t0), t0), null);
  // A warn blocks approvals until the next request's scan replaces it, and starts no hold.
  let s = track({}, checkText('Act now'), clean, t0);
  assert.equal(blocking(s, t0).rule, 'urgency');
  s = track(s, [], clean, t0 + 1000);
  assert.equal(blocking(s, t0 + 1000), null);
  // A stop blocks approvals everywhere for 15 minutes, even after moving to a clean page.
  const scam = web('https://paypa1.com/');
  s = track({}, [...checkContext(scam), ...checkText('Act now')], scam, t0);
  assert.equal(s.open[0].level, 'stop');
  assert.ok(held(s, scam, t0));
  s = track(s, [], clean, t0 + 60000);
  assert.equal(blocking(s, t0 + 60000).mins, 14);
  assert.equal(held(s, clean, t0 + 60000), null);   // acting on the clean site is fine; approving isn't yet
  assert.equal(blocking(s, t0 + COOL_MS), null);
});

test('policy: narrowing is free, widening needs approval', () => {
  // Stricter: urgency warn → stop.
  let r = setRule(POLICY, 'urgency', { level: 'stop' });
  assert.ok(r.ok);
  assert.equal(checkText('Act now')[0].level, 'warn');            // the default table is untouched
  assert.equal(checkText('Act now', r.policy)[0].level, 'stop');
  // Looser: off, or stop → warn. Refused without approval, and refused for "approved: 'yes'".
  for (const change of [{ enabled: false }, { level: 'warn' }]) {
    r = setRule(POLICY, 'gift-card', change);
    assert.equal(r.ok, false);
    assert.equal(r.policy, POLICY);
    assert.equal(setRule(POLICY, 'gift-card', change, { approved: 'yes' }).ok, false);
  }
  r = setRule(POLICY, 'gift-card', { enabled: false }, { approved: true });
  assert.ok(r.ok);
  assert.deepEqual(checkText('buy five $100 gift cards', r.policy), []);
  // Turning a rule back on is narrowing again, so free.
  assert.ok(setRule(r.policy, 'gift-card', { enabled: true }).ok);
  assert.equal(setRule(POLICY, 'nope', { enabled: true }).ok, false);
  assert.equal(setRule(POLICY, 'refund', { level: 'block' }).ok, false);
  assert.throws(() => { POLICY.refund.enabled = false; });          // the table can't be edited in place
});
