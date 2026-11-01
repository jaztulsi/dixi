// Per-stage timing for one request. Call mark(runId, stage) as the request moves along. Each stage logs one line
// as it happens, so first_audio can still land after done:
//   [timing] {"run":"r1","stage":"planned","ms":412,"step":180}   (ms since the first mark, step since the last)
// Stages (BOARD contract): heard, stt_final, routed, planned, first_action, done, first_audio. Only the first of each counts.
const runs = new Map();
let sink = (line) => console.log(line);

/** Where the lines go (console by default). → the previous sink. */
export const setSink = (fn) => { const was = sink; sink = fn; return was; };

export function mark(runId, stage, now = performance.now()) {
  if (!runId || !stage) return;
  let r = runs.get(runId);
  if (!r) {
    r = { t0: now, last: now, at: {} };
    runs.set(runId, r);
    if (runs.size > 50) runs.delete(runs.keys().next().value);   // ponytail: keeps the last 50 runs, enough for one session's log
  }
  if (stage in r.at) return;
  r.at[stage] = Math.round(now - r.t0);
  const step = Math.round(now - r.last);
  r.last = now;
  try { sink(`[timing] ${JSON.stringify({ run: String(runId), stage, ms: r.at[stage], step })}`); } catch {}
}

/** { stage: ms since the first mark } for a run, or null. */
export const timings = (runId) => (runs.has(runId) ? { ...runs.get(runId).at } : null);
