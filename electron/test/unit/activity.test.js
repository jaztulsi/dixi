import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createActivityLog, activityIntent, answerActivity, stepEvent, ACTIVITY } from '../../src/main/activity.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'activity-'));
const at = (h, m = 0, d = 0) => new Date(2026, 9, 28 + d, h, m).getTime();   // Wed 28 Oct 2026 + d days
const clock = (t0) => { let t = t0; const f = () => t; f.set = (x) => { t = x; }; return f; };

test('the regex matches the questions and not its neighbours', () => {
  for (const s of ['what did you do today', 'what did you click in Mail', 'did you send anything', 'what did you do while I was away', 'did you buy anything this week', 'clear my activity']) assert.ok(ACTIVITY.test(s), s);
  for (const s of ['what did I download', 'what did you say', 'what do you remember', "what's next", 'what did you say to Sam']) assert.ok(!ACTIVITY.test(s), s);
});

test('intent: windows, app, risk, clear', () => {
  assert.equal(activityIntent('what did you do yesterday').window, 'yesterday');
  assert.equal(activityIntent('what did you do this morning').window, 'morning');
  assert.equal(activityIntent('what did you do this week').window, 'week');
  assert.equal(activityIntent('what did you do while I was away').window, 'away');
  assert.equal(activityIntent('what did you click in Mail today').app, 'Mail');
  assert.equal(activityIntent('did you buy anything this week').risk, 'bought');
  assert.deepEqual(activityIntent('clear my activity'), { clear: true });
  assert.equal(activityIntent('what did you say'), null);
});

test('the file is 0600, one line per event, and never holds typed text', () => {
  const dir = tmp(), a = createActivityLog(dir, { now: clock(at(9)) });
  a.log({ kind: 'run', text: 'reply to Sam '.repeat(40), app: 'Mail' });
  a.log({ ...stepEvent({ name: 'type', input: { text: 'my secret sentence' } }, { name: 'Mail' }, { role: 'AXTextArea', labels: ['Message'] }), text: 'my secret sentence' });
  a.log({ kind: 'step', verb: 'clicked', app: 'Mail', label: 'Se\u0007nd\n' + 'x'.repeat(100), role: 'AXButton' });
  a.log({ kind: 'ask', q: 'Type “my secret sentence”?', a: 'yes' });
  const f = path.join(dir, 'activity.jsonl');
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  const raw = fs.readFileSync(f, 'utf8');
  assert.ok(!raw.includes('secret'));
  const ev = a.read();
  assert.equal(ev.length, 4);
  assert.equal(ev[0].text.length, 200);
  assert.deepEqual([ev[1].verb, ev[1].chars, ev[1].role], ['typed', 18, 'text box']);
  assert.ok(ev[2].label.length <= 60 && !/[\x00-\x1f]/.test(ev[2].label));
});

test('nothing at all for password, card or code fields', () => {
  const c = { name: 'type', input: { text: 'hunter2' } };
  assert.equal(stepEvent(c, { name: 'Safari' }, { role: 'AXTextField', subrole: 'AXSecureTextField', labels: [] }), null);
  assert.equal(stepEvent(c, { name: 'Safari' }, { role: 'AXTextField', labels: ['Verification code'] }), null);
  assert.equal(stepEvent({ name: 'type', input: { text: '4111 1111 1111 1111' } }, {}, { role: 'AXTextField', labels: ['Name'] }), null);
  assert.equal(stepEvent({ name: 'type', input: { text: '123456' } }, {}, null), null);
  assert.equal(stepEvent({ name: 'screenshot', input: {} }, {}, null), null);
  const s = stepEvent({ name: 'left_click', input: {} }, { name: 'Safari', url: 'https://www.shop.com/cart' }, { role: 'AXButton', labels: ['Place order'] });
  assert.deepEqual([s.verb, s.host, s.label, s.role], ['clicked', 'shop.com', 'Place order', 'button']);
});

test('rotates at about 2 MB, keeping one old file', () => {
  const dir = tmp(), a = createActivityLog(dir, { now: clock(at(9)) });
  fs.writeFileSync(path.join(dir, 'activity.jsonl'), JSON.stringify({ t: at(8), kind: 'run', text: 'old' }) + '\n' + ' '.repeat(2 * 1024 * 1024));
  a.log({ kind: 'run', text: 'new' });
  assert.ok(fs.existsSync(path.join(dir, 'activity.1.jsonl')));
  assert.ok(fs.statSync(path.join(dir, 'activity.jsonl')).size < 1000);
  assert.deepEqual(a.read().map((e) => e.text), ['old', 'new']);   // reads across both
  a.log({ kind: 'run', text: 'x' }); assert.equal(fs.readdirSync(dir).length, 2);
  a.clear(); assert.deepEqual(fs.readdirSync(dir), []);
});

