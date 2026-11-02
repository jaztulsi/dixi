import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileIntent, findFiles, fileAction, remember, spotlight, range, allowed, safeName, FILES } from '../../src/main/files.js';

const HOME = '/Users/t';
const NOW = new Date(2026, 9, 30, 12);   // Fri 30 Oct 2026, local
const clock = () => NOW;
const T = (d) => new Date(2026, 3, d).getTime();
const fakeFs = (files = {}, dirs = ['/Users/t/Documents', '/Users/t/Desktop']) => {
  const renamed = [];
  return {
    renamed,
    stat: async (p) => { if (files[p] != null) return { mtimeMs: files[p], isDirectory: () => false }; if (dirs.includes(p)) return { mtimeMs: 0, isDirectory: () => true }; throw Object.assign(new Error('x'), { code: 'ENOENT' }); },
    readdir: async (p) => (p === HOME ? ['Documents', 'Desktop', 'Library', '.ssh'] : []),
    rename: async (a, b) => { renamed.push([a, b]); },
  };
};

test('what you say becomes a file intent', () => {
  assert.deepEqual(['verb', 'kind', 'query'].map((k) => fileIntent('find my tax return PDF')[k]), ['find', 'pdf', 'tax return']);
  const b = fileIntent('open the budget spreadsheet from last week');
  assert.deepEqual([b.verb, b.kind, b.when, b.query], ['open', 'spreadsheet', 'last week', 'budget']);
  const s = fileIntent('show me my last screenshot');
  assert.deepEqual([s.verb, s.kind, s.src], ['open', 'image', 'screenshot']);
  assert.equal(fileIntent('open my newest download').src, 'downloads');
  const d = fileIntent('what did I download today');
  assert.deepEqual([d.verb, d.src, d.when], ['find', 'downloads', 'today']);
  assert.equal(fileIntent('find the slides from March').when, 'march');
  assert.equal(fileIntent('find my photos from last year').when, 'last year');
  assert.equal(fileIntent('find the Q3 deck').kind, 'slides');
});

test('follow-ups point at the list', () => {
  assert.deepEqual([fileIntent('open the second one').verb, fileIntent('open the second one').index], ['open', 1]);
  assert.equal(fileIntent('open it').index, 0);
  assert.equal(fileIntent('open the last one').index, -1);
  assert.equal(fileIntent('show it in Finder').verb, 'reveal');
  const m = fileIntent('move it to Documents');
  assert.deepEqual([m.verb, m.dest], ['move', 'Documents']);
  const r = fileIntent('rename it to Q4 plan');
  assert.deepEqual([r.verb, r.name], ['rename', 'Q4 plan']);
});

test('screen questions and plain app or button asks do not match', () => {
  for (const t of ['what is this file', 'what is on my screen', 'open Safari', 'find the buy button', 'show me this PDF', 'open this file', 'delete it', 'trash the second one', 'hello'])
    assert.equal(fileIntent(t), null, t);
  assert.ok(FILES.test('find my tax return') && !FILES.test('click the button'));
});

test('compound and app commands are not file searches; home folders open themselves', async () => {
  for (const t of ['Open Apple Music, search lo-fi beats, and play the first one', 'Open Apple Music', 'open the Music app', 'open Photos', 'open Keynote',
    'find the PDF I downloaded yesterday, rename it to Receipt and move it to Documents', 'rename it to Q4 plan and move it to Documents', 'find my tax pdf then open it'])
    assert.equal(fileIntent(t), null, t);
  assert.equal(fileIntent('rename it to Tom and Jerry').name, 'Tom and Jerry', 'an "and" inside a name is not a second command');
  assert.equal(fileIntent('find my vacation photos').kind, 'image');
  for (const [t, f] of [['open my Downloads folder', 'Downloads'], ['open downloads', 'Downloads'], ['open the documents folder', 'Documents'], ['open my music folder', 'Music'], ['show me my pictures folder', 'Pictures']])
    assert.deepEqual([fileIntent(t).folder, fileIntent(t).kind], [f, 'folder'], t);
  assert.equal(fileIntent('open the qa folder').folder, undefined, 'any other folder is still a search');
  const calls = []; const said = [];
  const r = await fileAction(fileIntent('open my Downloads folder'), null, { exec: async (a) => { calls.push(a); return ''; }, say: (x) => said.push(x), home: HOME, now: clock, fs: fakeFs({}, ['/Users/t/Downloads']) });
  assert.deepEqual(calls, [['open', '/Users/t/Downloads']], 'no Spotlight search, straight to the folder');
  assert.equal(said[0], 'Opening your Downloads folder.');
  assert.equal(r.results, undefined);
});

