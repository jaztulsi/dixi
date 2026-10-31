import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobs } from '../../src/main/jobs.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rig(over = {}) {
  let t = 0;
  const said = [], notes = [], views = [], logs = [];
  const jobs = createJobs({ now: () => t, say: (s) => said.push(s), notify: (n) => notes.push(n), onChange: (v) => views.push(v), log: (l) => logs.push(l), quietMs: 4000, speakEveryMs: 10000, ...over });
  return { jobs, said, notes, views, logs, tick: (ms) => { t += ms; } };
}

test('a job runs in the background: steps with why and timing, short spoken updates, a notification at the end', async () => {
  const r = rig();
  let go;
  const gate = new Promise((res) => { go = res; });
  const { done } = r.jobs.start('Compare flights', async (c) => {
    c.step('Searching three sites', 'you asked for the cheapest');
    r.tick(1000); c.progress('Found three options, comparing now', 0.5);   // under 4 s: not spoken
    r.tick(5000); c.progress('Still comparing', 0.7);                     // spoken
    r.tick(2000); c.progress('Almost done', 0.9);                         // too soon after the last: not spoken
    await gate;
    r.tick(500);
    return { say: 'The cheapest is $212 on Friday.' };
  });
  assert.equal(r.jobs.running(), 1, 'it returns at once; the job keeps running');
  assert.equal(r.views.at(-1)[0].why, '');
  go();
  const s = await done;
  assert.deepEqual(r.said, ['Still comparing']);
  assert.deepEqual(r.notes, [{ id: 1, title: 'Compare flights', body: 'The cheapest is $212 on Friday.' }]);
  assert.deepEqual([s.state, s.progress, s.ms], ['done', 1, 8500]);
  assert.deepEqual(s.steps.map((x) => [x.text, x.ms]), [['Searching three sites', 1000], ['Found three options, comparing now', 5000], ['Still comparing', 2000], ['Almost done', 500]]);
  assert.equal(s.steps[0].why, 'you asked for the cheapest');
  assert.equal(r.logs.length, 4, 'every step is in the latency log');
});

test('a failed job says why in plain words and can be retried in one click', async () => {
  const r = rig();
  let tries = 0;
  const first = await r.jobs.start('Download report', async (c) => { c.step('Opening the site'); if (++tries === 1) throw new Error('fetch failed'); return { say: 'Got it.' }; }).done;
  assert.deepEqual([first.state, first.error, first.steps[0].ok], ['failed', "I couldn't reach the internet", false]);
  assert.match(r.notes[0].body, /internet.*Retry/);
  assert.equal(r.notes[0].retry, true);
  const again = await r.jobs.retry().done;
  assert.deepEqual([again.state, again.say, tries], ['done', 'Got it.', 2]);
  assert.equal(r.jobs.retry(), null, 'nothing failed now');
});

test('stopping ends the job quietly: no failure notice', async () => {
  const r = rig();
  const { id, done } = r.jobs.start('Long one', async (c) => { while (!c.signal.aborted) await sleep(2); return { say: 'should not count' }; });
  await sleep(5);
  assert.equal(r.jobs.stopAll(), 1);
  const s = await done;
  assert.deepEqual([s.state, s.error, r.notes.length, r.jobs.stop(id)], ['stopped', '', 0, false]);
});
