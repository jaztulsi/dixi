// Typed held-out eval for the agent (M0): real Haiku through the SDK, Dixi's tools stubbed (nothing on the Mac is clicked, opened or sent).
// node eval/agent/run.mjs [filter]   → pass count, p50/p95, cost. Stops at $1.50.
import { createAgent, bashRefusal } from '../../src/main/agent.js';
import { loadConfig } from '../../src/main/config.js';
import { CASES } from './cases.mjs';

const CAP_USD = 1.5;
const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const cfg = loadConfig();
if (!cfg.keys.anthropic) { console.error('no Anthropic key'); process.exit(1); }

let calls = [];
let screen = '';
const ok = (out) => async (a) => { calls.push(a); return { ok: true, out: typeof out === 'function' ? out(a) : out }; };
const impl = {
  open: ok((a) => `Front: ${a.url ? 'Safari (com.apple.Safari) · URL ' + a.url : a.app}`),
  mac: ok((a) => `Done: ${a.command}`),
  applescript: ok((a) => (/calendar/i.test(a.code) ? 'Dentist, tomorrow 10:00 AM\nTeam sync, tomorrow 2:00 PM' : /\bsend\b/i.test(a.code) ? 'The message is ready; sending is held for the user to tap Send.' : 'ok')),
  files: ok('Found ~/Documents/Resume 2026.pdf and opened it.'),
  key: ok((a) => `Pressed ${a.combo}`),
  type_text: ok('Typed.'),
  read_screen: ok(() => screen || 'Empty window.'),
  browser: ok('Done. The results are showing in Dixi\'s browser.'),
  screen: ok('Done.'),
};
// tag each impl call with its tool name
for (const k of Object.keys(impl)) { const f = impl[k]; impl[k] = (a, s) => f({ tool: k, ...a }, s); }
// Bash runs for real, so the eval only lets read-only commands through.
const MUTATE = /(^|[|;&]\s*)(mv|mkdir|cp|zip|pbcopy|say|open|shortcuts)\b/;
const agent = createAgent({
  apiKey: cfg.keys.anthropic, workspace: cfg.env.ANTHROPIC_WORKSPACE_ID, impl,
  onTool: (name, input) => { if (!name.startsWith('mcp__') && !impl[name]) calls.push({ tool: name, ...input }); },
  bashCheck: (c) => bashRefusal(c) ?? (MUTATE.test(c.trim()) ? 'Dry run: this command was recorded, not run. Treat it as done.' : null),
});

agent.warm();
await new Promise((r) => setTimeout(r, 7000));   // the cold start, as at app launch

const rows = [];
let spent = 0;
for (const c of CASES) {
  if (only && !only.test(c.say)) continue;
  if (spent > CAP_USD) { console.log('spend cap reached'); break; }
  calls = []; screen = c.screen ?? '';
  const r = await agent.run(c.say, c.ctx ?? { name: 'Finder', bundle: 'com.apple.finder' });
  spent += r.cost;
  let pass = false;
  try { pass = Boolean(c.check(calls, r.text)); } catch {}
  rows.push({ say: c.say, pass, ms: r.ms, cost: r.cost, one: c.one, model: r.model });
  const brief = calls.map((x) => `${x.tool}:${JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'tool'))).slice(0, 90)}`).join(' | ');
  console.log(`${pass ? 'PASS' : 'FAIL'} ${String(r.ms).padStart(6)}ms $${r.cost.toFixed(4)} ${r.model === 'claude-sonnet-5-5' ? 'S' : 'H'} "${c.say}" → ${brief || '(no tool)'} → "${r.text.slice(0, 100)}"`);
}
agent.close();

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const one = rows.filter((r) => r.one).map((r) => r.ms);
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} passed · p50 ${pct(rows.map((r) => r.ms), 0.5)}ms p95 ${pct(rows.map((r) => r.ms), 0.95)}ms · one-action p50 ${pct(one, 0.5)}ms · $${spent.toFixed(4)}`);
process.exit(0);
