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

/** Where the built helper is (packaged resources first, then the dev build), or null. */
export function findEar(root, { exists = fs.existsSync, resources = process.resourcesPath } = {}) {
  const at = [resources && path.join(resources, 'dixi-ear'), path.join(root, 'native/dixi-ear/.build/release/dixi-ear'), path.join(root, 'native/dixi-ear/.build/debug/dixi-ear')].filter(Boolean);
  return at.find((p) => exists(p)) ?? null;
}

/**
 * startEar({ bin, api }) → { stop(), send(msg), state() }
 * api (everywhere.js `ear`): open(mode) show(mode) mode(m) partial(t) level(v) context(c) cancel(why) final(text, mode) stop() unavailable(why) vocab()
 */
export function startEar({ bin, api, spawn = nodeSpawn, log = () => {}, finalMs = 1000, restartMs = 2000, maxCrashes = 5,
  setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t), now = () => Date.now(), gestureOpts = {} }) {
  let child = null, stopped = false, crashes = 0, lastStart = 0, ready = null;
  let partial = '', waiting = null;   // waiting: { mode, timer, at } between the release and the helper's final
  const stats = { sessions: 0, finals: 0, timeouts: 0, finalMs: [], micMs: [] };
  const send = (msg) => { try { child?.stdin?.write(`${JSON.stringify(msg)}\n`); } catch { /* it died: the exit handler deals with it */ } };

  const finish = (text, ms) => {
    if (!waiting) return;
    const { mode, timer } = waiting;
    clearTimer(timer); waiting = null;
    if (ms != null) stats.finalMs.push(ms);
    const said = stripName(text);
    partial = '';
    stats.finals++;
    if (mode === 'dictate' && said) send({ cmd: 'paste', text: said });
    Promise.resolve(api.final(said, mode)).catch((err) => log(`[ear] run failed: ${err?.message}`));
  };
  const gesture = fnGestures({
    ...gestureOpts, setTimer, clearTimer,
    onOpen: (mode) => { if (waiting) finish(partial); stats.sessions++; partial = ''; api.open(mode); },
    onShow: (mode) => api.show(mode),
    onMode: (mode) => api.mode?.(mode),
    onSend: (mode) => {
      send({ cmd: 'stop' });
      // The helper answers with the final; if it doesn't in time, the last words shown are the command.
      waiting = { mode, at: now(), timer: setTimer(() => { stats.timeouts++; finish(partial); }, finalMs) };
    },
    onCancel: (why) => { send({ cmd: 'cancel' }); partial = ''; api.cancel(why); },
  });

  const onLine = (line) => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.ev) {
      case 'ready': ready = m; crashes = 0; log(`[ear] ready: stt=${m.stt} perms=${JSON.stringify(m.perms ?? {})}`); Promise.resolve(api.vocab?.()).then((words) => words?.length && send({ cmd: 'vocab', words })).catch(() => {}); return;
      case 'key': if (typeof m.type === 'string') gesture({ type: m.type, t: Number(m.t) || now(), ctrl: Boolean(m.ctrl) }); return;
      case 'level': return api.level(m.v);
      case 'partial': partial = String(m.text ?? ''); if (!waiting) api.partial(stripName(partial)); return;
      case 'final': return finish(String(m.text ?? ''), Number.isFinite(m.ms) ? m.ms : waiting ? now() - waiting.at : null);
      case 'context': return api.context(m);
      case 'mic': if (Number.isFinite(m.ms)) stats.micMs.push(m.ms); return;
      case 'error': log(`[ear] ${m.where ?? 'helper'}: ${m.message ?? ''}`); if (m.fatal) api.unavailable?.(String(m.message ?? m.where)); return;
    }
  };

  const go = () => {
    if (stopped) return;
    lastStart = now();
    child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) if (l.trim()) onLine(l); });
    child.stderr?.on('data', (d) => log(`[ear:stderr] ${String(d).trim().slice(0, 400)}`));
    child.on('error', (err) => log(`[ear] couldn't start: ${err.message}`));
    child.on('exit', (code) => {
      child = null; ready = null;
      gesture({ type: 'reset', t: now() });   // a hold in progress is dropped, never stuck open
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
  };
}