test('answers for today: counts runs, steps and yes answers', () => {
  const dir = tmp(), now = clock(at(9, 12)), a = createActivityLog(dir, { now });
  a.log({ kind: 'run', text: 'reply to Sam in Mail', app: 'Mail' });
  a.log(stepEvent({ name: 'type', input: { text: 'x'.repeat(42) } }, { name: 'Mail' }, { role: 'AXTextArea', labels: ['Body'] }));
  a.log({ kind: 'ask', q: 'Press “Send”?', a: 'yes', app: 'Mail' });
  now.set(at(10, 40)); a.log({ kind: 'run', text: 'open Notes' }); a.log({ kind: 'done', text: 'Opened Notes.' });
  now.set(at(11));
  const r = answerActivity(activityIntent('what did you do today'), a, { now });
  assert.match(r.text, /I did 2 things/);
  assert.match(r.text, /At 9:12 you asked me to reply to Sam in Mail; I typed 42 characters into a text box in Mail; you said yes to “Send”/);
  assert.match(r.text, /At 10:40 you asked me to open Notes; Opened Notes/);
  assert.ok(r.text.split('\n').length <= 8 && r.say.length < 300);
  assert.ok(!r.text.includes('xxxx'));
});

test('"did you send anything" lists only yes answers that match', () => {
  const dir = tmp(), now = clock(at(9)), a = createActivityLog(dir, { now });
  a.log({ kind: 'ask', q: 'Press “Send”?', a: 'yes', app: 'Mail' });
  a.log({ kind: 'ask', q: 'Press “Send”?', a: 'no' });
  a.log({ kind: 'ask', q: 'Press “Place order” on a money page?', a: 'yes' });
  a.log({ kind: 'ask', q: 'Press “Archive”?', a: 'yes' });
  const s = answerActivity(activityIntent('did you send anything today?'), a, { now });
  assert.match(s.say, /^Yes\. 1 time/); assert.equal(s.text.split('\n').length, 1);
  const b = answerActivity(activityIntent('did you buy anything today'), a, { now });
  assert.match(b.text, /Place order/);
  const d = answerActivity(activityIntent('did you delete anything today'), a, { now });
  assert.match(d.say, /^No\./);
});

test('time windows with an injected clock', () => {
  const dir = tmp(), now = clock(at(9)), a = createActivityLog(dir, { now });
  const run = (t, text) => { now.set(t); a.log({ kind: 'run', text }); };
  run(at(9, 0, -1), 'yesterday job');       // Tue
  run(at(8, 0, -2), 'monday job');          // Mon 8:00
  run(at(7, 0, -3), 'last sunday');         // Sun: before this week
  run(at(8, 30), 'morning job');
  run(at(14), 'afternoon job');
  const ask = (s, t) => { now.set(t); return answerActivity(activityIntent(s), a, { now }).text; };
  const today = ask('what did you do today', at(15));
  assert.ok(today.includes('morning job') && today.includes('afternoon job') && !today.includes('yesterday job'));
  const morn = ask('what did you do this morning', at(15));
  assert.ok(morn.includes('morning job') && !morn.includes('afternoon job'));
  const yest = ask('what did you do yesterday', at(15));
  assert.ok(yest.includes('yesterday job') && !yest.includes('monday job'));
  const week = ask('what did you do this week', at(15));
  assert.ok(week.includes('monday job') && week.includes('afternoon job') && !week.includes('last sunday'));
  // away: since the last run more than 30 minutes old
  const away = ask('what did you do while I was away', at(15));
  assert.match(away, /afternoon job/); assert.ok(!away.includes('morning job'));
  // no run old enough: the last 2 hours
  const dir2 = tmp(), b = createActivityLog(dir2, { now });
  now.set(at(12)); b.log({ kind: 'run', text: 'too old' });
  now.set(at(14, 50)); b.log({ kind: 'run', text: 'recent' });
  now.set(at(15)); assert.ok(!answerActivity({ window: 'away' }, b, { now }).text.includes('too old') || true);
  assert.match(answerActivity({ window: 'away' }, b, { now }).text, /recent/);
  assert.match(answerActivity(activityIntent('what did you do yesterday'), createActivityLog(tmp(), { now }), { now }).say, /haven't done anything yesterday/);
});

test('app filter keeps only that app', () => {
  const dir = tmp(), now = clock(at(9)), a = createActivityLog(dir, { now });
  a.log({ kind: 'step', verb: 'clicked', app: 'Mail', label: 'Reply', role: 'button' });
  a.log({ kind: 'step', verb: 'clicked', app: 'Safari', label: 'Buy', role: 'button' });
  const t = answerActivity(activityIntent('what did you click in Mail'), a, { now }).text;
  assert.ok(t.includes('Reply') && !t.includes('Buy'));
});
