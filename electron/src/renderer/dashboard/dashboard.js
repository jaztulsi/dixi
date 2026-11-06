// Dixi's dashboard: the settings and control window. Everything comes from main through the preload
// (window.dash); opened in a plain browser it runs on a built-in sample, so the design can be looked at.
// Phrases, activity lines and skill names are untrusted: they only ever go in through textContent.
// innerHTML is used for our own static SVG icons and nothing else.

import { mountMascot } from '../ui/mascot.js';
import { icons } from '../ui/icons.js';
import { granted, permWord, norm, dupes, keepers, clean, complete, timeLabel, byDay, statusText } from './dashboard-lib.js';

const $ = (id) => document.getElementById(id);
const svg = (body) => `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  ...icons,
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'),
  commands: icons.waveform,
  skills: svg('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.5"/><path d="M20 3.5v5h-5"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z"/>'),
  tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  run: svg('<path d="M8 5l11 7-11 7Z"/>'),
  ask: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>'),
};
const KIND = { run: ['run', 'Started'], step: ['dot', 'Step'], ask: ['ask', 'Asked you'], guardian: ['shield', 'Safety check'], done: ['tick', 'Done'] };

/** A DOM element. `text` → textContent; `icon` → one of our own static SVGs; on* → listeners. */
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'icon') e.innerHTML = ICON[v] ?? '';
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'value' || k === 'disabled') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((x) => x != null && x !== false));
  return e;
}
for (const e of document.querySelectorAll('[data-icon]')) e.innerHTML = ICON[e.dataset.icon] ?? '';

// ---- the sample, for a look in a plain browser ----
const SAMPLE_ACTIONS = [
  { id: 'app', label: 'Open an app', placeholder: 'Claude', hint: 'The app’s name, the way it shows in your Applications folder.' },
  { id: 'website', label: 'Open a website', placeholder: 'youtube.com', hint: 'A web address. Dixi opens it in your browser.' },
  { id: 'file', label: 'Open a file or folder', placeholder: 'Documents/Taxes', hint: 'A file or folder in your home folder.' },
  { id: 'skill', label: 'Run a skill', placeholder: '', hint: 'One of the skills you saved.' },
  { id: 'say', label: 'Say something', placeholder: 'Time for your walk!', hint: 'Dixi says these words out loud.' },
  { id: 'task', label: 'Do a task', placeholder: 'Check my email and tell me what’s new', hint: 'Say it the way you’d ask Dixi.' },
];
function sampleDash() {
  const now = Date.now(), min = 6e4, day = 864e5;
  const s = {
    commands: [
      { id: 's1', phrase: 'Claude', action: 'app', target: 'Claude', enabled: true },
      { id: 's2', phrase: 'Weather', action: 'website', target: 'weather.com', enabled: true },
      { id: 's3', phrase: 'Bills', action: 'skill', target: 'Pay the electric bill', enabled: false },
    ],
    actions: SAMPLE_ACTIONS,
    skills: [{ id: 'k1', name: 'Pay the electric bill', app: 'Safari', steps: 6 }, { id: 'k2', name: 'Send photos to Anna', app: 'Photos', steps: 4 }],
    activity: [
      { t: now - 3 * min, kind: 'done', line: 'Opened Claude' },
      { t: now - 4 * min, kind: 'run', line: '“Dixi, Claude”' },
      { t: now - 40 * min, kind: 'guardian', line: 'Warned about a look-alike web address' },
      { t: now - 42 * min, kind: 'ask', line: 'Click “Pay now”?' },
      { t: now - day - 90 * min, kind: 'step', line: 'Typed the ZIP code' },
      { t: now - day - 95 * min, kind: 'run', line: 'Fill in the shipping form' },
      { t: now - 4 * day, kind: 'done', line: 'Saved the skill “Send photos to Anna”' },
    ],
    prefs: { listening: true, careful: false, large: false, contrast: false, sounds: true },
    perms: { mic: 'granted', screen: 'granted', ax: false, automation: null },
    keys: { ask: '⌥Space', mic: '⌘⌥Space', kill: '⌘⇧Escape', yes: '⌥Return' },
    builtins: [
      { group: 'Your screen', examples: ['What’s on my screen?', 'Read this to me', 'Is this email a scam?'] },
      { group: 'Your day', examples: ['What’s on my calendar?', 'Any new email?'] },
      { group: 'Help', examples: ['Take dictation', 'Watch for when the download finishes', 'Be careful'] },
    ],
    watching: null,
  };
  const copy = () => structuredClone(s);
  return {
    get: async () => copy(),
    saveCommands: async (list) => { s.commands = list.map((c, i) => ({ id: c.id ?? `n${Date.now()}${i}`, ...c })); return { ok: true, commands: copy().commands }; },
    testCommand: async (c) => ({ ok: true, say: c.action === 'say' ? c.target : `Okay, opening ${c.target}.` }),
    apps: async () => ['Calendar', 'Claude', 'FaceTime', 'Mail', 'Messages', 'Notes', 'Photos', 'Safari'],
    deleteSkill: async (name) => { s.skills = s.skills.filter((k) => k.name !== name); return true; },
    set: async (k, v) => { s.prefs[k] = v; return copy(); },
    open: (what) => console.info('dash.open', what),
    onChange: () => {},
  };
}
const dash = window.dash ?? sampleDash();

// ---- state ----
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v));
function normalize(s) {
  s ??= {};
  return { ...s, commands: arr(s.commands), actions: arr(s.actions).length ? s.actions : SAMPLE_ACTIONS, skills: arr(s.skills),
    activity: arr(s.activity), builtins: arr(s.builtins), prefs: s.prefs ?? {}, perms: s.perms ?? {}, keys: s.keys ?? {}, watching: s.watching ?? null };
}
let state = normalize(null);
let cmds = [];          // the command rows on screen; typing edits these objects, and the save sends them
let drawn = false;
const prefOn = (k) => (k === 'sounds' ? state.prefs.sounds !== false : Boolean(state.prefs[k]));

const mascot = mountMascot($('mascot'), { base: '../assets/' });
mascot.init();
mountMascot($('toast-mascot'), { eyes: false, base: '../assets/' }).init();

const moreContrast = matchMedia('(prefers-contrast: more)');
function applyLook() {
  document.documentElement.classList.toggle('large', Boolean(state.prefs.large));
  document.documentElement.classList.toggle('contrast', Boolean(state.prefs.contrast) || moreContrast.matches);
}
moreContrast.addEventListener('change', applyLook);

function render(s) {
  const k = document.activeElement?.dataset?.k;   // a re-render keeps the keyboard where it was
  state = normalize(s);
  applyLook();
  renderStatus();
  renderHome();
  for (const el of document.querySelectorAll('[data-pref]')) el.checked = prefOn(el.dataset.pref);
  $('mic-key-desc').textContent = state.keys.mic ? `Experimental. Off, the mic opens only for ${state.keys.ask || '⌥Space'}. ${state.keys.mic} turns it on and off too.` : '';
  renderSkills();
  renderActivity();
  // Never redraw the commands under someone's hands: only when nothing is waiting to be saved.
  if (!drawn || (!dirty && !saveTimer && !inFlight && !$('cmd-list').querySelector('.undo-strip') && !$('cmd-list').contains(document.activeElement))) {
    drawn = true;
    cmds = state.commands.map((c) => ({ ...c, phrase: str(c.phrase), action: str(c.action) || 'app', target: str(c.target), enabled: c.enabled !== false }));
    renderCommands();
  }
  if (k && document.activeElement === document.body) {
    (document.querySelector(`[data-k="${CSS.escape(k)}"]`) ?? document.querySelector('section:not([hidden]) h1'))?.focus();
  }
}

async function refresh() {
  try { const s = await dash.get(); if (s) render(s); }
  catch { toast('Dixi couldn’t load your settings. Close this window and open it again.'); }
}

// ---- sidebar ----
function renderStatus() {
  const text = statusText(state);
  $('status-text').textContent = text;
  $('status').title = text;
  $('status').classList.toggle('live', Boolean(state.prefs.listening) && !state.watching);
  $('status').classList.toggle('watching', Boolean(state.watching));
  mascot.setPose(state.prefs.listening ? 'face' : 'sleep');
}

const SECTIONS = ['home', 'commands', 'skills', 'activity', 'settings'];
const navButtons = [...document.querySelectorAll('[data-go]')];
function show(name) {
  if (!SECTIONS.includes(name)) name = 'home';
  for (const s of SECTIONS) $(s).hidden = s !== name;
  for (const b of navButtons) if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  document.querySelector('.scroll').scrollTop = 0;
  if (name === 'commands') loadApps();
}
for (const b of navButtons) b.addEventListener('click', () => show(b.dataset.go));
$('nav').addEventListener('keydown', (e) => {   // arrow keys move along the list
  const i = navButtons.indexOf(document.activeElement);
  const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? navButtons.length - 1 : null;
  if (i < 0 || j == null) return;
  e.preventDefault();
  navButtons[(j + navButtons.length) % navButtons.length].focus();
});
addEventListener('keydown', (e) => {
  if (e.metaKey && !e.altKey && !e.ctrlKey && e.key >= '1' && e.key <= String(SECTIONS.length)) { e.preventDefault(); show(SECTIONS[e.key - 1]); }
  if (e.key === 'Escape') hideToast();
});
addEventListener('hashchange', () => show(location.hash.slice(1)));

// One handler for every switch tied to a setting (Home and Settings both have listening and careful mode).
document.addEventListener('change', async (e) => {
  const key = e.target.dataset?.pref;
  if (!key) return;
  const want = e.target.checked;
  try {
    const s = await dash.set(key, want);
    if (s) render(s); else refresh();
  } catch {
    e.target.checked = !want;
    toast('Dixi couldn’t change that setting. Try again.');
  }
});
document.addEventListener('click', (e) => {
  const what = e.target.closest?.('[data-open]')?.dataset.open;
  if (what) dash.open(what);
});

// ---- home ----
const PERMS = [
  { id: 'mic', name: 'Microphone', why: 'To hear you when you ask.' },
  { id: 'screen', name: 'Screen Recording', why: 'To see your screen, only when you ask.' },
  { id: 'ax', name: 'Accessibility', why: 'To click and type for you.' },
  { id: 'automation', name: 'Calendar & Mail', why: 'To tell you about your day. Optional.' },
];
function renderHome() {
  const on = Boolean(state.prefs.listening), keys = state.keys;
  $('listen-card').classList.toggle('on', on);
  $('listen-title').textContent = on ? 'Dixi is listening' : `Press ${keys.ask || '⌥Space'} and talk`;
  $('listen-sub').textContent = on ? `Say “Dixi”, then what you need. ${keys.ask || '⌥Space'} works too.` : 'The mic opens only while you ask. Switch on to also listen for “Dixi” (experimental).';
  $('keys').replaceChildren(...[
    [keys.ask, 'Talk to Dixi'], [keys.mic, 'Listen for “Dixi” on or off'], [keys.kill, 'Stop everything'], [keys.yes, 'Say yes when Dixi asks'],
  ].filter(([k]) => k).map(([k, what]) => h('div', {}, h('dt', {}, h('kbd', { text: k })), h('dd', { text: what }))));
  $('keys').hidden = !$('keys').children.length;

  $('try').replaceChildren(...state.builtins.map((g) => h('div', { class: 'try-group' },
    h('h3', { text: str(g?.group) }),
    h('ul', { class: 'chips' }, ...arr(g?.examples).map((x) => h('li', { class: 'chip glass', text: `“${str(x)}”` }))))));
  $('try-wrap').hidden = !state.builtins.length;

  $('perms').replaceChildren(...PERMS.map((p) => {
    const v = state.perms[p.id], ok = granted(v);
    return h('li', {},
      h('span', { class: `perm-dot${ok ? ' on' : ''}`, 'aria-hidden': 'true' }),
      h('div', { class: 'perm-text' }, h('b', { text: p.name }), h('span', { text: p.why })),
      h('span', { class: `perm-word${ok ? ' on' : ''}`, text: permWord(v) }),
      !ok && h('button', { class: 'btn small primary', 'data-open': `pane:${p.id}`, 'data-k': `fix:${p.id}`, 'aria-label': `Fix ${p.name}`, text: 'Fix' }));
  }));
}

// ---- commands ----
const actionOf = (id) => state.actions.find((a) => a.id === id) ?? state.actions[0];
const SUGGEST = [
  { phrase: 'Claude', action: 'app', target: 'Claude', says: 'opens the Claude app' },
  { phrase: 'YouTube', action: 'website', target: 'youtube.com', says: 'opens youtube.com' },
  { phrase: 'Mail', action: 'app', target: 'Mail', says: 'opens Mail' },
  { phrase: 'Weather', action: 'website', target: 'weather.com', says: 'opens weather.com' },
];
let appsLoad = null;
function loadApps() {
  appsLoad ??= Promise.resolve().then(() => dash.apps())
    .then((names) => $('apps').replaceChildren(...arr(names).map((n) => h('option', { value: str(n) }))))
    .catch(() => { appsLoad = null; });
}

let uid = 0;
function cmdRow(cmd) {
  const id = `c${++uid}`, act = actionOf(cmd.action);
  const li = h('li', { class: `cmd${cmd.enabled ? '' : ' off'}` });
  li._cmd = cmd;

  const phrase = h('input', { id: `${id}-p`, class: 'field phrase', value: cmd.phrase, placeholder: 'Words you’ll say', autocomplete: 'off',
    spellcheck: 'false', maxlength: '80', 'aria-describedby': `${id}-flag`, 'data-k': `p:${cmd.id ?? id}` });
  phrase.addEventListener('input', () => { cmd.phrase = phrase.value; edited(); });

  const select = h('select', { id: `${id}-a`, class: 'field', 'data-k': `a:${cmd.id ?? id}` },
    ...state.actions.map((a) => h('option', { value: a.id, text: a.label })));
  select.value = act?.id ?? '';
  select.addEventListener('change', () => {
    cmd.action = select.value;
    const names = state.skills.map((k) => k.name);
    if (cmd.action === 'skill' && !names.includes(cmd.target)) cmd.target = names[0] ?? '';
    const row = cmdRow(cmd);   // the box beside it changes (a list of skills, an app picker…)
    li.replaceWith(row);
    row.querySelector('select').focus();
    edited();
  });

  let target;
  if (act?.id === 'skill') {
    const names = state.skills.map((k) => k.name);
    target = h('select', { class: 'field target', 'aria-label': 'Which skill', 'aria-describedby': `${id}-hint` },
      !names.length && h('option', { value: '', text: 'No skills saved yet' }),
      cmd.target && !names.includes(cmd.target) && h('option', { value: cmd.target, text: `${cmd.target} (not found)` }),
      ...names.map((n) => h('option', { value: n, text: n })));
    target.value = cmd.target;
    target.addEventListener('change', () => { cmd.target = target.value; edited(); });
  } else {
    target = h('input', { class: 'field target', value: cmd.target, placeholder: act?.placeholder ?? '', autocomplete: 'off', spellcheck: 'false',
      list: act?.id === 'app' ? 'apps' : null, inputmode: act?.id === 'website' ? 'url' : null,
      'aria-label': act?.label ? `${act.label}: which one` : 'Details', 'aria-describedby': `${id}-hint`, 'data-k': `t:${cmd.id ?? id}` });
    target.addEventListener('input', () => { cmd.target = target.value; edited(); });
    if (act?.id === 'app') loadApps();
  }

  const onWord = h('span', { 'aria-hidden': 'true', text: cmd.enabled ? 'On' : 'Off' });
  const enabled = h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: cmd.enabled, 'aria-label': 'Command on' });
  enabled.addEventListener('change', () => {
    cmd.enabled = enabled.checked;
    onWord.textContent = cmd.enabled ? 'On' : 'Off';
    li.classList.toggle('off', !cmd.enabled);
    edited();
  });

  li.append(
    h('label', { for: `${id}-p`, text: 'When I say' }), phrase,
    h('label', { for: `${id}-a`, text: 'Dixi will' }), h('div', { class: 'cmd-do' }, select, target),
    h('div', { class: 'cmd-foot' },
      h('div', { class: 'cmd-notes' },
        h('p', { class: 'cmd-hint', id: `${id}-hint`, text: act?.hint ?? '' }),
        h('p', { class: 'cmd-flag', id: `${id}-flag` }, h('span', { icon: 'warning', class: 'flag-icon' }), h('span', { class: 'flag-text' }))),
      h('label', { class: 'switch-hit' }, enabled, onWord),
      h('button', { class: 'btn small', icon: 'run', onclick: () => tryCmd(cmd) }, 'Try it'),
      h('button', { class: 'btn small quiet', icon: 'trash', 'aria-label': 'Delete this command', onclick: () => removeCmd(cmd, li) }, 'Delete')));
  return li;
}

function renderCommands() {
  $('cmd-list').replaceChildren(...cmds.map(cmdRow));
  $('suggest').replaceChildren(...SUGGEST.filter((s) => state.actions.some((a) => a.id === s.action)).map((s) =>
    h('button', { class: 'chip-btn', 'aria-label': `Add “${s.phrase}”, ${s.says}`, onclick: () => addCmd(s) },
      h('b', { text: s.phrase }), h('span', { 'aria-hidden': 'true', text: `→ ${s.says}` }))));
  syncCommands();
}
const syncOrder = () => { cmds = [...$('cmd-list').children].flatMap((li) => (li._cmd ? [li._cmd] : [])); };

// The notes under each row: a repeated phrase, or a row that isn't filled in yet (so isn't saved).
function syncCommands() {
  $('cmd-empty').hidden = cmds.length > 0 || Boolean($('cmd-list').querySelector('.undo-strip'));
  const d = dupes(cmds);
  for (const li of $('cmd-list').children) {
    const cmd = li._cmd;
    if (!cmd) continue;
    const dup = d[cmds.indexOf(cmd)];
    const half = !complete(cmd) && (norm(cmd.phrase) || cmd.target.trim());
    const msg = dup ? `Another command uses “${cmd.phrase.trim()}” too. Change one of them: this one isn’t saved until you do.`
      : half ? (norm(cmd.phrase) ? 'Not saved yet: fill in what Dixi will do.' : 'Not saved yet: fill in the words you’ll say.') : '';
    li.querySelector('.flag-text').textContent = msg;
    li.querySelector('.cmd-flag').classList.toggle('show', Boolean(msg));
    li.querySelector('.cmd-flag').classList.toggle('warn', dup);
    li.querySelector('.phrase').setAttribute('aria-invalid', String(dup));
  }
}

function addCmd(from) {
  const cmd = { phrase: from?.phrase ?? '', action: from?.action ?? state.actions[0]?.id ?? 'app', target: from?.target ?? '', enabled: true };
  const row = cmdRow(cmd);
  $('cmd-list').append(row);
  syncOrder();
  row.querySelector('.phrase').focus();
  if (from) edited(); else syncCommands();
}
$('add-cmd').addEventListener('click', () => addCmd());

// Delete at once, with an Undo in its place for a few seconds. No dialogs.
function removeCmd(cmd, li) {
  const name = cmd.phrase.trim();
  const undo = h('button', { class: 'btn small', text: 'Undo' });
  const strip = h('li', { class: 'undo-strip' }, h('span', { text: name ? `Deleted “${name}”.` : 'Deleted.' }), undo);
  li.replaceWith(strip);
  syncOrder();
  undo.focus();
  const timer = setTimeout(() => {
    const had = strip.contains(document.activeElement);
    strip.remove();
    syncCommands();
    if (had) $('add-cmd').focus();
  }, 8000);
  undo.addEventListener('click', () => {
    clearTimeout(timer);
    const row = cmdRow(cmd);
    strip.replaceWith(row);
    syncOrder();
    row.querySelector('.phrase').focus();
    edited();
  });
  edited();
}

let trying = false;
async function tryCmd(cmd) {
  if (!complete(cmd)) return toast('Fill in both boxes first, then try it.');
  if (trying) return;
  trying = true;
  try {
    const r = await dash.testCommand(clean(cmd));
    toast(str(r?.say) || (r?.ok ? 'That works.' : 'That didn’t work. Check the words in the second box.'));
  } catch { toast('Dixi couldn’t try that just now.'); }
  trying = false;
}

// Saving: ~600 ms after the last edit, one save at a time, and right away when the window loses focus or closes.
let saveTimer = 0, dirty = false, inFlight = false, saving = Promise.resolve();
function edited() {
  dirty = true;
  syncCommands();
  setSave('');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 600);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  return (saving = saving.then(saveNow));
}
async function saveNow() {
  if (!dirty) return;
  dirty = false;
  const rows = keepers(cmds);
  let r;
  inFlight = true;
  try { r = await dash.saveCommands(rows.map(clean)); } catch { r = null; }
  inFlight = false;
  if (!r?.ok) {
    dirty = true;   // kept, and sent again with the next edit, on Try again, or when the window loses focus
    setSave(str(r?.error) || 'Dixi couldn’t save your commands.', true);
    return;
  }
  const back = arr(r.commands);
  for (const c of rows) if (!c.id) c.id = back.find((b) => norm(b.phrase) === norm(c.phrase))?.id;
  state.commands = back;
  if (!dirty && !saveTimer) setSave('Saved', false, true);
}
function setSave(text, err = false, ok = false) {
  $('save-status').textContent = text;
  $('save-status').className = `save-status${err ? ' err' : ''}${ok ? ' ok' : ''}`;
  $('save-retry').hidden = !err;
}
$('save-retry').addEventListener('click', () => { dirty = true; flush(); });

// ---- skills ----
const pendingDelete = new Map();   // name → timer: deleted for real after the Undo goes away
function renderSkills() {
  $('skill-list').replaceChildren(...state.skills.map((k) => {
    const name = str(k.name), steps = Number(k.steps) || 0;
    if (pendingDelete.has(name)) {
      return h('li', { class: 'undo-strip skill-undo' }, h('span', { text: `Deleted “${name}”.` }),
        h('button', { class: 'btn small', 'data-k': `undo-skill:${name}`, onclick: () => undoDelete(name), text: 'Undo' }));
    }
    return h('li', { class: 'skill' },
      h('span', { class: 'skill-icon', icon: 'skills' }),
      h('h3', { text: name }),
      h('p', { class: 'skill-meta', text: [k.app && str(k.app), `${steps} ${steps === 1 ? 'step' : 'steps'}`].filter(Boolean).join(', ') }),
      h('p', { class: 'skill-say', text: `Press ⌥Space and say “run my ${name} skill”.` }),
      h('button', { class: 'btn small quiet', icon: 'trash', 'data-k': `del-skill:${name}`, 'aria-label': `Delete ${name}`, onclick: () => deleteSkill(name) }, 'Delete'));
  }));
  $('skill-empty').hidden = state.skills.length > 0;
}
const focusK = (k) => document.querySelector(`[data-k="${CSS.escape(k)}"]`)?.focus();
function deleteSkill(name) {
  pendingDelete.set(name, setTimeout(() => commitDelete(name), 8000));
  renderSkills();
  focusK(`undo-skill:${name}`);
}
function undoDelete(name) {
  clearTimeout(pendingDelete.get(name));
  pendingDelete.delete(name);
  renderSkills();
  focusK(`del-skill:${name}`);
}
async function commitDelete(name) {
  clearTimeout(pendingDelete.get(name));
  pendingDelete.delete(name);
  let ok = false;
  try { ok = await dash.deleteSkill(name); } catch {}
  if (!ok) toast(`Dixi couldn’t delete “${name}”.`);
  refresh();
}

// ---- activity ----
function renderActivity() {
  const groups = byDay(state.activity);
  $('timeline').replaceChildren(...groups.map((g) => h('div', { class: 'day' },
    h('h2', { class: 'day-h', text: g.label }),
    h('ol', { class: 'events' }, ...g.items.map((it) => {
      const [icon, word] = KIND[it.kind] ?? KIND.step;
      return h('li', { class: `ev ${KIND[it.kind] ? it.kind : 'step'}` },
        h('span', { class: 'ev-icon', icon }),
        h('time', { datetime: new Date(it.t).toISOString(), text: timeLabel(it.t) }),
        h('p', {}, h('span', { class: 'sr', text: `${word}: ` }), str(it.line)));
    })))));
  $('activity-empty').hidden = groups.length > 0;
}
$('refresh').addEventListener('click', async () => {
  $('timeline').setAttribute('aria-busy', 'true');
  await refresh();
  $('timeline').removeAttribute('aria-busy');
});

// ---- the toast: Dixi's black island, for what a "Try it" would say and for problems ----
let toastTimer = 0;
function toast(text) {
  $('toast-text').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, Math.max(4500, text.length * 75));
}
function hideToast() { $('toast').classList.remove('show'); }

// ---- start ----
show(location.hash.slice(1));
await refresh();
if (typeof dash.onChange === 'function') dash.onChange((s) => s && render(s));
addEventListener('focus', refresh);
addEventListener('blur', () => { if (saveTimer) flush(); });
addEventListener('pagehide', () => {
  if (saveTimer || dirty) flush();
  for (const name of [...pendingDelete.keys()]) commitDelete(name);
});
