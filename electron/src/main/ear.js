// Dixi's ear: the native helper (native/dixi-ear, Swift) owns the Fn key, the mic and the on-device speech
// model, and talks JSON lines over stdio. This file runs it, restarts it if it dies, turns its raw key events
// into gestures (ptt.js fnGestures) and hands the island and run() exactly one final transcript per utterance.
//
// helper → Dixi   {ev:'ready', stt, perms}  {ev:'key', type, t, ctrl?}  {ev:'level', v}  {ev:'partial', text}
//                 {ev:'final', text, ms}  {ev:'context', app, bundle, title, url, editable, selection}
//                 {ev:'mic', ms}  {ev:'error', where, message}
// Dixi → helper   {cmd:'stop'} finish and send the final   {cmd:'cancel'} drop it   {cmd:'paste', text}
//                 {cmd:'vocab', words}   {cmd:'quit'}
// The helper starts recording by itself the instant Fn goes down (no round trip); Dixi only says how it ends.
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fnGestures } from './ptt.js';
import { stripName } from './plan.js';
export { stripName };

/**
 * Learning from corrections: you say a command, it goes wrong (or you cancel it), and within 20 s you say it again
 * differently. The words of the retry that weren't in the first try (names, mostly) are the ones the ear misheard,
 * so they go into your own word list, which biases recognition from then on. Returns the new words (≤ 3).
 */
