// Background jobs: a long request keeps running while you do other things. Each job reports which step
// it's on (and why), how far along it is, and how long each step took. That feeds the progress widget, the
// "what's happening" view and the latency log. While it runs, Dixi says a short update now and then
// ("Found three options, comparing now"); when it's done or fails you get a notification, and a failed job
// can be retried in one click. Stopping (the kill key) stops every job.
import { plainError } from './tools.js';

/** deps: notify({ title, body, id }), say(text), onChange(jobs), log({ job, step, ms, ok }), now */
export function createJobs({ notify = () => {}, say = () => {}, onChange = () => {}, log = () => {}, now = Date.now, quietMs = 4000, speakEveryMs = 10000, keep = 20 } = {}) {
  const jobs = new Map();
  let seq = 0;
  const snap = (j) => ({ id: j.id, name: j.name, state: j.state, progress: j.progress, step: j.steps.at(-1)?.text ?? '', why: j.steps.at(-1)?.why ?? '',
    steps: j.steps.map(({ text, why, ms, ok }) => ({ text, why, ms, ok })), startedAt: j.startedAt, ms: j.ms, say: j.result?.say ?? '', error: j.error ?? '' });
  const changed = () => {
    const done = [...jobs.values()].filter((j) => j.state !== 'running');
    for (const j of done.slice(0, Math.max(0, done.length - keep))) jobs.delete(j.id);   // old finished jobs drop off
    onChange([...jobs.values()].map(snap));
  };

  function start(name, fn, { speak = true, notifyDone = true } = {}) {
    const ac = new AbortController();
    const j = { id: ++seq, name: String(name).slice(0, 80), fn, opts: { speak, notifyDone }, state: 'running', progress: null, steps: [], startedAt: now(), ac, lastSpoke: -Infinity };
    jobs.set(j.id, j);
    const close = () => { const s = j.steps.at(-1); if (s && s.ms == null) { s.ms = now() - s.at; log({ job: j.name, step: s.text, ms: s.ms, ok: s.ok }); } };
    const ctx = {
      signal: ac.signal,
      /** A new step: what it's doing, and why (shown, not spoken). */
      step(text, why = '') { close(); j.steps.push({ text: String(text).slice(0, 120), why: String(why).slice(0, 200), at: now(), ok: true }); changed(); },
      /** How far along (0–1, or null) and a short line that may be spoken, at most every speakEveryMs. */
      progress(text, fraction = null) {
        j.progress = fraction == null ? null : Math.max(0, Math.min(1, fraction));
        if (text) ctx.step(text);
        const t = now();
        if (speak && text && t - j.startedAt >= quietMs && t - j.lastSpoke >= speakEveryMs) { j.lastSpoke = t; say(String(text)); }
        changed();
      },
    };
    changed();
    j.done = (async () => {
      try {
        j.result = (await fn(ctx)) ?? {};
        if (ac.signal.aborted) throw new Error('stopped');
        close(); j.state = 'done'; j.progress = 1;
        if (notifyDone) notify({ id: j.id, title: j.name, body: j.result.say || 'Done.' });
      } catch (err) {
        const s = j.steps.at(-1); if (s && s.ms == null) s.ok = false;
        close();
        j.state = ac.signal.aborted ? 'stopped' : 'failed';
        j.error = ac.signal.aborted ? '' : plainError(err);
        if (j.state === 'failed') notify({ id: j.id, title: `${j.name} didn't finish`, body: `${j.error}. Say "try again" or click Retry.`, retry: true });
      }
      j.ms = now() - j.startedAt;
      changed();
      return snap(j);
    })();
    return { id: j.id, done: j.done, signal: ac.signal };
  }

  return {
    start,
    list: () => [...jobs.values()].map(snap),
    get: (id) => (jobs.has(id) ? snap(jobs.get(id)) : null),
    running: () => [...jobs.values()].filter((j) => j.state === 'running').length,
    stop(id) { const j = jobs.get(id); if (j?.state !== 'running') return false; j.ac.abort(); return true; },
    stopAll() { let n = 0; for (const j of jobs.values()) if (j.state === 'running') { j.ac.abort(); n++; } return n; },
    /** One click: the same job again (the last failed one when no id is given). */
    retry(id) {
      const j = id != null ? jobs.get(id) : [...jobs.values()].findLast((x) => x.state === 'failed');
      if (!j || j.state === 'running') return null;
      jobs.delete(j.id);
      return start(j.name, j.fn, j.opts);
    },
  };
}
