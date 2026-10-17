import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, fastPath, findSpan, cleanSpan, tokens, interpret } from '../../src/renderer/core/interpret.js';

// Names below are invented on purpose: the interpreter must work for names it has never seen.
const S = (o) => ({ act: 'open', said: '', guess: '', urls: [], query: '', item: '', qty: 0, n: 0, value: '', ...o });

test('validate: a query that swallowed a particle or the name is rejected (the "up classroom" class)', () => {
  const said = 'open up Zentora Classroom';
  assert.deepEqual(validate({ steps: [S({ said: 'Zentora Classroom' })] }, said).errors, []);
  const bad = validate({ steps: [S({ act: 'search', said: 'Zentora', query: 'up classroom' })] }, said);
  assert.ok(bad.errors.length, 'query overlapping the name is an error');
  // Leading particles are grammar, never content.
  assert.equal(cleanSpan('up classroom'), 'classroom');
  assert.equal(cleanSpan('the brindle mart website'), 'brindle mart');
});

test('validate: names and queries must be copied from what was said (no snapping to another name)', () => {
  const v = validate({ steps: [S({ said: 'Zentora' })] }, 'open up Zentora Classroom');
  assert.deepEqual(v.errors, [], 'a sub-span is still said...');
  const w = validate({ steps: [S({ said: 'Quillmart' })] }, 'open up Zentora Classroom');
  assert.ok(w.errors.some((e) => /was not said/.test(e)), '...but a different name is not');
  const q = validate({ steps: [S({ act: 'search', said: 'Brindlemart', query: 'desk lamps' })] }, 'find a desk lamp on Brindlemart');
  assert.ok(q.errors.some((e) => /query/.test(e)), 'query must be the words said');
});

test('validate: required fields per act', () => {
  const v = validate({ steps: [S({ act: 'search', said: 'Zentora' }), S({ act: 'media', value: 'explode' }), S({ act: 'nth' })] }, 'search Zentora');
  assert.equal(v.errors.length, 3);
  assert.deepEqual(validate({ steps: [S({ act: 'open', said: 'X', urls: ['javascript:alert(1)', 'https://x.example/'] })] }, 'open X').intent.steps[0].urls, ['https://x.example/']);
});

test('findSpan: spacing and joined forms are the same words', () => {
  const w = tokens('take me to Brindle mart please');
  assert.deepEqual(findSpan(w, 'Brindlemart'), [3, 4]);
  assert.deepEqual(findSpan(tokens('open brindlemart'), 'Brindle Mart'), [1, 1]);
  assert.equal(findSpan(tokens('open zentora'), 'Zentora Classroom'), null);
});

test('fastPath: generic controls and ordinals need no AI; unknown names do', () => {
  assert.equal(fastPath('pause the video').steps[0].value, 'pause');
  assert.equal(fastPath('um, can you scroll down please').steps[0].value, 'down');
  assert.equal(fastPath('play the second one').steps[0].n, 2);
  assert.equal(fastPath('open the last result').steps[0].n, -1);
  assert.equal(fastPath('stop').steps[0].act, 'stop');
  assert.equal(fastPath('open up Zentora Classroom'), null, 'not learned yet → AI');
  const learned = new Set(['zentora classroom']);
  assert.deepEqual(fastPath('open up Zentora Classroom', { names: learned }).steps[0].said, 'zentora classroom');
  assert.equal(fastPath('open up Zentora', { names: learned }), null, 'a shorter name is not the learned one');
  assert.equal(fastPath('pull up Zentora Classroom grades', { names: learned }), null, 'extra words → AI decides');
});

test('interpret: fast path first, then the fast tier, escalates to strong when validation fails', async () => {
  const calls = [];
  const replies = { fast: JSON.stringify({ clarify: '', steps: [S({ act: 'search', said: 'Zentora', query: 'up classroom' })] }), strong: JSON.stringify({ clarify: '', steps: [S({ said: 'Zentora Classroom' })] }) };
  const llm = { json: async (_s, _u, models) => { calls.push(models[0]); return replies[models[0]]; } };
  const r = await interpret('open up Zentora Classroom', {}, { llm, tiers: { fast: ['fast'], strong: ['strong'] } });
  assert.deepEqual(calls, ['fast', 'strong']);
  assert.equal(r.source, 'strong');
  assert.equal(r.intent.steps[0].said, 'Zentora Classroom');
  const c = await interpret('pause', {}, { llm, tiers: { fast: ['fast'], strong: ['strong'] } });
  assert.equal(c.source, 'fast');
});
