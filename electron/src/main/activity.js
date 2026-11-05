// What did you do? An append-only log of everything Dixi did on this Mac (<userData>/activity.jsonl,
// mode 0600, one JSON line per event, rotated at ~2 MB to activity.1.jsonl) and spoken answers built in
// code, no AI. Never logged: what was typed (only "typed 42 characters into a text box in Mail"), and
// nothing at all for password, card or code boxes. Questions come from the approval card, so a careful-mode
// "Type “…”?" is replaced with a generic line. Wording of steps follows skills.js stepLabel's plain style.
import nodeFs from 'node:fs';
import path from 'node:path';
import { secretBox } from './skills.js';

import { ACTIVITY } from '../renderer/core/everywhere-words.js';
export { ACTIVITY };

const MB2 = 2 * 1024 * 1024, DAY = 86400000;
const CARD = /(?:\d[ -]?){12,18}\d/, CODE = /^\s*\d{6,8}\s*$/;   // ponytail: same look-alikes as skills.js
const plain = (s, n) => String(s ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const word = (s) => plain(s, 60).replace(/^AX/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const role = (r) => (/^AX(TextField|TextArea|SearchField|ComboBox)$/.test(r) ? 'text box' : word(r) || 'control');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** One computer-use call (and the element it touched) → a step event, or null if nothing to log. */
export function stepEvent(c, ctx = {}, el = null) {
  const n = c.name, i = c.input ?? {};
  const base = { kind: 'step', app: plain(ctx.name, 40), ...(hostOf(ctx.url) ? { host: hostOf(ctx.url) } : {}) };
  if (n === 'type') {
    const text = String(i.text ?? '');
    if (secretBox(el) || CARD.test(text) || CODE.test(text)) return null;   // nothing at all for secret boxes
    return { ...base, verb: 'typed', role: 'text box', chars: text.length };
  }
  const verb = { left_click: 'clicked', right_click: 'right-clicked', middle_click: 'clicked', double_click: 'double-clicked', triple_click: 'clicked', left_click_drag: 'dragged', scroll: 'scrolled', press: 'pressed', key: 'pressed a key', hold_key: 'pressed a key' }[n];
  if (!verb) return null;   // looking, waiting and moving change nothing
  const label = (el?.labels ?? []).find((l) => l && l !== el.value);
  return { ...base, verb, ...(el ? { role: role(el.role) } : {}), ...(label && n !== 'key' ? { label: plain(label, 60) } : {}) };
}

const FIELDS = { run: ['text', 'app'], step: ['verb', 'app', 'role', 'label', 'host', 'chars'], ask: ['q', 'a', 'app'], guardian: ['text', 'app'], done: ['text', 'app'], refused: ['text', 'app', 'role', 'label'] };
const LIMIT = { text: 200, q: 120, label: 60, app: 40, verb: 40, role: 40, host: 80, a: 12 };
function clean(e, t) {
  const f = FIELDS[e?.kind];
  if (!f) return null;
  const o = { t, kind: e.kind };
  for (const k of f) if (e[k] != null && e[k] !== '') o[k] = k === 'chars' ? Math.max(0, Number(e[k]) | 0) : plain(e[k], LIMIT[k] ?? 200);
  if (o.kind === 'ask' && /^type\b/i.test(o.q ?? '')) o.q = 'Type some text?';   // the careful-mode card quotes what's typed
  return o;
}

export function createActivityLog(dir, { now = Date.now, fs = nodeFs } = {}) {
  const file = path.join(dir, 'activity.jsonl'), old = path.join(dir, 'activity.1.jsonl');
  const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').flatMap((l) => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } }); } catch { return []; } };
  return {
    // Never throws: a full disk must not stop the agent.
    log(event) {
      try {
        const e = clean(event, now());
        if (!e) return;
        fs.mkdirSync(dir, { recursive: true });
        let size = 0; try { size = fs.statSync(file).size; } catch {}
        if (size >= MB2) fs.renameSync(file, old);   // keeps one old file
        fs.appendFileSync(file, JSON.stringify(e) + '\n', { mode: 0o600 });
      } catch (err) { console.warn('[activity]', err.message); }
    },
    read({ since = 0, until = Infinity, app } = {}) {
      const a = app ? String(app).toLowerCase() : '';
      return [...lines(old), ...lines(file)].filter((e) => e.t >= since && e.t < until && (!a || String(e.app ?? '').toLowerCase() === a)).sort((x, y) => x.t - y.t);
    },
    clear() { for (const f of [file, old]) try { fs.rmSync(f, { force: true }); } catch {} },
  };
}

// ---- the question ----
const RISK = [
  ['sent', /\b(send|sent|post|submit|reply|replied)\b/i, /send|reply|post|submit/i],
  ['bought', /\b(buy|bought|purchase[d]?|order(?:ed)?|pay|paid)\b/i, /buy|pay|purchase|order|check ?out|place/i],
  ['deleted', /\b(delet(?:e|ed)|trash(?:ed)?|remov(?:e|ed))\b/i, /delet|trash|remov|erase/i],
];
const ANY_RISK = /send|pay|buy|purchase|order|delete|trash|check ?out/i;
const NOT_APP = /^(?:the|my|a|an|this|that|it|total|general|case|short|detail)$/i;

/** Words → { clear } or { window, risk, app } or null. */
export function activityIntent(text) {
  const t = String(text ?? '').replace(/[’‘]/g, "'").trim();
  if (!ACTIVITY.test(t)) return null;
  if (/\b(clear|delete|erase|wipe)\b.*\bactivity\b/i.test(t)) return { clear: true };
  const window = /\b(while|when)\s+i\s+(was|were)\s+(away|gone|out)|\bwhile\s+i\s+was\s+away\b/i.test(t) ? 'away' : /\bthis\s+morning\b/i.test(t) ? 'morning' : /\byesterday\b/i.test(t) ? 'yesterday' : /\bthis\s+week\b|\bpast\s+week\b|\blast\s+7\s+days\b/i.test(t) ? 'week' : 'today';
  const q = /\bdid\s+(?:you|dixi)\s+(\w+)/i.exec(t)?.[1] ?? '';
  const risk = /^(send|pay|buy|purchase|order|delete|post|submit)$/i.test(q) ? (RISK.find((r) => r[1].test(q))?.[0] ?? 'risky') : null;
  let app = /\bin\s+([A-Za-z][\w.&-]*(?:\s+[A-Z][\w.&-]*)?)/.exec(t)?.[1]?.replace(/\s+(today|yesterday|this|while|please)$/i, '').trim();
  if (app && (NOT_APP.test(app) || /^(today|yesterday|the|my)\b/i.test(app))) app = undefined;
  return { window, risk, ...(app ? { app } : {}) };
}

// ---- the answer ----
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const hm = (ms) => { const d = new Date(ms); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const quote = (s) => `“${s}”`;

/** { since, until, name } for a time word, from the injected clock and the log (for "away"). */
export function windowOf(name, logApi, n) {
  const day = startOfDay(n);
  if (name === 'yesterday') { const d = new Date(day); d.setDate(d.getDate() - 1); return { since: d.getTime(), until: day, name: 'yesterday' }; }
  if (name === 'morning') return { since: day, until: day + 12 * 3600000, name: 'this morning' };
  if (name === 'week') { const d = new Date(day); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { since: d.getTime(), until: Infinity, name: 'this week' }; }
  if (name === 'away') {   // since the last run that began over 30 minutes ago, else the last 2 hours
    const last = logApi.read({ since: n - 7 * DAY }).filter((e) => e.kind === 'run' && e.t <= n - 30 * 60000).at(-1);
    return { since: last ? last.t : n - 2 * 3600000, until: Infinity, name: 'while you were away' };
  }
  return { since: day, until: Infinity, name: 'today' };
}

// Events from one run (each "run" starts a group).
function groups(events) {
  const out = [];
  for (const e of events) { if (e.kind === 'run' || !out.length) out.push({ t: e.t, run: e.kind === 'run' ? e : null, rest: e.kind === 'run' ? [] : [e] }); else out.at(-1).rest.push(e); }
  return out;
}
const label = (q) => /“([^”]+)”/.exec(q)?.[1] ?? String(q).replace(/\?$/, '');
function did(g) {
  const bits = [];
  const typed = g.rest.filter((e) => e.kind === 'step' && e.verb === 'typed');
  for (const e of typed.slice(0, 2)) bits.push(`I typed ${e.chars} characters into a ${e.role ?? 'text box'}${e.app ? ` in ${e.app}` : ''}`);
  const clicks = g.rest.filter((e) => e.kind === 'step' && /clicked|pressed$/.test(e.verb) && e.label);
  if (clicks.length) bits.push(`I ${clicks[0].verb} ${clicks.slice(0, 2).map((e) => quote(e.label)).join(' and ')}${clicks[0].app ? ` in ${clicks[0].app}` : ''}${clicks.length > 2 ? ` and ${clicks.length - 2} more` : ''}`);
  else if (!typed.length) { const s = g.rest.filter((e) => e.kind === 'step'); if (s.length) bits.push(`I did ${s.length} step${s.length > 1 ? 's' : ''}${s[0].app ? ` in ${s[0].app}` : ''}`); }
  for (const e of g.rest.filter((x) => x.kind === 'ask')) bits.push(e.a === 'yes' ? `you said yes to ${quote(label(e.q))}` : e.a === 'no' ? `you said no to ${quote(label(e.q))}` : `${quote(label(e.q))} timed out`);
  if (g.rest.some((e) => e.kind === 'guardian')) bits.push('I stopped on a warning');
  const done = g.rest.find((e) => e.kind === 'done');
  if (done && !bits.length) bits.push(done.text);
  return bits;
}

/** intent → { say, title, text }. `text` is at most 8 lines for the panel; `say` is short. */
export function answerActivity(intent, logApi, { now = Date.now } = {}) {
  const n = now(), w = windowOf(intent.window, logApi, n);
  const events = logApi.read({ since: w.since, until: w.until, ...(intent.app ? { app: intent.app } : {}) });
  const where = intent.app ? ` in ${intent.app}` : '';
  const title = intent.risk ? 'Sent, bought, deleted' : 'What I did';
  const when = (t) => (w.name === 'today' || w.name === 'this morning' || w.name === 'while you were away' || t >= startOfDay(n) ? 'At ' : `${WEEKDAY[new Date(t).getDay()]} `) + hm(t);
  // "Did you send anything?": only approved questions that matched.
  if (intent.risk) {
    const re = RISK.find((r) => r[0] === intent.risk)?.[2] ?? ANY_RISK;
    const hits = events.filter((e) => e.kind === 'ask' && e.a === 'yes' && re.test(e.q ?? ''));
    const verb = { sent: 'send anything', bought: 'buy or pay for anything', deleted: 'delete anything', risky: 'send, pay, buy or delete anything' }[intent.risk];
    if (!hits.length) { const s = `No. I didn't ${verb} ${w.name}${where}.`; return { say: s, title, text: s }; }
    const lines = hits.slice(0, 8).map((e) => `${when(e.t)}: you said yes to ${quote(label(e.q))}${e.app ? ` in ${e.app}` : ''}.`);
    return { say: `Yes. ${hits.length} time${hits.length > 1 ? 's' : ''} ${w.name}${where}, with your yes. ${lines[0]}`, title, text: lines.join('\n') + (hits.length > 8 ? `\n…and ${hits.length - 8} more.` : '') };
  }
  const gs = groups(events).filter((g) => g.run || g.rest.length);
  if (!gs.length) { const s = `I haven't done anything ${w.name}${where}.`; return { say: s, title, text: s }; }
  const head = `${w.name === 'while you were away' ? 'While you were away' : w.name[0].toUpperCase() + w.name.slice(1)}${where} I did ${gs.length} thing${gs.length > 1 ? 's' : ''}.`;
  const line = (g) => { const b = did(g); return `${when(g.t)}${g.run ? ` you asked me to ${g.run.text}` : ''}${b.length ? `${g.run ? '; ' : ' '}${b.join('; ')}` : ''}.`; };
  const lines = gs.slice(0, 7).map(line);
  const text = [head, ...lines, ...(gs.length > 7 ? [`…and ${gs.length - 7} more.`] : [])].join('\n');
  const say = `${head} ${gs.slice(0, 2).map((g) => `${when(g.t)}${g.run ? ` you asked me to ${g.run.text}` : ' I did something'}.`).join(' ')}${gs.length > 2 ? ' The rest is on screen.' : ''}`;
  return { say, title, text };
}
