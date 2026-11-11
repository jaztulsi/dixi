// npm run smoke — the one paid check, run on your Mac. No speech: commands are typed into the real Dixi.
// 13 safe commands: 10 are done by rules (free), 3 need the fast planner (Cerebras, then Groq; about $0.0003 each).
// Anthropic, ElevenLabs and Deepgram are blanked for the run, so the agent, Haiku and cloud speech can't be called.
// Each provider is capped at what you've already spent + $0.01 (the ledger is cumulative).
// Nothing is sent, bought or deleted. Quit Dixi first (one instance at a time).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COMMANDS = [
  // rules: $0
  'open Notes', 'switch to Safari', 'search lo-fi beats on Apple Music', 'buy a bagel from Safeway',
  'search for the best ramen near me on Google maps', 'volume 30', 'set a timer for 1 minute', 'what time is it in Tokyo',
  'open Notes and start a new note', 'open the bluetooth settings',
  // the fast planner: ~$0.0003 each
  'how much free disk space do I have', 'what version of macOS am I running', "what's my computer's name",
];
const ledger = path.join(os.homedir(), 'Library/Application Support/Dixi/spend.json');
const spent = () => { try { return JSON.parse(fs.readFileSync(ledger, 'utf8')); } catch { return { totalUSD: 0, byProvider: {} }; } };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const before = spent();
  const cap = (p) => ((before.byProvider?.[p] ?? 0) + 0.01).toFixed(4);
  const list = path.join(os.tmpdir(), `dixi-smoke-${process.pid}.json`);
  fs.writeFileSync(list, JSON.stringify(COMMANDS));
  const env = { ...process.env, DIXI_SMOKE_FILE: list, DIXI_WELCOME: '0', DIXI_VOICE_PATH: 'cloud',
    ANTHROPIC_API_KEY: ' ', ELEVENLABS_API_KEY: ' ', DEEPGRAM_API_KEY: ' ', OPENAI_API_KEY: ' ',
    DIXI_CAP_CEREBRAS: cap('cerebras'), DIXI_CAP_GROQ: cap('groq') };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log(`Dixi smoke: ${COMMANDS.length} commands, cap +$0.01 per provider. Anthropic/ElevenLabs/Deepgram off.\n`);
  const child = spawn(path.join(root, 'node_modules/.bin/electron'), ['.'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] });
  const rows = [];
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d; const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      if (!l.startsWith('SMOKE ')) continue;
      const r = JSON.parse(l.slice(6)); rows.push(r);
      const ok = r.state === 'done';
      console.log(`${ok ? '✓' : '✗'} ${r.said.padEnd(52)} ${String(r.route ?? '-').padEnd(10)} ${String(r.ms).padStart(6)} ms  ${r.err ?? r.text}`);
    }
  });
  const killer = setTimeout(() => { console.log('\n✗ stopped after 3 minutes'); child.kill(); }, 180000);
  child.on('exit', () => {
    clearTimeout(killer);
    try { fs.unlinkSync(list); } catch {}
    const after = spent();
    const usd = (after.totalUSD ?? 0) - (before.totalUSD ?? 0);
    const ok = rows.filter((r) => r.state === 'done');
    const ms = (route) => rows.filter((r) => r.route === route).map((r) => r.ms).sort((a, b) => a - b);
    const p50 = (a) => (a.length ? a[Math.floor((a.length - 1) / 2)] : '-');
    console.log(`\n${ok.length}/${COMMANDS.length} done · rules p50 ${p50(ms('rule'))} ms · fast planner p50 ${p50(ms('fast'))} ms · spent $${usd.toFixed(5)}`);
    process.exit(ok.length === COMMANDS.length ? 0 : 1);
  });
}
