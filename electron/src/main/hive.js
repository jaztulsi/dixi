// Hive: hard tasks go to a few of the user's own Claude Code agents, side by side, each in its own folder
// under ~/Dixi Tasks. An agent can read, write and edit files there and search or read the web. It can't run
// commands, and it has no tool that sends, posts or buys: the tool list is fixed here, in code, not asked for
// in the prompt. Nothing waits on a person: anything that would ask for permission is refused.
// ponytail: WebFetch can still put text into a URL it fetches; drop it from TOOLS if tasks ever see private data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// Agent: each worker can launch its own Claude Code subagents (they get no more tools than these).
export const TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Agent'];
export const TASKS_DIR = path.join(os.homedir(), 'Dixi Tasks');
const RULES = 'You are helping someone through Dixi. Work only in the current folder. Never send, post, buy, book, sign up or submit anything; if the task needs that, stop and say what is left for the person to do. End with the answer in a few plain sentences.';

/** The command line for one task (the task itself goes in on stdin, never on the command line). */
export function hiveArgs({ budgetUsd = 1 } = {}) {
  return ['-p', '--output-format', 'stream-json', '--verbose', '--restricted', '--no-chrome', '--strict-mcp-config', '--no-session-persistence',
    '--tools', TOOLS.join(','), '--allowed-tools', TOOLS.join(','), '--disallowed-tools', 'Bash',
    '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--max-budget-usd', String(budgetUsd), '--append-system-prompt', RULES];
}

/** One short line for a status display, from one stream-json event (null when the event says nothing new). */
export function stepOf(ev) {
  for (const c of ev?.type === 'assistant' ? ev.message?.content ?? [] : []) {
    if (c.type === 'tool_use') {
      const what = c.input?.query ?? c.input?.url ?? c.input?.file_path ?? c.input?.pattern ?? '';
      return `${c.name}${what ? ': ' + String(what).split('/').slice(-2).join('/') : ''}`.slice(0, 80);
    }
    if (c.type === 'text' && c.text?.trim()) return c.text.trim().split('\n')[0].slice(0, 80);
  }
  return null;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';

function runOne(task, i, { bin, base, budgetUsd, signal, onUpdate }) {
  const t0 = Date.now();
  const dir = path.join(base, `${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}-${i + 1}-${slug(task)}`);
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve) => {
    let final = null, err = '', settled = false;
    const done = (ok, result, costUsd = 0) => {
      if (settled) return;   // a stopped or missing program reports both an error and a close
      settled = true;
      onUpdate({ i, task, status: ok ? 'done' : 'failed', step: String(result).split('\n')[0].slice(0, 80) });
      resolve({ task, ok, result, costUsd, ms: Date.now() - t0, dir });
    };
    // The user's own install, also when Dixi was opened from the Finder (whose PATH lacks ~/.local/bin).
    const env = { ...process.env, PATH: [path.join(os.homedir(), '.local/bin'), process.env.PATH].join(path.delimiter) };
    const child = spawn(bin, hiveArgs({ budgetUsd }), { cwd: dir, env, signal, stdio: ['pipe', 'pipe', 'pipe'] });
    onUpdate({ i, task, status: 'running', step: 'Starting' });
    child.stdin.on('error', () => {});
    child.stdin.end(task);
    child.stderr.on('data', (d) => { err = (err + d).slice(-500); });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let ev; try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'result') final = ev;
      const step = stepOf(ev);
      if (step) onUpdate({ i, task, status: 'running', step });
    });
    child.on('error', (e) => done(false, e.code === 'ENOENT' ? "Claude Code isn't installed on this computer" : signal?.aborted ? 'Stopped' : e.message));
    child.on('close', (code) => {
      if (signal?.aborted) return done(false, 'Stopped', final?.total_cost_usd);
      if (final && !final.is_error && final.subtype === 'success') return done(true, final.result ?? '', final.total_cost_usd);
      done(false, final?.result || err.trim().split('\n').pop() || `Claude Code stopped (code ${code})`, final?.total_cost_usd);
    });
  });
}

/**
 * Runs each task in its own Claude Code agent, at most maxParallel at a time. onUpdate gets
 * {i, task, status: 'queued'|'running'|'done'|'failed', step}. Aborting the signal stops every agent.
 * Resolves to one {task, ok, result, costUsd, ms, dir} per task, in the order given.
 */
export async function runHive(tasks, { onUpdate = () => {}, signal, cwd = TASKS_DIR, maxParallel = 3, bin = 'claude', budgetUsd = 1 } = {}) {
  tasks.forEach((task, i) => onUpdate({ i, task, status: 'queued', step: 'Waiting' }));
  const out = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = signal?.aborted
        ? (onUpdate({ i, task: tasks[i], status: 'failed', step: 'Stopped' }), { task: tasks[i], ok: false, result: 'Stopped', costUsd: 0, ms: 0 })
        : await runOne(tasks[i], i, { bin, base: cwd, budgetUsd, signal, onUpdate });
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxParallel, tasks.length) }, worker));
  return out;
}
