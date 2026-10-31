import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRecorder, stepOf, slotify, saveSkill, listSkills, deleteSkill, matchSkill, matches, replay, allowRun, healQuestion, SKILL_SAVE, SKILL_RUN, SKILL_LIST, SKILL_DELETE } from '../../src/main/skills.js';
import { clickRisk, keyRisk, isSensitive } from '../../src/main/everywhere.js';

const el = (role, labels = [], subrole = '', value = '') => ({ role, subrole, value, labels });
const NEW = { x: 10, y: 10 }, FIELD = { x: 50, y: 300 }, SEND = { x: 400, y: 300 };
const MESSAGES = { name: 'Messages', url: '' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));

// A stand-in Mac. `perform` mimics everywhere.js perform(): the same gate functions, an approve() that
// answers as told, and the `expect` re-read just before pressing. `done` logs what was pressed and typed.
// `focus`: the focused box, in turn (the last one stays).
function fakeMac(screen, { focus = [el('AXTextField', ['To:']), el('AXTextArea', ['Message'])], found = {}, answer = true, ctx = MESSAGES, elementAt } = {}) {
  const done = [], asked = [];
  const input = { elementAt: elementAt ?? (async (p) => screen[`${p.x},${p.y}`] ?? null), findByLabel: async (labels) => found[labels[0]] ?? null, focused: async () => (focus.length > 1 ? focus.shift() : focus[0]) };
  const ok = { type: 'tool_result', content: 'OK' };
  const no = (why) => ({ type: 'tool_result', content: `The user did not approve this (${why}). Stop and tell them what's left to do.` });
  const gate = async (why) => { if (!why) return true; asked.push(why); return answer; };
  const perform = async (c) => {
    if (/click$/.test(c.name)) {
      const p = { x: c.input.coordinate[0], y: c.input.coordinate[1] };
      const why = clickRisk(await input.elementAt(p));
      if (!(await gate(why))) return no(why);
      if (c.expect && !c.expect(await input.elementAt(p))) return { type: 'tool_result', is_error: true, content: 'It changed just before the click.' };
      done.push(['click', p]); return ok;
    }
    if (c.name === 'type') { done.push(['type', c.input.text]); return ok; }
    if (c.name === 'key') { const why = keyRisk(c.input.text, await input.focused(), { sensitive: isSensitive(ctx) }); if (!(await gate(why))) return no(why); done.push(['key', c.input.text]); return ok; }
    done.push([c.name]); return ok;
  };
  return { input, perform, ctx, done, asked, sleep: async () => {} };
}

// "text Sam I'm late", as the agent did it in Messages.
function recordRun() {
  const rec = createRecorder();
  rec.add(stepOf({ name: 'screenshot', input: {} }));
  rec.add(stepOf({ name: 'left_click', input: { coordinate: [5, 5] } }, NEW, el('AXButton', ['New Message', 'Compose'])));
  rec.add(stepOf({ name: 'type', input: { text: 'Sam' } }, null, el('AXTextField', ['To:'])));
  rec.add(stepOf({ name: 'left_click', input: { coordinate: [9, 9] } }, FIELD, el('AXTextArea', ['Message', 'draft text'], '', 'draft text')));
  rec.add(stepOf({ name: 'type', input: { text: "I'm late." } }, null, el('AXTextArea', ['Message'])));
  rec.add(stepOf({ name: 'zoom', input: {} }));
  rec.add(stepOf({ name: 'key', input: { text: 'Return' } }));
  return rec.steps();
}
const skillOf = (name, extra = {}) => ({ name, app: 'Messages', url: '', ...slotify("text Sam I'm late", recordRun()), ...extra });

