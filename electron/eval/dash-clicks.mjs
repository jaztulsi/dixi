// Clicks every dashboard control through the REAL dashboard window + IPC (main/dashboard.js), with a
// recording api in place of everywhere.js, and saves every tab → docs/ui/dashboard-*.png.
// The window is never shown: capturePage reads that window only (never your screen). Exit 1 = a dead control.
//   env -u ELECTRON_RUN_AS_NODE npx electron eval/dash-clicks.mjs
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDashboard } from '../src/main/dashboard.js';
import { ACTIONS } from '../src/main/commands.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../docs/ui');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Date.now(), min = 6e4, day = 864e5;
const s = {
  commands: [
    { id: 's1', phrase: 'Claude', action: 'app', target: 'Claude', enabled: true },
    { id: 's2', phrase: 'Weather', action: 'website', target: 'weather.com', enabled: true },
  ],
  actions: ACTIONS,
  skills: [{ id: 'k1', name: 'Pay the electric bill', app: 'Safari', steps: 6 }, { id: 'k2', name: 'Send photos to Anna', app: 'Photos', steps: 4 }],
  activity: [
    { t: now - 3 * min, kind: 'done', line: 'Opened Claude' }, { t: now - 4 * min, kind: 'run', line: '“open Claude”' },
    { t: now - day - 90 * min, kind: 'step', line: 'Typed the ZIP code' }, { t: now - 4 * day, kind: 'done', line: 'Saved the skill “Send photos to Anna”' },
  ],
  prefs: { listening: false, careful: false, large: false, contrast: false, sounds: true },
  perms: { mic: 'granted', screen: 'granted', ax: false, automation: null },
  keys: { ask: '⌥Space', mic: '⌘⌥Space', kill: '⌘⇧Esc', yes: '⌥↩' },
  builtins: [{ group: 'Your screen', examples: ['What’s on my screen?', 'Read this to me'] }],
  watching: null,
};
const calls = [];
const rec = (m, fn) => (...a) => { calls.push({ m, a }); return fn(...a); };
const copy = () => structuredClone(s);
const api = {
  state: rec('get', async () => copy()),
  saveCommands: rec('save', async (list) => { s.commands = list.map((c, i) => ({ id: c.id ?? `n${i}`, ...c })); return { ok: true, commands: copy().commands }; }),
  testCommand: rec('test', async (c) => ({ ok: true, say: `Okay, opening ${c.target}.` })),
  apps: rec('apps', async () => ['Calendar', 'Claude', 'Mail', 'Safari']),
  deleteSkill: rec('skill:delete', async (name) => { s.skills = s.skills.filter((k) => k.name !== name); return true; }),
  set: rec('set', async (k, v) => { s.prefs[k] = v; return copy(); }),
  open: rec('open', () => {}),
};

app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.dock?.hide();
setTimeout(() => { console.error('timed out'); app.exit(2); }, 60000).unref();
app.whenReady().then(async () => {
  const win = openDashboard({ here: path.join(root, 'src/main'), api });
  win.removeAllListeners('ready-to-show');   // never on screen
  const wc = win.webContents;
  await new Promise((r) => wc.once('did-finish-load', r));
  await sleep(400);
  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { await sleep(250); fs.writeFileSync(path.join(out, `dashboard-${name}.png`), (await wc.capturePage(undefined, { stayHidden: true })).toPNG()); };
  const rows = [];
  // One control: run `click` in the page, wait, and record which dash:* calls it made (or what it showed).
  const check = async (control, click, ms = 300, expect = null) => {
    const n = calls.length;
    const ok = await js(`(() => { ${click} })()`).catch((e) => `error ${e.message}`);
    await sleep(ms);
    const made = calls.slice(n).filter((c) => c.m !== 'get' || /refresh|pref/.test(control)).map((c) => `${c.m}(${c.a.map((x) => JSON.stringify(x)?.slice(0, 28)).join(', ')})`);
    const effect = made.length ? made.join(' ') : typeof ok === 'string' ? ok : '';
    rows.push({ control, effect: effect || '—', dead: !effect || (expect && !made.some((m) => m.startsWith(expect))) });
  };

  fs.mkdirSync(out, { recursive: true });
  for (const tab of ['home', 'commands', 'skills', 'activity', 'settings']) {   // ponytail: light only, the dashboard has no dark styles
    await check(`tab ${tab}`, `document.querySelector('[data-go="${tab}"]').click(); return document.getElementById('${tab}').hidden ? '' : 'shows ${tab}';`);
    await shot(tab);
  }

  for (const id of await js(`[...document.querySelectorAll('[data-pref]')].map((e, i) => (e.id || e.dataset.pref + '-home') + '#' + i)`)) {
    const i = id.split('#')[1];
    await check(`switch ${id.split('#')[0]}`, `document.querySelectorAll('[data-pref]')[${i}].click()`, 300, 'set');
  }
  const opens = await js(`[...document.querySelectorAll('[data-open]')].map((e) => e.dataset.open)`);
  for (const [i, what] of opens.entries()) await check(`open ${what}`, `document.querySelectorAll('[data-open]')[${i}].click()`, 200, 'open');
  await check('refresh', `document.getElementById('refresh').click()`, 300, 'get');
  await check('add command + type', `document.getElementById('add-cmd').click();
    const li = document.querySelector('#cmd-list li:last-child'), p = li.querySelector('.phrase'), t = li.querySelector('.target');
    p.value = 'Mail'; p.dispatchEvent(new Event('input', { bubbles: true })); t.value = 'Mail'; t.dispatchEvent(new Event('input', { bubbles: true }));`, 900, 'save');
  await check('command action menu', `const sel = document.querySelector('#cmd-list li select'); sel.value = 'website'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const t = document.querySelector('#cmd-list li .target'); t.value = 'claude.ai'; t.dispatchEvent(new Event('input', { bubbles: true }));`, 900, 'save');
  await check('command on/off', `document.querySelector('#cmd-list li .switch').click()`, 900, 'save');
  await check('try it', `[...document.querySelectorAll('#cmd-list li button')].find((b) => /Try it/.test(b.textContent)).click()`, 300, 'test');
  await check('delete command', `document.querySelector('#cmd-list li [aria-label="Delete this command"]').click()`, 900, 'save');
  await check('delete skill (8 s undo)', `document.querySelector('[data-k^="del-skill:"]').click()`, 8400, 'skill:delete');

  const w = Math.max(...rows.map((r) => r.control.length));
  for (const r of rows) console.log(`${r.dead ? '✗' : '✓'} ${r.control.padEnd(w)}  ${r.effect}`);
  const dead = rows.filter((r) => r.dead).length;
  console.log(`${rows.length - dead}/${rows.length} controls work; shots → docs/ui/dashboard-*.png`);
  app.exit(dead ? 1 : 0);
});
