import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAL_ADD, calIntent, validateItem, readBack, addToCalendar } from '../../src/main/calendar.js';

const NOW = new Date(2026, 9, 29, 8, 0);   // Thursday 29 October 2026
const dentist = { kind: 'event', title: 'Dentist, Dr. Lee', date: '2026-11-06', start: '14:00', end: '15:00', allDay: false, location: '12 Main Street', notes: '', confidence: 0.9 };

test('triggers match, near-misses do not', () => {
  for (const t of ['add this to my calendar', 'put this on my calendar', 'save this appointment', 'remind me about this tomorrow at 9', 'add this to my reminders', 'make a reminder for this']) assert.ok(calIntent(t), t);
  for (const t of ["what's on my calendar", 'open calendar', 'remind me in 10 minutes', "what's my day"]) assert.ok(!CAL_ADD.test(t), t);
});

test('read-back uses an absolute date, never "next Friday"', () => {
  const v = validateItem(dentist, { now: NOW });
  assert.equal(readBack(v.item, { now: NOW }), 'Add “Dentist, Dr. Lee” to your calendar on Friday, November 6th, from 2 to 3 PM, at 12 Main Street?');
  assert.ok(!/next/i.test(readBack(v.item, { now: NOW })));
});

test('invalid, past and far dates are refused; no date asks', () => {
  assert.equal(validateItem({ ...dentist, date: '2026-02-30' }, { now: NOW }).why, 'baddate');
  assert.equal(validateItem({ ...dentist, date: 'soon' }, { now: NOW }).why, 'baddate');
  assert.equal(validateItem({ ...dentist, date: '2026-10-01' }, { now: NOW }).why, 'past');
  assert.equal(validateItem({ ...dentist, date: '2026-10-01' }, { now: NOW, said: 'add what happened last week' }).ok, true);
  assert.equal(validateItem({ ...dentist, date: '2029-01-01' }, { now: NOW }).why, 'far');
  assert.equal(validateItem({ ...dentist, date: null }, { now: NOW }).why, 'nodate');
});

test('times: end before start becomes start + 1 hour; title and notes capped', () => {
  const v = validateItem({ ...dentist, start: '14:00', end: '13:00', title: 'x\u0007y'.padEnd(200, 'z'), notes: 'n'.repeat(500) }, { now: NOW });
  assert.equal(v.item.end, '15:00');
  assert.equal(v.item.title.length, 80);
  assert.ok(!/[\u0000-\u001f]/.test(v.item.title));
  assert.equal(v.item.notes.length, 200);
  assert.equal(validateItem({ ...dentist, start: '25:00' }, { now: NOW }).item.allDay, true);
});

test('"tomorrow at 9" overrides the screen and makes a reminder', () => {
  const v = validateItem(dentist, { now: NOW, said: 'remind me about this tomorrow at 9' });
  assert.equal(v.item.kind, 'reminder');
  assert.equal(v.item.date, '2026-10-30');
  assert.equal(v.item.start, '09:00');
  assert.equal(readBack(v.item, { now: NOW }), 'Remind you “Dentist, Dr. Lee” on Friday, October 30th, at 9 AM?');
});

// ---- the flow, with fakes ----
const fake = (raw) => async () => ({ content: [{ type: 'text', text: JSON.stringify(raw) }] });
const run = (extra = {}) => {
  const calls = { exec: [], said: [] };
  const o = { shot: {}, said: 'add this to my calendar', claude: fake(dentist), image: () => ({}), signal: new AbortController().signal, now: NOW,
    approve: async (q) => { calls.said.push(q); return true; }, askUser: async () => null, exec: async (a) => { calls.exec.push(a); return 'ok'; }, careful: true, ...extra };
  return addToCalendar(o).then((r) => ({ r, calls }));
};

