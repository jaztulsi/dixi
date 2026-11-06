// Zero questions in normal mode (the ⌥Space path): every approve()/askUser() call in src/main sits behind
// careful mode, and every place that hands approve/askUser to another module hands it over gated. Static, so
// it fails the moment a new ask is added without the guard. (Comments are ignored: a guard must be code.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../../src/main/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(new URL(f, dir), 'utf8').split('\n').map((l) => l.replace(/\s\/\/.*$/, '').replace(/^\s*(\/\/|\*|\/\*).*$/, ''))]);
const RELAY = /Claude Code asks/;   // the bridge passes on another agent's own question; Dixi isn't the one asking
// A module that asks only when its caller lets it: the guard it relies on, checked at the callers below.
const CALLEE = { 'files.js': /!undo\b/, 'memory.js': /./ };

test('normal mode asks nothing: each approve()/askUser() call is behind careful mode', () => {
  const open = [];
  for (const [f, L] of files) L.forEach((l, i) => {
    if (!/\b(approve|askUser)\(/.test(l) || /function (approve|askUser)\(/.test(l)) return;
    const near = L.slice(Math.max(0, i - 2), i + 1).join('\n');
    if (/careful/.test(near) || RELAY.test(l) || (CALLEE[f] && CALLEE[f].test(near))) return;
    open.push(`${f}:${i + 1}: ${l.trim().slice(0, 110)}`);
  });
  assert.deepEqual(open, [], 'a question reachable in normal mode');
});

test('approve/askUser handed to another module go over gated: careful, a no-ask stand-in, or with undo (moves just happen)', () => {
  const open = [];
  for (const [f, L] of files.filter(([f]) => /^(everywhere|builtin-tools)\.js$/.test(f))) L.forEach((l, i) => {
    if (!/(?<![\w:'-])(approve|askUser)\b(?![\s[(]|\w)/.test(l) || /function (approve|askUser)\(/.test(l)) return;
    if (/careful|async \(\) => true|\bundo\b/.test(l) || RELAY.test(l)) return;
    open.push(`${f}:${i + 1}: ${l.trim().slice(0, 110)}`);
  });
  assert.deepEqual(open, [], 'an ask handed over ungated');
  // The callee guards above hold only while every caller passes them: fileAction always gets undo, memoryTurn a gated approve.
  const ew = files.find(([f]) => f === 'everywhere.js')[1].join('\n');
  for (const m of ew.matchAll(/fileAction\([^)]*\)/g)) assert.match(m[0], /\bundo\b/, m[0]);
  for (const m of ew.matchAll(/memoryTurn\([^)]*\)\s*\)?[^\n]*/g)) assert.match(m[0], /careful \? approve/, m[0]);
});