test('the Spotlight query is escaped and typed', () => {
  const q = spotlight({ query: 'a"b\\c', kind: 'pdf' }, NOW);
  assert.ok(q.includes('"*a\\"b\\\\c*"cd'));
  assert.ok(q.includes('kMDItemContentTypeTree == "com.adobe.pdf"'));
  assert.ok(spotlight({ src: 'screenshot' }, NOW).includes('kMDItemIsScreenCapture == 1'));
  assert.ok(spotlight({ when: 'today' }, NOW).includes('kMDItemContentModificationDate >='));
  const dl = spotlight({ when: 'yesterday', src: 'downloads' }, NOW);
  assert.ok(dl.includes('kMDItemDateAdded >=') && dl.includes('|| (kMDItemContentModificationDate >='), 'downloaded yesterday = arrived or saved yesterday');
});

test('when ranges', () => {
  const [a, b] = range('last week', NOW);
  assert.equal(a.getDate(), 19); assert.equal(b.getDate(), 26);   // Mon 19 – Mon 26 Oct
  assert.equal(range('march', NOW)[0].getFullYear(), 2026);
  assert.equal(range('december', NOW)[0].getFullYear(), 2025);
  assert.equal(range('last year', NOW)[0].getFullYear(), 2025);
});

test('paths: home only, no Library, hidden or node_modules', () => {
  assert.ok(allowed('/Users/t/Documents/a.pdf', HOME));
  for (const p of ['/Users/t/Library/x.pdf', '/Users/t/.cache/x.pdf', '/Users/t/p/node_modules/x.js', '/etc/x', '/Users/t/../x', '/Users/t'])
    assert.equal(allowed(p, HOME), false, p);
});

test('findFiles: argv only, filtered, newest first, max 5', async () => {
  const files = {};
  const paths = [];
  for (let i = 1; i <= 7; i++) { const p = `/Users/t/Documents/f${i}.pdf`; files[p] = T(i); paths.push(p); }
  const bad = ['/Users/t/Library/a.pdf', '/Users/t/.x/a.pdf', '/Users/t/app/node_modules/a.pdf'];
  let argv;
  const exec = async (a) => { argv = a; return [...bad, ...paths].join('\n'); };
  const r = await findFiles({ query: 'tax', kind: 'pdf' }, { exec, now: clock, home: HOME, fs: fakeFs(files) });
  assert.deepEqual(argv.slice(0, 3), ['mdfind', '-onlyin', HOME]);
  assert.equal(argv.length, 4);
  assert.deepEqual(r.map((x) => x.name), ['f7.pdf', 'f6.pdf', 'f5.pdf', 'f4.pdf', 'f3.pdf']);
  await findFiles({ src: 'downloads' }, { exec, now: clock, home: HOME, fs: fakeFs() });
  assert.equal(argv[2], '/Users/t/Downloads');
});

test('find speaks a short result; open and reveal need no approval', async () => {
  const files = { '/Users/t/Documents/Tax return 2025.pdf': T(12), '/Users/t/Documents/Tax old.pdf': T(2), '/Users/t/Documents/Tax x.pdf': T(1) };
  const calls = []; const said = [];
  const exec = async (a) => { calls.push(a); return a[0] === 'mdfind' ? Object.keys(files).join('\n') : ''; };
  const deps = { exec, say: (s) => said.push(s), approve: async () => { throw new Error('no approval expected'); }, now: clock, home: HOME, fs: fakeFs(files) };
  const r = await fileAction(fileIntent('find my tax return PDF'), null, deps);
  assert.equal(said[0], 'I found three. The newest is Tax return 2025.pdf from April 12. Say open the first one, or the second one.');
  assert.equal(r.results.length, 3);
  await fileAction(fileIntent('open the second one'), null, deps);
  assert.deepEqual(calls.at(-1), ['open', '/Users/t/Documents/Tax old.pdf']);
  await fileAction(fileIntent('show it in Finder'), null, deps);
  assert.deepEqual(calls.at(-1), ['open', '-R', '/Users/t/Documents/Tax return 2025.pdf']);
  assert.equal(calls.at(-1).length, 3);
});

