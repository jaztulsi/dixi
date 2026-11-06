// Planner A/B (Phase 3 item 3), live: Haiku alone vs the fast try first (Groq, Cerebras; Haiku when it isn't
// sure) on the 21 bench commands. Plan only: nothing is run. Each command's Haiku reply is fetched once and
// reused (after its own recorded wait) whenever another arm falls back, since it is the same request.
// A hard cap: no call starts once --cap dollars are spent. Keys come from .env and are never printed.
//   node eval/plan-ab.mjs [--cap 0.10]   → eval/out/plan-ab-<stamp>.json, test/fixtures/plan-fast.json, a table
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/main/config.js';
import { ENDPOINTS, Spend, fastChat } from '../src/main/providers.js';
import { plan } from '../src/main/plan.js';
import { benchCommands } from './bench-commands.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const CAP = Number(arg('cap', 0.1));
const HAIKU = 'anthropic:claude-haiku-5-5';
const FAST = ['groq:openai/gpt-oss-120b', 'cerebras:gpt-oss-120b'];
const config = loadConfig();
const spend = new Spend(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-ab-')), 'spend.json'), 0);
const { apps, fixtures } = createRequire(import.meta.url)('../test/fixtures/plan-live.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
let calls = 0;
const budget = () => { if (spend.total >= CAP) throw new Error(`cap $${CAP} reached`); calls++; };

const rows = [], fastFixtures = {}, asked = new Set();   // asked: commands code couldn't plan alone
for (const [n, said] of benchCommands(fixtures).entries()) {
  let haiku = null;   // { j, ms }: this command's one Haiku reply
  const model = async (body) => {
    asked.add(said);
    if (haiku) { await sleep(haiku.ms); return haiku.j; }
    budget();
    const t0 = performance.now();
    const res = await fetch(ENDPOINTS.anthropic.url, { method: 'POST',
      headers: { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error?.message ?? `HTTP ${res.status}`);
    haiku = { j, ms: Math.round(performance.now() - t0) };
    spend.add(HAIKU, j.usage);
    return j;
  };
  const arm = (name) => {
    if (name === HAIKU) return { model };
    const f = fastChat(config, spend, name);
    return { model, fast: async (body, sig) => {
      asked.add(said);
      budget();
      const t0 = performance.now();
      try { const j = await f(body, sig); fastFixtures[name] ??= {}; fastFixtures[name][said] = { text: j.choices?.[0]?.message?.content, finish: j.choices?.[0]?.finish_reason, ms: Math.round(performance.now() - t0), usage: j.usage }; return j; }
      catch (err) { fastFixtures[name] ??= {}; fastFixtures[name][said] = { error: err.message, ms: Math.round(performance.now() - t0) }; throw err; }
    } };
  };
  const order = [HAIKU, ...FAST];
  for (const name of [...order.slice(n % 3), ...order.slice(0, n % 3)]) {   // rotated, so no arm always gets the warm connection
    const r = await plan(said, {}, { apps, home: os.homedir(), ...arm(name) }).catch((err) => ({ steps: [], source: 'error', why: err.message }));
    rows.push({ said, arm: name, source: r.source, planner: r.planner ?? (r.source === 'model' ? 'haiku' : r.why ? 'failed' : 'code'), ms: r.ms, why: r.why ?? null,
      fastMs: fastFixtures[name]?.[said]?.ms ?? null, fastError: fastFixtures[name]?.[said]?.error ?? null,
      steps: r.steps.map((s) => ({ do: s.do, app: s.app, url: s.url, kind: s.kind, clause: s.clause, lang: s.lang, code: s.code, why: s.why })) });
  }
}

// ---- report: speed (plan ready) and agreement with Haiku, per arm, over the commands that need a model ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(path.join(root, 'eval/out'), { recursive: true });
const file = path.join(root, 'eval/out', `plan-ab-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ cap: CAP, spentUSD: spend.total, calls, rows }, null, 1));
fs.writeFileSync(path.join(root, 'test/fixtures/plan-fast.json'), JSON.stringify(fastFixtures, null, 2));
const shape = (r) => r.steps.map((s) => `${s.do}:${s.app || (s.url ? String(s.url).split(/[?#]/)[0] : '') || s.kind || ''}`).join(' → ');
const ai = [...asked];
const of = (arm, said) => rows.find((r) => r.arm === arm && r.said === said);
console.log([`Planner A/B ${stamp}: ${ai.length} of ${new Set(rows.map((r) => r.said)).size} commands need a model; ${calls} calls, $${spend.total.toFixed(4)} spent (cap $${CAP})`, '',
  '| arm | plan ready p50 ms | p95 | kept fast | fell back | same shape as Haiku |', '|---|---|---|---|---|---|',
  ...[HAIKU, ...FAST].map((a) => { const rs = ai.map((s) => of(a, s));
    return `| ${a} | ${pct(rs.map((r) => r.ms), 50)} | ${pct(rs.map((r) => r.ms), 95)} | ${rs.filter((r) => r.planner === 'fast').length} | ${a === HAIKU ? '-' : rs.filter((r) => r.planner !== 'fast').length} | ${rs.filter((r) => shape(r) === shape(of(HAIKU, r.said))).length}/${rs.length} |`; }),
  '', ...ai.flatMap((s) => [`- ${s}`, ...[HAIKU, ...FAST].map((a) => { const r = of(a, s); return `    ${a.split(':')[0].padEnd(9)} ${String(r.ms).padStart(5)} ms ${r.planner.padEnd(5)} ${shape(r)}${r.fastError ? `  (fast: ${r.fastError.slice(0, 80)})` : ''}`; })]),
  '', `raw: ${path.relative(root, file)}`].join('\n'));
