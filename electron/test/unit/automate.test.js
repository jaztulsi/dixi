import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAutomations, nextRun, checkRule } from '../../src/main/automate.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const at = (s) => new Date(s).getTime();   // local time
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-auto-'));

test('when a time rule runs next', () => {
  const thu = at('2026-10-29T12:00');   // a Thursday
  assert.equal(nextRun({ every: 'week', days: [5], time: '17:00' }, thu), at('2026-10-30T17:00'));
  assert.equal(nextRun({ every: 'week', days: [5], time: '17:00' }, at('2026-10-30T17:00')), at('2026-11-06T17:00'), 'just ran: next week');
  assert.equal(nextRun({ every: 'day', time: '08:30' }, thu), at('2026-10-30T08:30'));
  assert.equal(nextRun({ every: 'weekday', time: '09:00' }, at('2026-10-30T10:00')), at('2026-11-02T09:00'), 'Friday after 9 → Monday');
  assert.equal(nextRun({ every: 'month', days: [1], time: '09:00' }, thu), at('2026-11-01T09:00'));
  assert.equal(nextRun({ every: 'minutes', minutes: 15 }, thu), thu + 15 * 60000);
  assert.equal(nextRun({ every: 'once', at: thu - 1 }, thu), null);
});

test('what the model makes of a request is checked in code', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, 'Downloads'));
  const now = at('2026-10-29T12:00');
  assert.deepEqual(checkRule({ type: 'schedule', every: 'week', days: [5], time: '17:00', do: 'summarize my week', name: 'Friday summary' }, { home, now }),
    { kind: 'time', name: 'Friday summary', do: 'summarize my week', every: 'week', time: '17:00', days: [5] });
  assert.equal(checkRule({ type: 'schedule', every: 'minutes', minutes: 1, do: 'x' }, { home, now }).minutes, 5, 'at most every 5 minutes');
  assert.equal(checkRule({ type: 'file', dir: 'downloads', do: 'sort it' }, { home, now }).dir, path.join(home, 'Downloads'));
  assert.match(checkRule({ type: 'file', dir: '../../etc', do: 'x' }, { home, now }).error, /can't find a folder/);
  assert.match(checkRule({ type: 'page', url: 'file:///etc/passwd', do: '' }, { home, now }).error, /only watch web pages/);
  assert.match(checkRule({ type: 'schedule', every: 'once', at: '2020-01-01T09:00', do: 'x' }, { home, now }).error, /already passed/);
  assert.deepEqual(checkRule({ type: 'none' }, { home, now }), { error: 'none' });
  assert.equal(checkRule({ type: 'schedule', every: null, at: '2026-10-30T07:00', do: 'play my playlist' }, { home, now }).every, 'once', 'a time and no repeat: once');
});