test('record → save → list → match with slots → delete', () => {
  const dir = tmp();
  const steps = recordRun();
  assert.equal(steps.length, 5);   // the screenshot and zoom changed nothing: not kept
  assert.deepEqual(steps[0], { action: 'left_click', at: NEW, target: { role: 'AXButton', labels: ['New Message', 'Compose'] } });
  assert.deepEqual(steps[2].target, { role: 'AXTextArea', labels: ['Message'] });   // a box's contents are not kept

  const saved = saveSkill(dir, { name: '', said: "text Sam I'm late", steps, app: 'Messages', url: 'https://x.test/p?token=secret' });
  assert.equal(saved.trigger, 'text {slot2} {message}');
  assert.deepEqual(saved.slots, { message: "I'm late", slot2: 'Sam' });
  assert.deepEqual(saved.steps.filter((s) => s.action === 'type').map((s) => s.text), ['{slot2}', '{message}.']);
  assert.equal(saved.url, 'https://x.test/p');   // the query (tokens) is never saved
  assert.equal(fs.statSync(path.join(dir, 'skills', '.key')).mode & 0o777, 0o600);

  const all = listSkills(dir);
  assert.equal(all.length, 1);
  assert.equal(all[0].name, "text Sam I'm late");

  // The trigger, with new words in the slots.
  assert.deepEqual(matchSkill(all, 'Text Mom, running ten minutes behind!').values, { slot2: 'Mom', message: 'running ten minutes behind' });
  // Its name, with filler words: the recorded values.
  assert.deepEqual(matchSkill(all, "run my text Sam I'm late skill").values, { message: "I'm late", slot2: 'Sam' });
  assert.equal(matchSkill(all, 'what is the weather'), null);
  assert.equal(matchSkill(all, 'text Mom'), null);   // both slots needed

  assert.equal(deleteSkill(dir, "text sam i'm late")?.name, "text Sam I'm late");
  assert.equal(listSkills(dir).length, 0);
  assert.equal(deleteSkill(dir, 'nothing'), null);
});

test('only skills this Mac made load: a file from a link, another Mac or an edit is ignored', () => {
  const dir = tmp();
  const s = saveSkill(dir, { name: 'mine', said: 'open my notes', steps: [{ action: 'key', key: 'cmd+n' }], app: 'Notes' });
  const f = (n) => path.join(dir, 'skills', n);
  fs.writeFileSync(f('dropped.json'), JSON.stringify({ name: 'morning routine', steps: [{ action: 'key', key: 'cmd+q' }] }));
  fs.writeFileSync(f('copied.json'), JSON.stringify({ ...s, name: 'copied', sig: 'a'.repeat(64) }));
  fs.writeFileSync(f('broken.json'), '{ not json');
  fs.writeFileSync(f('edited.json'), JSON.stringify({ ...s, steps: [{ action: 'key', key: 'cmd+q' }] }));
  assert.deepEqual(listSkills(dir).map((x) => x.name), ['mine']);
});

