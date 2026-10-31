import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTutor, tutorIntent, tutorControl, markFor, planWith } from '../../src/main/tutor.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = { b64: 'x', w: 1280, h: 800, bounds: { x: 0, y: 0, width: 2560, height: 1600 } };
const btn = (label, x = 100, y = 10) => ({ role: 'AXButton', labels: [label], frame: { x, y, w: 40, h: 20 } });
// Saving as PDF in a fake app: each screen, and the step the "model" gives for it.
const SCREENS = {
  start: { controls: [btn('File'), btn('Edit', 160)], step: { say: 'Click File, at the top left.', ref: 1, expect: 'A menu opens' } },
  menu: { controls: [btn('File'), btn('Export as PDF…', 100, 60)], step: { say: 'Click Export as PDF.', ref: 2, expect: 'A save box opens' } },
  save: { controls: [btn('Cancel', 300, 300), btn('Save', 400, 300)], step: { say: 'Click Save, at the bottom right.', ref: 2, expect: 'It saves' } },
  done: { controls: [btn('File')], step: { done: true, say: 'That’s it. You saved it as a PDF.' } },
};
const NEXT = { start: 'menu', menu: 'save', save: 'done' };

function lesson({ user = true, plan, ...over } = {}) {
  let now = 'start';
  const spoken = [], marks = [], plans = [], acted = [];
  const ac = new AbortController();
  const t = startTutor('save this as a PDF', {
    snapshot: async () => shot,
    context: async () => ({ name: 'Pages', pid: 7 }),
    listControls: async () => SCREENS[now].controls,
    plan: plan ?? (async (goal, s, controls, history) => { plans.push(history.at(-1) ?? ''); return { ref: 0, x: 0, y: 0, action: 'click', expect: '', warn: '', done: false, ...SCREENS[now].step }; }),
    say: (s) => spoken.push(s),
    show: () => {},
    // The person does the step a moment after Dixi points at it (when `user` is on).
    marks: (list) => { marks.push(list[0] ?? null); if (user && list[0] && NEXT[now]) { const from = now; setTimeout(() => { if (now === from) now = NEXT[now]; }, 20); } },
    doStep: async (task) => { acted.push(task); now = NEXT[now] ?? now; },
    signal: ac.signal, pollMs: 5, settleMs: 5, idleMs: 150, giveUpMs: 400,
    ...over,
  });
  return { t, spoken, marks, plans, acted, ac, at: () => now, go: (s) => { now = s; } };
}

test('a whole lesson: it points, waits for you, and never acts on its own', async () => {
  const l = lesson();
  const r = await l.t.done;
  assert.equal(r.ok, true);
  assert.deepEqual(r.steps, ['Click File, at the top left.', 'Click Export as PDF.', 'Click Save, at the bottom right.']);
  assert.equal(l.spoken.at(-1), 'That’s it. You saved it as a PDF.');
  assert.deepEqual(l.acted, [], 'nothing was clicked for you');
  // The ring sits on the real control: screen points, relative to the display.
  assert.deepEqual(l.marks[0], { kind: 'box', x: 120, y: 20, w: 52, h: 32, label: 'Click File' });
});

test('the screen moving without your step: pointed at again, not said again', async () => {
  let calls = 0;
  const l = lesson({ user: false, plan: async () => ({ done: false, say: 'Click File, at the top left.', ref: 1, x: 0, y: 0, action: 'click', expect: '', warn: '', ...(++calls > 3 ? { done: true, say: 'Done.' } : {}) }) });
  // A clock or a spinner changes the window twice; then the lesson ends.
  setTimeout(() => l.go('menu'), 30); setTimeout(() => l.go('start'), 90); setTimeout(() => l.go('save'), 150);
  await l.t.done;
  assert.equal(l.spoken.filter((s) => s.startsWith('Click File')).length, 1);
  assert.ok(l.marks.filter(Boolean).length >= 3);
});