test('a spoken rule: saved, said back, run when due (and once if the Mac slept through it), stopped by name', async () => {
  let t = at('2026-10-29T12:00');
  const ran = [];
  const file = path.join(tmp(), 'automate.json');
  const mk = () => createAutomations(file, { now: () => t, runCommand: async (c, o) => { ran.push([c, o.why]); return { ok: true }; },
    ask: async (_s, u) => (u.includes('every Friday') ? '{"type":"schedule","every":"week","days":[5],"time":"17:00","do":"summarize my week","name":"Friday summary"}' : '{"type":"none"}') });
  const a = mk();
  const r = await a.fromSpeech('every Friday at 5 summarize my week');
  assert.match(r.say, /^Okay: summarize my week\. First run Friday, October 30.* 5:00/);
  assert.deepEqual(await a.fromSpeech('open Safari'), { none: true });
  t = at('2026-10-30T17:00:20'); await a.tick();
  assert.deepEqual(ran, [['summarize my week', 'scheduled: Friday summary']]);
  t = at('2026-10-30T17:01'); await a.tick();
  assert.equal(ran.length, 1, 'once per Friday');
  // Asleep all of the next Friday evening: runs once on waking if it's under 6 hours late; never twice.
  const b = mk();   // and it survives a restart
  t = at('2026-11-06T20:00'); await b.tick();
  assert.equal(ran.length, 2);
  t = at('2026-11-14T08:00'); await b.tick();
  assert.equal(ran.length, 2, '15 hours late: skipped, not run');
  assert.equal(b.list()[0].next, at('2026-11-20T17:00'));
  assert.deepEqual(b.find('friday summary').map((x) => x.name), ['Friday summary']);
  assert.ok(b.remove(b.find('friday')[0].id));
  assert.deepEqual(mk().list(), []);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('a file trigger: a new file in the folder runs the command once it has finished arriving', async () => {
  const home = tmp(), dl = path.join(home, 'Downloads');
  fs.mkdirSync(dl); fs.writeFileSync(path.join(dl, 'old.pdf'), 'x');
  const ran = [];
  const a = createAutomations(path.join(home, 'a.json'), { home, runCommand: async (c, o) => { ran.push([c, o.file]); return { ok: true }; },
    ask: async () => '{"type":"file","dir":"Downloads","do":"sort it into a folder by type","name":"Sort downloads"}' }).start(60000);
  try {
    assert.match((await a.fromSpeech('when a new file lands in Downloads, sort it into a folder by type')).say, /When a new file lands in Downloads, I'll sort it/);
    fs.writeFileSync(path.join(dl, 'report.pdf.crdownload'), 'part');
    await sleep(100);
    fs.renameSync(path.join(dl, 'report.pdf.crdownload'), path.join(dl, 'report.pdf'));
    await sleep(2600);
    assert.deepEqual(ran, [[`sort it into a folder by type (the new file: ${path.join(dl, 'report.pdf')})`, path.join(dl, 'report.pdf')]]);
    fs.writeFileSync(path.join(dl, 'old.pdf'), 'changed');   // not new
    await sleep(2300);
    assert.equal(ran.length, 1);
  } finally { a.stop(); }
});

test('a page monitor tells you only when the watched thing changes', async () => {
  let t = 0, price = '$499';
  const notes = [];
  const a = createAutomations(path.join(tmp(), 'a.json'), { now: () => t, notify: (n) => notes.push(n), runCommand: async () => ({ ok: true }), readPage: async () => `<html>Ad ${Math.random()} Price ${price}</html>`,
    ask: async (s, u) => (s.startsWith('Reply with JSON') ? '{"type":"page","url":"https://shop.example/tv","what":"the price","minutes":30,"name":"TV price"}' : u.match(/\$\d+/)[0]) });
  await a.fromSpeech('tell me when the price of https://shop.example/tv changes');
  await a.tick(); t += 31 * 60000; await a.tick();
  assert.equal(notes.length, 0, 'the ad changed, the price didn’t');
  price = '$449'; t += 31 * 60000; await a.tick();
  assert.deepEqual(notes, [{ title: 'TV price: changed', body: 'the price: was $499, now $449' }]);
});

test('workflows: record what you say, or save it; replay in order; a failed step stops it and says which', async () => {
  const ran = [];
  const a = createAutomations(path.join(tmp(), 'a.json'), { runCommand: async (c) => { ran.push(c); return c.includes('broken') ? { ok: false, say: 'no such app' } : { ok: true }; } });
  a.record('My usual setup');
  a.heard('open Slack'); a.heard('set the volume to 30 percent'); a.heard('snap Calendar to the right');
  assert.deepEqual(a.stopRecording().steps.length, 3);
  assert.deepEqual(await a.play('usual setup'), { ok: true, done: 3, say: 'Done: my usual setup.' });
  assert.deepEqual(ran, ['open Slack', 'set the volume to 30 percent', 'snap Calendar to the right']);
  a.saveWorkflow('Wind down', ['dim the screen', 'open broken app', 'play rain sounds']);
  const r = await a.play('wind down');
  assert.deepEqual([r.ok, r.done, r.say], [false, 1, "Step 2 (open broken app) didn't work: no such app."]);
  assert.equal(ran.at(-1), 'open broken app', 'step 3 never ran');
  assert.equal((await a.play('morning')).say, "I don't have a routine called morning.");
});
