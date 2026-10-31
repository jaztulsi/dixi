// The Claude Code ↔ Dixi bridge: your own Claude Code sessions talk to you out loud through Dixi.
// A Unix socket at <userData>/dixi.sock (owner-only; no TCP port, so nothing on the network can reach
// it), and every request carries the token in <userData>/bridge-token (owner-only, made on first run).
// One JSON object per line: {token, id, method, params} → {id, result} or {id, error}.
// bin/dixi-mcp.mjs is the Claude Code side.
//
// THE BRIDGE ONLY TALKS AND LISTENS: say, notify, ask, status. Never add a method here that clicks,
// types, opens an app or takes a screenshot. Claude Code, and anything that can steer it (a README, a web
// page, a test log), must not get a way around Dixi's gate: acting on the Mac stays behind ⌥Space /
// "Dixi, …" and the approval card.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';

export const ASK_MS = 60000;

/** Spoken-line rate limit: one every gapMs, perMin a minute. take() → 0 when allowed, else ms to wait. */
export function limiter({ gapMs = 2000, perMin = 10, now = Date.now } = {}) {
  const times = [];
  return function take() {
    const t = now();
    while (times.length && t - times[0] >= 60000) times.shift();
    const wait = Math.max(times.length ? times.at(-1) + gapMs - t : 0, times.length >= perMin ? times[0] + 60000 - t : 0);
    if (wait > 0) return wait;
    times.push(t);
    return 0;
  };
}

// ponytail: a copy of voice.js's YES (not exported there, and renderer files are off-limits).
const YES = /^(yes|yeah|yep|yup|sure|do it|go ahead|confirm|ok(ay)?|please do|that'?s right|correct)\b/i;
export const isYesNo = (choices) => choices?.length === 2 && choices.map((c) => c.toLowerCase()).sort().join() === 'no,yes';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What Claude Code gets back: 'yes'/'no' for a yes/no question (anything unclear is a no), the choice
 *  the user named (the longest match wins), or else their words as said. null = no answer. */
export function pickAnswer(answer, choices = []) {
  if (answer === true || answer === false) return answer ? 'yes' : 'no';   // the card's buttons
  const a = String(answer ?? '').trim().slice(0, 1000);
  if (!a) return null;
  if (isYesNo(choices)) return YES.test(a) ? 'yes' : 'no';
  return [...choices].sort((x, y) => y.length - x.length).find((c) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(c)}($|[^\\p{L}\\p{N}])`, 'iu').test(a)) ?? a;
}

// Text that Dixi will speak: one line, capped, and never Dixi's own wake word (its voice must not be
// able to start a request through the microphone).
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').replace(/\bdixi\b[,:!.]?\s*/gi, '').trim().slice(0, n);

function loadToken(file) {
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(t)) { fs.chmodSync(file, 0o600); return t; }
  } catch {}
  const t = crypto.randomBytes(32).toString('hex');
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, t, { mode: 0o600, flag: 'wx' });   // a fresh file, so the mode applies
  return t;
}

/** Start the bridge. say(text), notify({title, text, line}), ask(question, {choices, yesNo}) → words,
 *  true/false or null; status() → {listening, mic, busy}. Returns { close(), ready }. */
export function startBridge({ dir, say, notify, ask, status = () => ({}), askMs = ASK_MS }) {
  const sock = path.join(dir, 'dixi.sock');
  const want = Buffer.from(loadToken(path.join(dir, 'bridge-token')));
  const tokenOk = (t) => { const b = Buffer.from(String(t ?? '')); return b.length === want.length && crypto.timingSafeEqual(b, want); };
  const take = limiter();
  let asking = false;

  // Before anything is spoken: not while Dixi is busy for you (an approval card, a question, a task;
  // a "yes" in Claude Code's voice must never land on Dixi's gate), and not faster than the limit.
  function mayspeak() {
    if (status()?.busy) throw new Error('Dixi is busy with the user right now (talking, asking or doing a task). Try again in a little while.');
    const wait = take();
    if (wait) throw new Error(`Too fast: Dixi speaks at most once every 2 seconds and 10 times a minute. Try again in ${Math.ceil(wait / 1000)} s.`);
  }

  const methods = {
    say({ text }) {
      const t = clean(text, 400);
      if (!t) throw new Error('text is empty');
      mayspeak(); say(t);
      return { said: t };
    },
    notify({ title, text }) {
      const head = clean(title, 80), body = clean(text, 400);
      if (!head && !body) throw new Error('title and text are empty');
      const line = head || body.split(/(?<=[.!?])\s/)[0].slice(0, 160);
      mayspeak(); notify({ title: head || 'Claude Code', text: body, line });
      return { said: line };
    },
    async ask({ question, choices }) {
      const q = clean(question, 300);
      if (!q) throw new Error('question is empty');
      const opts = Array.isArray(choices) ? choices.map((c) => clean(c, 40)).filter(Boolean).slice(0, 6) : [];
      const yesNo = isYesNo(opts);
      if (asking) throw new Error('Dixi is already waiting for an answer to another question.');
      if (!yesNo && status()?.mic === false) throw new Error('The microphone is off in Dixi, so the user can\'t answer out loud. Ask in the terminal, or pass choices ["yes","no"] for a button.');
      mayspeak();
      asking = true;
      let timer;
      try {
        const spoken = opts.length && !yesNo ? `${q} ${opts.slice(0, -1).join(', ')}${opts.length > 1 ? ', or ' : ''}${opts.at(-1)}?` : q;
        const heard = await Promise.race([ask(spoken, { choices: opts, yesNo }), new Promise((r) => { timer = setTimeout(() => r(null), askMs); })]);
        return { answer: pickAnswer(heard, opts) };
      } finally { clearTimeout(timer); asking = false; }
    },
    status: () => status(),
  };

  const send = (c, o) => { if (!c.destroyed) c.write(`${JSON.stringify(o)}\n`); };
  async function reply(c, line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return send(c, { id: null, error: 'not JSON' }); }
    const id = msg?.id ?? null;
    if (!tokenOk(msg?.token)) { send(c, { id, error: 'bad token' }); return c.end(); }
    if (!Object.hasOwn(methods, msg.method)) return send(c, { id, error: `unknown method: ${msg.method}` });
    const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
    try { send(c, { id, result: await methods[msg.method](params) }); } catch (e) { send(c, { id, error: e.message }); }
  }

  const conns = new Set();
  const server = net.createServer((c) => {
    conns.add(c);
    let buf = '';
    c.setEncoding('utf8');
    c.on('data', (d) => {
      buf += d;
      if (buf.length > 65536) return c.destroy();   // nobody honest sends this much
      for (let i; (i = buf.indexOf('\n')) >= 0;) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) reply(c, line); }
    });
    c.on('error', () => {});
    c.on('close', () => conns.delete(c));
  });
  server.on('error', (e) => console.warn('[bridge]', e.message));
  fs.rmSync(sock, { force: true });   // a socket left behind by a crash (Dixi is single-instance)
  const ready = new Promise((resolve) => server.listen(sock, () => { fs.chmodSync(sock, 0o600); resolve(); }));
  return {
    ready,
    close() { for (const c of conns) c.destroy(); server.close(); fs.rmSync(sock, { force: true }); },
  };
}