test('yes: created, and the values travel as JSON args, not spliced', async () => {
  const evil = 'x"); Application("Finder").quit(); ("';
  const { r, calls } = await run({ claude: fake({ ...dentist, title: evil }) });
  assert.ok(r.ok);
  assert.equal(r.text, "Added. It's on your calendar for Friday.");
  const script = calls.exec[0][4];
  assert.ok(script.startsWith(`const A = ${JSON.stringify({ title: evil, start: '2026-11-06T14:00:00', end: '2026-11-06T15:00:00', allDay: false, location: '12 Main Street', notes: '' })};`));
  assert.ok(!script.slice(script.indexOf('; (()') ).includes('Finder'));   // the body is the fixed script; the text sits only inside the JSON
  assert.ok(calls.said[0].includes(evil.slice(0, 5)));   // it's read back as plain text, nothing acts on it
});

test('no: nothing is created', async () => {
  const { r, calls } = await run({ approve: async () => false });
  assert.equal(r.ok, false);
  assert.equal(calls.exec.length, 0);
});

test('invalid date: refused, nothing asked or created', async () => {
  const { r, calls } = await run({ claude: fake({ ...dentist, date: '2026-13-45' }) });
  assert.equal(r.ok, false);
  assert.equal(calls.exec.length + calls.said.length, 0);
});

test('no date: asks the user, then reads back the answer', async () => {
  let n = 0;
  const claude = async () => fake(n++ ? { date: '2026-11-06' } : { ...dentist, date: null })();
  const { r, calls } = await run({ claude, askUser: async () => 'November 6th' });
  assert.ok(r.ok);
  assert.ok(calls.said[0].includes('Friday, November 6th'));
  assert.equal((await run({ claude: fake({ ...dentist, date: null }) })).calls.exec.length, 0);   // no answer: nothing made
});

test('errors in plain words', async () => {
  const denied = await run({ exec: async () => { throw new Error('execution error: Not authorized to send Apple events to Calendar. (-1743)'); } });
  assert.match(denied.r.text, /System Settings.*Automation/);
  const none = await run({ exec: async () => { throw new Error('Error: NOCALENDAR'); } });
  assert.match(none.r.text, /no calendar/);
});

test('reminder goes to Reminders with the due time', async () => {
  const { r, calls } = await run({ said: 'remind me about this tomorrow at 9' });
  assert.equal(r.text, "Added. It's on your reminders for Friday.");
  assert.ok(calls.exec[0][4].includes("Application('Reminders')"));
  assert.ok(calls.exec[0][4].includes('"start":"2026-10-30T09:00:00"'));
});

test('normal mode never asks: added, said back in full, Undo offered; no day said = the next sensible one', async () => {
  const quiet = { careful: false, approve: async () => assert.fail('asked'), askUser: async () => assert.fail('asked'), exec: async () => 'id:EV-1' };
  const { r } = await run(quiet);
  assert.equal(r.text, 'Added “Dentist, Dr. Lee” to your calendar on Friday, November 6th, from 2 to 3 PM, at 12 Main Street. Say “undo that” to take it off.');
  assert.deepEqual(r.undo, { kind: 'event', id: 'EV-1' });
  const later = (await run({ ...quiet, claude: fake({ ...dentist, date: null }) })).r;   // 2 PM is still ahead at 8 AM: today
  assert.equal(later.item.date, '2026-10-29');
  assert.match(later.text, /^You didn’t say a day, so I picked the next one\. Added/);
  assert.equal((await run({ ...quiet, claude: fake({ ...dentist, date: null, start: '07:00', end: '08:00' }) })).r.item.date, '2026-10-30');   // 7 AM has passed: tomorrow
  const { removeArgs, removeFromCalendar } = await import('../../src/main/calendar.js');
  const evil = 'x"); Application("Finder").quit(); ("';
  assert.ok(removeArgs({ kind: 'event', id: evil })[4].startsWith(`const A = ${JSON.stringify({ id: evil })};`));
  assert.equal(await removeFromCalendar({ kind: 'reminder', id: 'R1' }, async (a) => (a[4].includes("Application('Reminders')") ? 'ok' : 'gone')), true);
});