test('move and rename ask first, never overwrite, stay inside home', async () => {
  const src = '/Users/t/Downloads/Tax 2025.pdf';
  const mk = (extra = {}, ok = true) => {
    const fs = fakeFs({ [src]: T(1), ...extra });
    const asked = []; const said = [];
    return { fs, asked, said, deps: { exec: async () => '', say: (s) => said.push(s), approve: async (q) => { asked.push(q); return ok; }, now: clock, home: HOME, fs } };
  };
  remember([{ path: src, name: 'Tax 2025.pdf', modified: T(1) }]);
  let c = mk();
  await fileAction(fileIntent('move it to Documents'), null, c.deps);
  assert.deepEqual(c.asked, ['Move “Tax 2025.pdf” to Documents?']);
  assert.deepEqual(c.fs.renamed, [[src, '/Users/t/Documents/Tax 2025.pdf']]);

  remember([{ path: src, name: 'Tax 2025.pdf', modified: T(1) }]);
  c = mk({}, false);
  await fileAction(fileIntent('rename it to Q4 plan'), null, c.deps);
  assert.equal(c.asked[0], 'Rename “Tax 2025.pdf” to “Q4 plan.pdf”?');
  assert.deepEqual(c.fs.renamed, []);

  c = mk({ '/Users/t/Documents/Tax 2025.pdf': 1 });   // already there
  await fileAction(fileIntent('move it to Documents'), null, c.deps);
  assert.deepEqual([c.asked.length, c.fs.renamed.length], [0, 0]);

  for (const t of ['move it to Library', 'move it to .ssh', 'move it to /etc', 'move it to Nowhere', 'rename it to ../x', 'rename it to .hidden']) {
    c = mk();
    await fileAction(fileIntent(t), null, c.deps);
    assert.deepEqual([t, c.asked.length, c.fs.renamed.length], [t, 0, 0]);
  }
});

test('with the undo log, move and rename happen without a question and can be undone', async () => {
  const src = '/Users/t/Downloads/Tax 2025.pdf';
  const moved = []; const said = [];
  const undo = { group: (label) => ({ id: 'g1', label }), move: async (a, b, g) => { moved.push([a, b, g.label]); return b; } };
  const deps = { exec: async () => '', say: (s) => said.push(s), approve: async () => assert.fail('never asks'), undo, now: clock, home: HOME, fs: fakeFs({ [src]: T(1) }) };
  remember([{ path: src, name: 'Tax 2025.pdf', modified: T(1) }]);
  await fileAction(fileIntent('move it to Documents'), null, deps);
  await fileAction(fileIntent('rename it to Q4 plan'), null, deps);
  assert.deepEqual(moved, [[src, '/Users/t/Documents/Tax 2025.pdf', 'Move Tax 2025.pdf'], ['/Users/t/Documents/Tax 2025.pdf', '/Users/t/Documents/Q4 plan.pdf', 'Rename Tax 2025.pdf']]);
  assert.equal(said[0], 'Moved. Say undo that to put it back.');
  const c = { ...deps, fs: fakeFs({ [src]: T(1), '/Users/t/Documents/Tax 2025.pdf': 1 }) };
  remember([{ path: src, name: 'Tax 2025.pdf', modified: T(1) }]); moved.length = 0;
  await fileAction(fileIntent('move it to Documents'), null, c);
  assert.deepEqual(moved, [], 'still never over another file');
});

test('hostile names are cleaned and capped; there is no delete', async () => {
  assert.equal(safeName('a\u0007b\u202Ec\nd'), 'abcd');
  assert.equal(safeName('x'.repeat(200)).length, 60);
  assert.equal(path.basename('/a/b'), 'b');
  const c = { exec: async () => '', say() {}, approve: async () => true, home: HOME, now: clock, fs: fakeFs() };
  remember([{ path: '/Users/t/Documents/a.pdf', name: 'a.pdf', modified: 1 }]);
  const r = await fileAction({ verb: 'delete', index: 0 }, null, c);
  assert.match(r.text, /can't do that/);
});
