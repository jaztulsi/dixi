// Live check of the planner (A1): real Haiku calls, at most 10, each reply saved as a fixture so the unit tests
// replay it for $0. Run: node test/live/plan-live.mjs   (needs the Anthropic key in .env; nothing is printed of it)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/main/config.js';
import { ENDPOINTS } from '../../src/main/providers.js';
import { plan } from '../../src/main/plan.js';
import { installedApps } from '../../src/main/mac.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../fixtures/plan-live.json');
const old = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')).fixtures : {};
const config = loadConfig();
const apps = await installedApps();

const SAID = [
  'Open Apple Music, search lo-fi beats, and play it',
  "Go to my school calendar, add my test on Friday, then text my mom I'll be late",
  'Turn the volume down, open my notes, and start a new note',
  'search lo-fi beats on Apple Music',
  'buy a bagel from Safeway',
  'remind me to call the dentist tomorrow at 9',
  'open Safari and go to the New York Times website',
  'make a new folder on my desktop called homework',
  "what's on my calendar tomorrow, then text Sam I'm running late",
  'turn on dark mode, open Messages and start a new message to Alex',
  'Find the PDF I downloaded yesterday, rename it to taxes, and move it to my Documents folder',
];

let calls = 0;
const fixtures = {};
const model = async (body) => {
  if (++calls > 10) throw new Error('live budget: 10 calls');
  const t0 = performance.now();
  const res = await fetch(ENDPOINTS.anthropic.url, { method: 'POST',
    headers: { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(j.error?.message ?? `status ${res.status}`);
  model.last = { ms, usage: j.usage, text: j.content?.find((x) => x.type === 'text')?.text, stop: j.stop_reason };
  return j;
};

for (const said of SAID) {
  model.last = null;
  const r = await plan(said, { app: 'Finder' }, { apps, home: os.homedir(), model });
  if (model.last) fixtures[said] = { text: model.last.text, stop: model.last.stop, ms: model.last.ms, usage: model.last.usage };
  console.log(`${r.source.padEnd(5)} ${String(r.ms).padStart(5)} ms  ${model.last ? `call ${model.last.ms} ms, in ${model.last.usage.input_tokens} out ${model.last.usage.output_tokens}` : 'no AI'}  ${said}`);
  for (const s of r.steps) console.log(`        ${s.do.padEnd(8)} ${s.kind ?? s.app ?? s.url ?? ''}  “${s.clause}”${s.why ? `  (${s.why})` : ''}${s.code ? `\n                 ${s.code.replace(/\n/g, ' ⏎ ').slice(0, 160)}` : ''}`);
  if (r.why) console.log(`        fell back: ${r.why}`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ apps: apps.slice(0, 400), fixtures: { ...old, ...fixtures } }, null, 2));
const ms = Object.values(fixtures).map((f) => f.ms).sort((a, b) => a - b);
if (ms.length) console.log(`planner call ms: p50 ${ms[Math.floor((ms.length - 1) / 2)]}, p90 ${ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.9) - 1)]}, max ${ms.at(-1)}`);
console.log(`\n${calls} model calls; fixtures in ${out}`);
