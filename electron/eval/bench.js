// npm run bench: per-stage latency p50/p95, provider and $ per command, with ZERO paid calls.
//
//   everywhere  the real planner (plan.js) on recorded Haiku replies (test/fixtures/plan-live.json), each reply
//               held for its recorded ms, plus commands code answers alone. Plan only: nothing is executed on
//               this shared Mac. A command that needs a model call with no recording fails ("miss").
//   browser     eval/run.js: the real app against the fixture web, the LLM replay cache only, every key replaced
//               by a dummy and every non-loopback connect refused, so a cache miss fails the case, never calls out.
//   reply       the local voice (`say`, the fallback when ElevenLabs is out) synthesizing the spoken reply.
//
//   npm run bench [-- --browser N]   (N corpus cases per category, default 1; runs only once eval/.cache/llm has recordings)
// → bench/out/<stamp>.json and a markdown table on stdout (copied to docs/bench/BASELINE.md by hand).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { plan } from '../src/main/plan.js';
import { ENDPOINTS, Spend } from '../src/main/providers.js';
import { localVoice } from '../src/main/localvoice.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BROWSER = Number(arg('browser', 1));
const CACHE = path.join(root, 'eval/.cache/llm');
const recorded = fs.existsSync(CACHE) ? fs.readdirSync(CACHE, { recursive: true }).filter((f) => f.endsWith('.json')).length : 0;
const PLANNER = 'anthropic:claude-haiku-5-5';   // what plan-live.json was recorded with
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const spend = new Spend(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-bench-')), 'spend.json'), 0);   // prices only, never the real ledger

// ---- everywhere: recorded planner replies + code-only commands ----
const { apps, fixtures } = createRequire(import.meta.url)('../test/fixtures/plan-live.json');
const CODE_ONLY = ['open Safari', 'open Notes', 'open Music', 'open Calendar', 'turn the volume down', 'turn the volume up', 'open Messages', 'mute', 'go back'];
const A3 = ['search lo-fi beats on Apple Music', 'buy a bagel from Safeway', "couldn't find that on this page"];
const everywhere = [];
for (const said of [...new Set([...Object.keys(fixtures), ...CODE_ONLY, ...A3])]) {
  const f = fixtures[said];
  let called = null;
  const model = async () => {
    called = { ms: f?.ms ?? null };
    if (!f) throw Object.assign(new Error('no recorded reply (bench never calls out)'), { miss: true });
    await sleep(f.ms);
    return { stop_reason: f.stop, content: [{ type: 'text', text: f.text ?? JSON.stringify({ steps: f.reply }) }], usage: f.usage };
  };
  const t0 = performance.now();
  const r = await plan(said, {}, { apps, home: os.homedir(), model }).catch((err) => ({ error: err.message }));
  const planMs = Math.round(performance.now() - t0);
  const reply = r.steps?.find((s) => s.say)?.say ?? 'Done.';
  const t1 = performance.now();
  const wav = await localVoice(reply).catch(() => null);
  everywhere.push({
    mode: 'everywhere', said, a3: A3.includes(said), source: r.source ?? 'error', provider: called ? PLANNER : 'code',
    miss: Boolean(called && !f), planMs, providerMs: called?.ms ?? 0, localMs: planMs - (called?.ms ?? 0),
    replyMs: wav ? Math.round(performance.now() - t1) : null, tts: 'say (local)',
    usd: called && f?.usage ? spend.add(PLANNER, f.usage) : 0, steps: (r.steps ?? []).map((s) => s.do).join('+'),
  });
}

// ---- browser: the real app on the fixture web, offline except the replay cache ----
let browser = [];
if (BROWSER > 0 && recorded) {   // ponytail: no recordings → every browser interpret is a miss (measured: 318/318 "no answer"), so skip
  const dummies = Object.fromEntries(Object.values(ENDPOINTS).filter((e) => e.key).map((e) => [e.key, 'bench-dummy-key']));
  const out = `bench-browser-${Date.now()}`;
  const env = { ...process.env, ...dummies, DIXI_LLM_CACHE: 'replay', DIXI_STT: 'deepgram',
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${path.join(root, 'test/no-network.js')}`.trim() };
  const run = spawnSync(process.execPath, ['eval/run.js', '--sample', String(BROWSER), '--seed', '7', '--out', out], { cwd: root, env, encoding: 'utf8', timeout: 15 * 60000 });
  if (run.status !== 0) console.error(run.stderr.slice(-2000));
  const file = path.join(root, 'eval/out', `${out}.json`);
  browser = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).map((r) => ({
    mode: 'browser', said: r.text, pass: r.pass, firstActionMs: r.firstActionMs ?? null, doneMs: r.doneMs ?? null,
    interpretMs: r.interpretMs ?? null, llmCalls: r.llmCalls ?? 0, miss: /replay cache/.test(JSON.stringify(r)), error: r.error,
  })) : [];
}

// ---- report ----
const rows = [...everywhere, ...browser];
const dir = path.join(root, 'bench/out');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(rows, null, 1));
const line = (name, xs) => `| ${name} | ${xs.filter(Number.isFinite).length} | ${pct(xs, 50) ?? '-'} | ${pct(xs, 95) ?? '-'} |`;
const ew = everywhere, br = browser;
console.log([
  `Bench ${new Date().toISOString().slice(0, 16)}: ${rows.length} commands (${ew.length} everywhere, ${br.length} browser), $0 spent, ${rows.filter((r) => r.miss).length} cache misses`,
  '', '| stage (ms) | n | p50 | p95 |', '|---|---|---|---|',
  line('everywhere: interpret→plan ready (all)', ew.map((r) => r.planMs)),
  line('  of which provider (recorded Haiku)', ew.filter((r) => r.provider !== 'code' && !r.miss).map((r) => r.providerMs)),
  line('  of which Dixi code', ew.map((r) => r.localMs)),
  line('reply spoken: local `say` synth', ew.map((r) => r.replyMs)),
  line('browser: speech end→first action', br.map((r) => r.firstActionMs)),
  line('browser: speech end→done', br.map((r) => r.doneMs)),
  '', `Everywhere planner: ${ew.filter((r) => r.provider !== 'code' && !r.miss).length} via ${PLANNER}, ${ew.filter((r) => r.provider === 'code').length} by code; $${ew.reduce((a, r) => a + r.usd, 0).toFixed(4)} total as recorded (${(ew.reduce((a, r) => a + r.usd, 0) / Math.max(1, ew.filter((r) => r.usd).length)).toFixed(5)}/call)`,
  recorded ? `Browser: ${br.filter((r) => r.pass).length}/${br.length} pass, ${br.filter((r) => r.miss).length} stopped at a replay-cache miss (${recorded} recordings)` : 'Browser: not run: eval/.cache/llm is empty, and every browser command needs an LLM call (no code path). Needs one approved record run.',
  '', '| command | mode | provider | plan ms | reply ms | $ |', '|---|---|---|---|---|---|',
  ...ew.map((r) => `| ${r.a3 ? '**A3** ' : ''}${r.said} | everywhere | ${r.miss ? 'MISS' : r.provider} | ${r.planMs} | ${r.replyMs ?? '-'} | ${r.usd.toFixed(5)} |`),
  ...br.map((r) => `| ${r.said} | browser | ${r.miss ? 'MISS' : r.llmCalls ? `${r.llmCalls} LLM (cache)` : 'code'} | ${r.firstActionMs ?? '-'} | - | 0 |`),
  '', `raw: ${path.relative(root, file)}`,
].join('\n'));
