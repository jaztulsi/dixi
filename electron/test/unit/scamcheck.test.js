import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scamVerdict, SCAM_CHECK, gatherLinks, scamCheck } from '../../src/main/scamcheck.js';

const none = { moneyMethod: 'none', urgent: false, phoneNumber: '', asksToShareCode: false, relativeInTrouble: false, company: '', senderAddress: '', senderName: '' };
const facts = (o) => ({ ...none, ...o });

test('link text naming one site while the URL goes to another is flagged', () => {
  const link = { text: 'www.paypal.com/login', url: 'https://evil-site.xyz/x', frame: { x: 10, y: 10, w: 100, h: 20 } };
  const v = scamVerdict({ links: [link], facts: none });
  assert.notEqual(v.level, 'none');
  assert.match(v.reasons[0], /paypal\.com.*evil-site\.xyz/);
  assert.deepEqual(v.flagged, [link]);
});

test('look-alike hosts, raw IPs, shorteners and punycode are caught; the real site is not', () => {
  const bad = ['https://paypa1.com/a', 'http://203.0.113.9/a', 'https://bit.ly/abc', 'https://xn--pple-43d.com/'];
  for (const url of bad) assert.notEqual(scamVerdict({ links: [{ text: 'Click', url }] }).level, 'none', url);
  assert.equal(scamVerdict({ links: [{ text: 'paypal.com', url: 'https://www.paypal.com/signin' }], facts: none }).level, 'none');
});

test('sender from a look-alike address: the reason names the company and the address', () => {
  const v = scamVerdict({ facts: facts({ company: 'PayPal', senderAddress: 'service@paypa1-help.com' }) });
  assert.equal(v.level, 'scam');
  assert.match(v.reasons[0], /PayPal.*paypa1-help\.com/);
});

test('a gift-card demand is a scam and says to call the number on the card', () => {
  const v = scamVerdict({ facts: facts({ moneyMethod: 'gift_card' }) });
  assert.equal(v.level, 'scam');
  assert.match(v.say, /back of your card/);
});

test('"this is your bank calling, read me the code" is a scam', () => {
  const v = scamVerdict({ facts: facts({ company: 'your bank', asksToShareCode: true, phoneNumber: '800-555-0100' }) });
  assert.equal(v.level, 'scam');
  assert.match(v.say, /Don't call the number in the message/);
});

test('a clean page gets the hedged wording, never "safe"', () => {
  const v = scamVerdict({ links: [], facts: none });
  assert.equal(v.level, 'none');
  assert.match(v.say, /can't be sure/);
  assert.doesNotMatch(v.say, /\bsafe\b|scam-proof|guaranteed/i);
});

test('at most 3 reasons; Guardian findings count', () => {
  const found = [{ level: 'stop', rule: 'tech-support', say: 'Fake virus warning.' }];
  const v = scamVerdict({ found, facts: facts({ urgent: true, phoneNumber: '1', moneyMethod: 'zelle', relativeInTrouble: true }), links: [{ text: 'a.com', url: 'https://b.com' }] });
  assert.equal(v.level, 'scam');
  assert.ok(v.reasons.length <= 3);
  assert.equal(v.reasons[0], 'Fake virus warning.');
  assert.equal(scamVerdict({ facts: facts({ urgent: true }) }).level, 'careful');
});

test('trigger phrases match; ordinary questions do not', () => {
  for (const s of ['is this real', 'Is this a scam?', 'is this email legit', 'is this safe', 'should I trust this', 'check this for me', 'is this message from my bank', 'Dixi, is this real?', 'is this a scam email'])
    assert.match(s, SCAM_CHECK, s);
  for (const s of ['is this the right file', 'what is this', 'is this the right button', 'check this box', 'is this real estate listing good'])
    assert.doesNotMatch(s, SCAM_CHECK, s);
});

test('gatherLinks reads through an injected runner and survives failure', async () => {
  const links = await gatherLinks({ pid: 1, run: async () => JSON.stringify([{ text: 'x', url: 'https://a.com', frame: null }, { bad: 1 }]) });
  assert.equal(links.length, 1);
  assert.deepEqual(await gatherLinks({ pid: 1, run: async () => { throw new Error('no'); } }), []);
  assert.deepEqual(await gatherLinks({ pid: 1, run: async () => 'nope' }), []);
});

test('scamCheck: fake model, marks in display points, model failure still gives a verdict', async () => {
  const shot = { b64: 'x', bounds: { x: 100, y: 0, width: 1000, height: 800 } };
  const link = { text: 'chase.com', url: 'https://secure-pay.top/x', frame: { x: 300, y: 50, w: 100, h: 20 } };
  const claude = async (body) => {
    assert.equal(body.model, 'claude-haiku-5-5');
    assert.ok(body.output_config.format.schema);
    assert.match(body.system, /untrusted/);
    return { content: [{ type: 'text', text: JSON.stringify(facts({ urgent: true, moneyMethod: 'gift_card' })) }] };
  };
  const r = await scamCheck({ shot, ctx: { name: 'Mail', title: 'Inbox' }, claude, image: () => ({}), links: [link] });
  assert.match(r.say, /likely a scam/);
  assert.deepEqual(r.marks.map(({ x, y }) => [x, y]), [[250, 60]]);
  const down = await scamCheck({ shot, ctx: {}, claude: async () => { throw new Error('offline'); }, image: () => ({}), links: [] });
  assert.match(down.say, /can't be sure/);
  assert.match(down.say, /couldn't read/);
});
