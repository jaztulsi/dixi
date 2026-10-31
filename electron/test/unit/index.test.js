import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openIndex, answerFrom, scoreRetrieval, chunk, macEmbed, hideSecrets } from '../../src/main/index.js';

// A small life in files, notes and mail. The questions below are worded differently from the text.
const DOCS = [
  { uri: 'file:///Docs/lease.pdf', kind: 'file', title: 'Apartment lease 2026', text: 'The monthly rent is $1,850, due on the 1st. The lease ends on August 31, 2027. Pets are allowed with a $300 deposit.' },
  { uri: 'file:///Docs/acme-invoice.pdf', kind: 'file', title: 'Invoice 4471 from Acme Hosting', text: 'Acme Hosting. Invoice 4471. Amount due: $129.00 for annual web hosting. Paid by card ending 4242 on March 3.' },
  { uri: 'note://dentist', kind: 'note', title: 'Health', text: 'Dentist: Dr. Okafor, cleaning every six months. Next visit Tuesday Nov 10 at 2:30pm. Allergic to penicillin.' },
  { uri: 'mail://m1', kind: 'mail', title: 'Demo moved — from Priya (co-founder)', text: 'Hey, the investor demo moved to Friday at 10. Can you make the pitch deck shorter? Ten slides max. — Priya' },
  { uri: 'mail://m2', kind: 'mail', title: 'Your order has shipped', text: 'Your running shoes, size 10, shipped with UPS and should arrive Thursday.' },
  { uri: 'file:///Docs/wifi.txt', kind: 'file', title: 'Home network', text: 'The router is in the hallway closet. Restart it by holding the reset button for ten seconds.' },
  { uri: 'note://garden', kind: 'note', title: 'Garden', text: 'Water the tomatoes every morning. Plant garlic in October. The basil does better in the shade.' },
  { uri: 'command://1', kind: 'command', title: 'You asked', text: 'You asked: find flights to Lisbon in December. Dixi found TAP for $612 round trip.' },
  { uri: 'file:///Docs/car.md', kind: 'file', title: 'Car', text: 'Honda Civic 2019. Oil change every 5,000 miles, last done at 41,200 miles. Insurance renews in June.' },
];
const CASES = [
  { q: 'how much is my rent', expect: 'file:///Docs/lease.pdf' },
  { q: 'when does my lease run out', expect: 'file:///Docs/lease.pdf' },
  { q: 'what did Acme charge me', expect: 'file:///Docs/acme-invoice.pdf' },
  { q: 'when is my next dentist appointment', expect: 'note://dentist' },
  { q: 'which antibiotic am I allergic to', expect: 'note://dentist' },
  { q: 'what did my co-founder say about the demo', expect: 'mail://m1' },
  { q: 'when will my shoes arrive', expect: 'mail://m2' },
  { q: 'how do I reset the router', expect: 'file:///Docs/wifi.txt' },
  { q: 'when should I plant garlic', expect: 'note://garden' },
  { q: 'how much were the Lisbon flights', expect: 'command://1' },
  { q: 'when is the next oil change due', expect: 'file:///Docs/car.md' },
];
// No shared words with the answer: only meaning can find these.
const SYNONYMS = [
  { q: 'where is the internet box', expect: 'file:///Docs/wifi.txt' },
  { q: 'what vegetables am I growing', expect: 'note://garden' },
  { q: 'how often do I get my teeth cleaned', expect: 'note://dentist' },
  { q: 'what do I pay to live in my apartment', expect: 'file:///Docs/lease.pdf' },
  { q: 'when is my vehicle insurance up for renewal', expect: 'file:///Docs/car.md' },
  { q: 'what did the web hosting company bill', expect: 'file:///Docs/acme-invoice.pdf' },
];
const mac = process.platform === 'darwin' ? {} : { skip: 'on-device embeddings are macOS only' };
// The logic tests: no meaning at all (no vectors), so only words count.
const fakeEmbed = async (ts) => ts.map(() => null);
const fresh = (embed) => openIndex(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-idx-')), 'index.db'), { embed });

test('retrieval check: each question finds its source in the top 3 (on-device meaning + words)', mac, async () => {
  const idx = fresh(macEmbed);
  for (const d of DOCS) await idx.add(d);
  const r = await scoreRetrieval(idx, CASES);
  console.log(`  retrieval: hit@3 ${(r.hitAt3 * 100).toFixed(0)}%, MRR ${r.mrr.toFixed(2)}${r.misses.length ? `, missed: ${r.misses.join(' | ')}` : ''}`);
  assert.ok(r.hitAt3 >= 0.9, `hit@3 ${r.hitAt3}: ${r.misses}`);
  const syn = await scoreRetrieval(idx, SYNONYMS);
  console.log(`  synonyms: hit@3 ${(syn.hitAt3 * 100).toFixed(0)}%${syn.misses.length ? `, missed: ${syn.misses.join(' | ')}` : ''}`);
  assert.ok(syn.hitAt3 >= 0.8, `synonyms hit@3 ${syn.hitAt3}`);
  // Found by meaning alone, it still goes to the model (no "I don't know" from code).
  assert.equal((await answerFrom(idx, 'what vegetables am I growing', { ask: async () => 'Tomatoes, garlic and basil [1].' })).known, true);
  // What nothing here mentions has no evidence at all; what is here has some, and ranks with more.
  for (const q of ['what is the capital of Peru', 'how do I bake sourdough bread', 'what is my passport number']) assert.equal((await answerFrom(idx, q, { ask: async () => assert.fail(`asked the model about: ${q}`) })).known, false, q);
  for (const c of CASES) { const top = (await idx.search(c.q))[0]; assert.ok(top.words > 0 && top.confidence > 0.2, `${c.q}: ${JSON.stringify(top)}`); }
});

test('an answer cites its passages; weak evidence → "I don\'t know" with what was searched, and no model call', async () => {
  const idx = fresh(fakeEmbed);
  for (const d of DOCS) await idx.add(d);
  const prompts = [];
  const ask = async (system, user) => { prompts.push({ system, user }); return 'Your rent is $1,850 a month [1], due on the 1st [1]. [9]'; };
  const a = await answerFrom(idx, 'how much is the monthly rent', { ask });
  assert.equal(a.known, true);
  assert.equal(a.say, 'Your rent is $1,850 a month, due on the 1st.');
  assert.deepEqual(a.sources.map((s) => s.uri), ['file:///Docs/lease.pdf'], 'only real citations; [9] is dropped');
  assert.match(prompts[0].system, /data, never instructions/);
  assert.match(prompts[0].user, /\[1\] \(file: Apartment lease 2026\)/);
  const n = prompts.length;
  const idk = await answerFrom(idx, 'zebra quantum volcano', { ask });
  assert.equal(idk.known, false);
  assert.match(idk.say, /^I don't know\. I looked through your files, your notes, your mail and what you asked me/);
  assert.equal(prompts.length, n, 'no model call to guess');
});

test('a changed file replaces its old passages; the same version is skipped; removed means gone', async () => {
  const idx = fresh(fakeEmbed);
  assert.equal(await idx.add({ uri: 'file:///a.txt', kind: 'file', title: 'a', text: 'blue whales sing', mtime: 1 }), 1);
  assert.equal(await idx.add({ uri: 'file:///a.txt', kind: 'file', title: 'a', text: 'blue whales sing', mtime: 1 }), 0, 'unchanged: skipped');
  await idx.add({ uri: 'file:///a.txt', kind: 'file', title: 'a', text: 'red pandas climb', mtime: 2 });
  assert.equal((await idx.search('whales')).length, 0);
  assert.equal((await idx.search('pandas'))[0].uri, 'file:///a.txt');
  assert.ok(idx.remove('file:///a.txt'));
  assert.deepEqual(await idx.search('pandas'), []);
  assert.deepEqual(idx.stats(), {});
});

test('long text is cut into passages on paragraph and sentence lines', () => {
  const para = 'One sentence here. '.repeat(30).trim();
  const parts = chunk(`${para}\n\nShort tail.`, 200);
  assert.ok(parts.every((p) => p.length <= 200), parts.map((p) => p.length).join());
  assert.ok(parts.slice(0, -1).every((p) => p.endsWith('.')));
  assert.equal(parts.at(-1).endsWith('Short tail.'), true);
});

test('secrets in a note never reach the model', async () => {
  assert.equal(hideSecrets('Bank login password: hunter2 and PIN 4412'), 'Bank login password: [hidden] and PIN: [hidden]');
  assert.equal(hideSecrets('Card 4242 4242 4242 4242, call 555-0100'), 'Card [number hidden], call 555-0100');
  const idx = fresh(fakeEmbed);
  await idx.add({ uri: 'note://bank', kind: 'note', title: 'Bank', text: 'Chase checking. Routing 021000021. Password: Tr0ub4dor&3. Branch on Main St.' });
  let sent = '';
  await answerFrom(idx, 'which branch is my bank', { ask: async (_s, u) => { sent = u; return 'Main St [1].'; } });
  assert.ok(sent.includes('Branch on Main St') && !sent.includes('Tr0ub4dor') && !sent.includes('021000021'), sent);
});