test('nothing typed into a password, card or code box is recorded or saved', () => {
  const typed = (text, f) => stepOf({ name: 'type', input: { text } }, null, f);
  assert.deepEqual(typed('hunter2', el('AXTextField', [], 'AXSecureTextField')), { action: 'type', private: true });
  assert.deepEqual(typed('123456', el('AXTextField', ['Verification code'])), { action: 'type', private: true });
  assert.deepEqual(typed('4111 1111 1111 1111', el('AXTextField', ['Notes'])), { action: 'type', private: true });
  assert.deepEqual(typed('424242', el('AXTextField', ['Search'])), { action: 'type', private: true });   // looks like a code
  assert.equal(typed('90210', el('AXTextField', ['ZIP code'])).text, '90210');
  const dir = tmp();
  assert.throws(() => saveSkill(dir, { name: 'pay', steps: [{ action: 'key', key: 'cmd+n' }, typed('x', el('AXTextField', ['CVV']))] }), /password, card or code/);
  assert.throws(() => saveSkill(dir, { name: 'drag', steps: [{ action: 'left_click_drag' }] }), /can't replay/);
});

test('slots: only what was said; never a trigger made only of slots', () => {
  const typed = (text) => ({ action: 'type', text });
  assert.equal(slotify("I'm late", [typed("I'm late")]).trigger, "I'm late");   // would match everything
  assert.equal(slotify('search for cats', [typed('dogs')]).trigger, 'search for cats');
  assert.equal(slotify('search for cats', [typed('cats')]).trigger, 'search for {message}');
  assert.equal(slotify('scatter it', [typed('cat')]).trigger, 'scatter it');   // whole words only
});

test('best match: a skill named exactly beats a trigger', () => {
  const skills = [
    { name: 'search', trigger: 'search for {message}', slots: {}, steps: [] },
    { name: 'search for cats', trigger: '', slots: {}, steps: [] },
    { name: 'morning routine', steps: [] },
  ];
  assert.equal(matchSkill(skills, 'search for cats').skill.name, 'search for cats');
  assert.deepEqual(matchSkill(skills, 'search for dogs').values, { message: 'dogs' });
  assert.equal(matchSkill(skills, 'Dixi, morning routine').skill.name, 'morning routine');
  assert.equal(matchSkill(skills, "what's on my morning routine"), null);
});

test('replay: labels match → each step goes through perform; slots typed; Enter asks', async () => {
  const mac = fakeMac({ '10,10': el('AXButton', ['New Message']), '50,300': el('AXTextArea', ['Message', 'old draft'], '', 'old draft') });
  const r = await replay(skillOf('r1'), { ...mac, values: { slot2: 'Mom', message: 'on my way' } });
  assert.deepEqual(r, { ok: true, healed: false });
  assert.deepEqual(mac.done, [['click', NEW], ['type', 'Mom'], ['click', FIELD], ['type', 'on my way.'], ['key', 'Return']]);
  assert.deepEqual(mac.asked, ['Press Enter? It may send or submit.']);   // perform's gate, not the replay's
});

test('replay: the label changed → stops with ok:false, nothing clicked there', async () => {
  const mac = fakeMac({ '10,10': el('AXButton', ['Delete Conversation']) });
  const r = await replay(skillOf('r2'), mac);
  assert.equal(r.ok, false);
  assert.equal(r.at, 0);
  assert.match(r.why, /New Message/);
  assert.deepEqual(mac.done, []);
});

test('replay: the button moved → found by its label, checked, then clicked', async () => {
  const moved = { x: 700, y: 20 };
  const mac = fakeMac({ '700,20': el('AXButton', ['New Message']), '50,300': el('AXTextArea', ['Message']) }, { found: { 'New Message': moved } });
  assert.equal((await replay(skillOf('r3'), mac)).ok, true);
  assert.deepEqual(mac.done[0], ['click', moved]);
});

test('replay: one click heals onto a control of the same role; the second failure stops', async () => {
  const healedAt = { x: 600, y: 40 };
  const mac = fakeMac({ '600,40': el('AXButton', ['Compose']) });   // renamed and moved; the message box is gone
  const asks = [];
  const r = await replay(skillOf('r4'), { ...mac, heal: async (step, i) => { asks.push([i, healQuestion(step)]); return healedAt; } });
  assert.equal(asks.length, 1);
  assert.match(asks[0][1], /Button that was labelled “New Message”/);
  assert.equal(r.ok, false);
  assert.equal(r.at, 2);   // the second click
  assert.deepEqual(mac.done, [['click', healedAt], ['type', 'Sam']]);

  // A heal that points at something of another role (a link, not the button) is refused.
  const mac2 = fakeMac({ '600,40': el('AXLink', ['New Message']) });
  const r2 = await replay(skillOf('r5'), { ...mac2, heal: async () => healedAt });
  assert.equal(r2.at, 0);
  assert.deepEqual(mac2.done, []);
});

test('replay: a healed click on a risky label still asks', async () => {
  const mac = fakeMac({ '600,40': el('AXButton', ['Delete Conversation']) }, { answer: false });
  const r = await replay(skillOf('r6'), { ...mac, heal: async () => ({ x: 600, y: 40 }) });
  assert.deepEqual(mac.asked, ['Press “Delete Conversation”?']);
  assert.equal(r.stopped, true);
  assert.deepEqual(mac.done, []);
});

test('replay: a risky label asks; a no stops the run and is never healed', async () => {
  const skill = { name: 'send it', app: 'Messages', steps: [{ action: 'left_click', at: SEND, target: { role: 'AXButton', labels: ['Send'] } }, { action: 'type', text: 'after' }] };
  const mac = fakeMac({ '400,300': el('AXButton', ['Send']) }, { answer: false });
  let healed = 0;
  const r = await replay(skill, { ...mac, heal: async () => { healed++; return SEND; } });
  assert.deepEqual(mac.asked, ['Press “Send”?']);
  assert.equal(r.stopped, true);
  assert.equal(healed, 0);
  assert.deepEqual(mac.done, []);
  const yes = fakeMac({ '400,300': el('AXButton', ['Send']) });
  assert.equal((await replay({ ...skill, name: 'send it 2' }, yes)).ok, true);
  assert.deepEqual(yes.done, [['click', SEND], ['type', 'after']]);
});

test('replay: the label is read again just before the press (expect)', async () => {
  let reads = 0;
  const mac = fakeMac({}, { elementAt: async () => (++reads > 2 ? el('AXButton', ['Archive']) : el('AXButton', ['New Message'])) });   // changes as it's pressed
  const r = await replay(skillOf('r7'), mac);
  assert.equal(r.ok, false);
  assert.ok(!mac.done.length);
});

test('replay: stops in another app or on another site', async () => {
  const mac = fakeMac({ '10,10': el('AXButton', ['New Message']) });
  let r = await replay(skillOf('r8'), { ...mac, ctx: { name: 'Mail', url: '' } });
  assert.equal(r.stopped, true);
  assert.match(r.why, /Messages/);
  r = await replay({ ...skillOf('r9'), app: 'Google Chrome', url: 'https://bank.test/x' }, { ...mac, ctx: { name: 'Google Chrome', url: 'https://bank-test.evil/x' } });
  assert.equal(r.stopped, true);
  assert.deepEqual(mac.done, []);
});

test('replay: password boxes, codes and stop are respected', async () => {
  const skill = { name: 'r10', app: 'Messages', slots: { message: 'hello' }, steps: [{ action: 'type', text: '{message}' }, { action: 'key', key: 'cmd+c' }] };
  const pw = fakeMac({}, { focus: [el('AXTextField', [], 'AXSecureTextField')] });
  assert.equal((await replay(skill, pw)).stopped, true);
  assert.deepEqual(pw.done, []);
  const code = fakeMac({});
  assert.equal((await replay({ ...skill, name: 'r11' }, { ...code, values: { message: '481516' } })).stopped, true);   // a spoken code
  assert.deepEqual(code.done, []);
  const ctrl = new AbortController(); ctrl.abort();
  const s = fakeMac({});
  assert.equal((await replay({ ...skill, name: 'r12' }, { ...s, signal: ctrl.signal })).ok, false);
  assert.deepEqual(s.done, []);
});

test('a click with nothing recorded to check is never made blind', async () => {
  const mac = fakeMac({ '1,1': el('AXButton', ['OK']) });
  const r = await replay({ name: 'r13', app: 'Messages', steps: [{ action: 'left_click', at: { x: 1, y: 1 }, target: null }] }, mac);
  assert.equal(r.ok, false);
  assert.deepEqual(mac.done, []);
  assert.ok(matches(el('AXButton', ['send ']), { role: 'AXButton', labels: ['Send'] }));
  assert.ok(!matches(el('AXLink', ['Send']), { role: 'AXButton', labels: ['Send'] }));
});

test('spoken commands', () => {
  assert.equal('save that as a skill'.match(SKILL_SAVE)?.[1], undefined);
  assert.equal('save that as a skill called morning email'.match(SKILL_SAVE)?.[1], 'morning email');
  assert.equal('Save this as a playbook named standup.'.match(SKILL_SAVE)?.[1], 'standup');
  assert.equal('run my morning routine skill'.match(SKILL_RUN)?.[1], 'morning routine');
  assert.ok(!SKILL_RUN.test('run my tests'));
  for (const t of ['what skills do I have', 'which playbooks have I saved', 'list my skills']) assert.ok(SKILL_LIST.test(t), t);
  assert.equal('delete the morning routine skill'.match(SKILL_DELETE)?.[1], 'morning routine');
  assert.ok(!SKILL_DELETE.test('forget that'));
});

// Last: it fills the hour's budget (in a future hour, so the tests above aren't counted).
test('at most 6 runs of one skill an hour, 20 in all', async () => {
  const t = Date.now() + 10 * 3600000;
  for (let i = 0; i < 6; i++) assert.ok(allowRun('a', t));
  assert.ok(!allowRun('a', t));
  for (let i = 0; i < 14; i++) assert.ok(allowRun(`b${i}`, t));
  assert.ok(!allowRun('c', t));
  assert.ok(allowRun('a', t + 3600001));   // an hour later
  const mac = fakeMac({});
  const r = await replay({ name: 'busy', app: 'Messages', steps: [{ action: 'key', key: 'cmd+c' }] }, { ...mac, now: t + 3600002 });
  assert.equal(r.ok, true);
  for (let i = 0; i < 19; i++) allowRun(`d${i}`, t + 3600003);
  assert.equal((await replay({ name: 'late', app: 'Messages', steps: [] }, { ...mac, now: t + 3600004 })).stopped, true);
});