const COMMON = new Set('a an the and or then to on in at for of my me it this that please open search find go play quit switch close new make set turn up down with from is are be can you i'.split(' '));
export function learnedWords(first, retry, known = []) {
  const words = (s) => String(s ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
  const had = new Set(words(first).map((w) => w.toLowerCase())), have = new Set(known.map((w) => w.toLowerCase()));
  const fresh = words(retry).filter((w) => w.length >= 3 && !COMMON.has(w.toLowerCase()) && !had.has(w.toLowerCase()) && !have.has(w.toLowerCase()));
  return fresh.length && fresh.length <= 3 ? [...new Set(fresh)] : [];   // a whole new sentence isn't a correction
}

/**
 * Hands-free (double-tap Fn, or Fn+Space): each command is sent at a natural pause and the mic stays open for the
 * next, so a whole shopping trip needs no key. How long a pause ends a command: a finished sentence (the speech
 * model's period) 0.8 s; a sentence left hanging on "and", "to", "the", "my"… 2.6 s (you're still thinking);
 * otherwise 1.2 s. Holding Fn is never cut: release is the only end there.
 */
const HANGING = /\b(?:and|then|to|the|a|an|of|on|in|into|onto|for|with|my|from|at|or|but|so|um|uh|like|is|are|some|also|please)[,]?$/i;
export function endPause(text) {
  const t = String(text ?? '').trim();
  if (!t) return Infinity;
  if (HANGING.test(t)) return 2600;
  if (/[.!?]["”']?$/.test(t)) return 800;
  return 1200;
}

/** Where the built helper is (packaged resources first, then the dev build), or null. */
export function findEar(root, { exists = fs.existsSync, resources = process.resourcesPath } = {}) {
  const at = [resources && path.join(resources, 'dixi-ear'), path.join(root, 'native/dixi-ear/.build/release/dixi-ear'), path.join(root, 'native/dixi-ear/.build/debug/dixi-ear')].filter(Boolean);
  return at.find((p) => exists(p)) ?? null;
}

/**
 * startEar({ bin, api }) → { stop(), send(msg), state() }
 * api (everywhere.js `ear`): open(mode) show(mode) mode(m) partial(t) level(v) context(c) cancel(why) final(text, mode) stop() unavailable(why) vocab()
 */
export function startEar({ bin, args = [], api, spawn = nodeSpawn, log = () => {}, finalMs = 1000, restartMs = 2000, maxCrashes = 5,
  setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t), now = () => Date.now(), gestureOpts = {} }) {
  let child = null, stopped = false, crashes = 0, lastStart = 0, ready = null;
  let partial = '', waiting = null;   // waiting: { mode, timer, at } between the release and the helper's final
  // Hands-free segments: seg = the helper's segment now being heard; sent = segments handed over at a pause,
  // waiting for their final (seg → {text, timer, mode}); changedAt = when the words last changed.
  let locked = false, open = false, seg = 0, changedAt = 0, ticker = null;
  const sent = new Map();
  const deliver = (text, mode, more = false) => {
    const said = stripName(text);
    stats.finals++;
    if (mode === 'dictate' && said) send({ cmd: 'paste', text: said });
    Promise.resolve(api.final(said, mode, { more })).catch((err) => log(`[ear] run failed: ${err?.message}`));
  };
  const stopTicker = () => { clearTimer(ticker); ticker = null; };
  const tick = () => {
    ticker = setTimer(tick, 100);
    if (!locked || waiting || !partial.trim() || now() - changedAt < endPause(partial)) return;
    const s = seg, text = partial, mode = modeNow;
    send({ cmd: 'next' });
    partial = ''; seg = s + 1; changedAt = now();
    api.partial('');
    sent.set(s, { text, mode, timer: setTimer(() => { if (sent.delete(s)) { stats.timeouts++; deliver(text, mode, open); } }, finalMs) });
  };
  let modeNow = 'command';
  const stats = { sessions: 0, finals: 0, timeouts: 0, finalMs: [], micMs: [] };
  const send = (msg) => { try { child?.stdin?.write(`${JSON.stringify(msg)}\n`); } catch { /* it died: the exit handler deals with it */ } };

  const finish = (text, ms) => {
    if (!waiting) return;
    const { mode, timer } = waiting;
    clearTimer(timer); waiting = null;
    if (ms != null) stats.finalMs.push(ms);
    partial = '';
    deliver(text, mode);
  };
  const gesture = fnGestures({
    ...gestureOpts, setTimer, clearTimer,
    onOpen: (mode) => { if (waiting) finish(partial); stats.sessions++; partial = ''; open = true; locked = false; modeNow = mode; changedAt = now(); api.open(mode); },
    onLock: () => { locked = true; changedAt = now(); stopTicker(); tick(); },
    onShow: (mode) => api.show(mode),
    onMode: (mode) => { modeNow = mode; api.mode?.(mode); },
    onSend: (mode) => {
      const handsFree = locked;
      open = false; locked = false; stopTicker();
      if (handsFree && !partial.trim()) { send({ cmd: 'stop' }); api.cancel('done'); return; }   // hands-free, everything already sent: just close
      send({ cmd: 'stop' });
      // The helper answers with the final; if it doesn't in time, the last words shown are the command.
      waiting = { mode, at: now(), timer: setTimer(() => { stats.timeouts++; finish(partial); }, finalMs) };
    },
    onCancel: (why) => { open = false; locked = false; stopTicker(); send({ cmd: 'cancel' }); partial = ''; api.cancel(why); },
  });

  const onLine = (line) => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.ev) {
      case 'ready': ready = m; crashes = 0; log(`[ear] ready: stt=${m.stt} perms=${JSON.stringify(m.perms ?? {})}`); Promise.resolve(api.vocab?.()).then((words) => words?.length && send({ cmd: 'vocab', words })).catch(() => {}); return;
      case 'key':
        if (typeof m.type !== 'string') return;
        if (m.type === 'esc' && !open && api.busy?.()) { api.stop?.(); return; }   // Esc stops what Dixi is doing
        gesture({ type: m.type, t: Number(m.t) || now(), ctrl: Boolean(m.ctrl) });
        return;
      case 'level': return api.level(m.v);
      case 'partial': {
        if (Number.isFinite(m.seg) && m.seg < seg) return;   // a late word from a segment already sent
        if (Number.isFinite(m.seg)) seg = m.seg;
        const text = String(m.text ?? '');
        if (text !== partial) changedAt = now();
        partial = text;
        if (!waiting) api.partial(stripName(partial));
        return;
      }
      case 'final': {
        const handed = Number.isFinite(m.seg) ? sent.get(m.seg) : sent.size && !waiting ? sent.get(Math.min(...sent.keys())) : null;
        if (handed) {   // a hands-free segment: its own final (or the words shown, if the final is empty)
          const key = Number.isFinite(m.seg) ? m.seg : Math.min(...sent.keys());
          clearTimer(handed.timer); sent.delete(key);
          if (Number.isFinite(m.ms)) stats.finalMs.push(m.ms);
          return deliver(String(m.text ?? '').trim() || handed.text, handed.mode, open);
        }
        return finish(String(m.text ?? ''), Number.isFinite(m.ms) ? m.ms : waiting ? now() - waiting.at : null);
      }
      case 'context': return api.context(m);
      case 'mic': if (Number.isFinite(m.ms)) stats.micMs.push(m.ms); return;
      case 'error': log(`[ear] ${m.where ?? 'helper'}: ${m.message ?? ''}`); if (m.fatal) api.unavailable?.(String(m.message ?? m.where)); return;
    }
  };

  const go = () => {
    if (stopped) return;
    lastStart = now();
    child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) if (l.trim()) onLine(l); });
    child.stderr?.on('data', (d) => log(`[ear:stderr] ${String(d).trim().slice(0, 400)}`));
    child.on('error', (err) => log(`[ear] couldn't start: ${err.message}`));
    child.on('exit', (code) => {
      child = null; ready = null;
      gesture({ type: 'reset', t: now() });   // a hold in progress is dropped, never stuck open
      for (const [k, x] of sent) { clearTimer(x.timer); sent.delete(k); deliver(x.text, x.mode); }   // already said and sent: still done
      if (waiting) finish(partial);           // words already said before it died are still the command
      if (stopped) return;
      crashes = now() - lastStart < 10000 ? crashes + 1 : 1;
      if (crashes >= maxCrashes) { log(`[ear] stopped after ${crashes} quick exits (code ${code})`); api.unavailable?.(`the helper exited ${crashes} times in a row (code ${code})`); return; }
      setTimer(go, restartMs)?.unref?.();
    });
  };
  go();
  return {
    stop() { stopped = true; send({ cmd: 'quit' }); child?.kill(); },
    send, state: () => ({ running: Boolean(child), ready, stats }),
    key: gesture,   // for a keyboard without Fn handled elsewhere, and for tests
    refreshVocab: () => Promise.resolve(api.vocab?.()).then((words) => words?.length && send({ cmd: 'vocab', words })).catch(() => {}),
  };
}