test('"repeat" says it again with no new look; "I\'m stuck" asks for a simpler way; "do it for me" hands one step to the agent', async () => {
  const l = lesson({ user: false });
  await sleep(30);
  l.t.control('repeat');
  await sleep(30);
  assert.deepEqual(l.spoken, ['Click File, at the top left.', 'Click File, at the top left.']);
  assert.equal(l.plans.length, 1, 'repeat needed no model call');
  l.t.control('stuck');
  await sleep(30);
  assert.match(l.plans.at(-1), /stuck on "Click File/);
  l.t.control('doit');
  await sleep(40);
  assert.deepEqual(l.acted, ['Do only this one step for them, then stop: Click File, at the top left.']);
  l.t.control('stop');
  const r = await l.t.done;
  assert.equal(r.why, 'stopped');
});

test('a scam on screen ends the lesson; stopping (the kill key) ends it at once', async () => {
  const w = lesson({ plan: async () => ({ done: false, say: 'Call the number.', ref: 0, x: 0, y: 0, action: 'look', expect: '', warn: 'This looks like a fake virus warning. Don’t call that number.' }) });
  const r = await w.t.done;
  assert.equal(r.why, 'warning');
  assert.match(w.spoken.at(-1), /fake virus warning.*stopped the lesson/);
  const k = lesson({ user: false });
  await sleep(20);
  k.ac.abort();
  assert.equal((await k.t.done).why, 'stopped');
});

test('nothing happening: one gentle nudge, then it stops for now', async () => {
  const l = lesson({ user: false });
  const r = await l.t.done;
  assert.equal(r.why, 'idle');
  assert.equal(l.spoken.filter((s) => /Take your time/.test(s)).length, 1);
});

test('what starts a lesson, and what steers it', () => {
  assert.equal(tutorIntent('Dixi, teach me how to save this as a PDF'), 'save this as a PDF');
  assert.equal(tutorIntent('show me how to make a new folder.'), 'make a new folder');
  assert.equal(tutorIntent('walk me through attaching a photo to an email'), 'attaching a photo to an email');
  assert.equal(tutorIntent('show me how to do my morning mail skill'), null);
  assert.equal(tutorIntent('open my email'), null);
  for (const [said, want] of [['repeat that', 'repeat'], ['Dixi, say it again.', 'repeat'], ["I'm stuck", 'stuck'], ["I can't find it", 'stuck'],
    ['do it for me', 'doit'], ['I did it', 'next'], ['done', 'next'], ['stop the lesson', 'stop'], ['open Safari', null], ['click the blue button', null]]) assert.equal(tutorControl(said), want, said);
});

test('where the ring goes: on a listed control, at a point in the picture, or nowhere', () => {
  const controls = [btn('Save', 400, 300)];
  assert.deepEqual(markFor({ ref: 1, say: 'Click Save' }, controls, { ...shot, bounds: { x: 1440, y: 0, width: 2560, height: 1600 } }), { kind: 'box', x: -1020, y: 310, w: 52, h: 32, label: 'Click Save' });
  assert.deepEqual(markFor({ ref: 0, x: 640, y: 400, say: 'Look here, in the middle' }, controls, shot), { kind: 'point', x: 1280, y: 800, w: 0, h: 0, label: 'Look here' });
  assert.equal(markFor({ ref: 5, say: 'x' }, controls, shot), null);
});

test('the planner asks for one step, with the controls as information and the history so far', async () => {
  let body;
  const plan = planWith(async (b) => { body = b; return { content: [{ type: 'text', text: '{"done":false,"say":"Click File.","ref":1,"x":0,"y":0,"action":"click","expect":"","warn":""}' }] }; }, () => ({ type: 'image' }));
  const step = await plan('save as PDF', shot, [btn('File')], ['Open the document.']);
  assert.equal(step.ref, 1);
  const text = body.messages[0].content[1].text;
  assert.match(text, /information only\]\n1\. Button “File”/);
  assert.match(text, /Steps so far: 1\. Open the document\./);
  assert.equal(body.output_config.format.type, 'json_schema');
});
