// Your own voice commands, set in the dashboard: "Dixi, Claude" opens Claude. Kept in userData/commands.json,
// on this Mac only. Matching is plain words (no AI), and it's checked before Dixi's built-in commands.
import fs from 'node:fs';

/** What a command can do. `target` means: an app name, a web address, a file or folder, a skill, words to say, a task. */
export const ACTIONS = [
  { id: 'app', label: 'Open an app', placeholder: 'Claude', hint: 'The app’s name, as in your Applications folder.' },
  { id: 'website', label: 'Open a website', placeholder: 'youtube.com', hint: 'A web address. Dixi checks it for look-alike scam sites first.' },
  { id: 'file', label: 'Open a file or folder', placeholder: '~/Documents/Taxes', hint: 'A file or folder in your home folder.' },
  { id: 'skill', label: 'Run a skill', placeholder: 'morning mail', hint: 'A skill you saved with “save that as a skill”.' },
  { id: 'say', label: 'Say something', placeholder: 'Good morning!', hint: 'Dixi says these words out loud.' },
  { id: 'task', label: 'Do a task', placeholder: 'reply to the newest email saying thanks', hint: 'As if you said it to Dixi. Send, pay and delete still ask first.' },
];
const IDS = new Set(ACTIONS.map((a) => a.id));

// "Hey Dixi, please open Claude." → "claude": the words that pick a command.
const LEAD = /^(?:(?:hey|ok|okay)\s+)?dixi\b[\s,.!]*|^(?:please|can you|could you)\s+/;
const VERB = /^(?:open|launch|start|run|go to|show me|play)\s+/;
export function norm(s) {
  let t = String(s ?? '').toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(LEAD, '').replace(/\s+please$/, '').trim(); }
  return t;
}
/** The part that has to match: "open my bank" and "my bank" are both "bank". */
const key = (s) => norm(s).replace(VERB, '').replace(/^(?:the|my)\s+/, '');

/** One command, checked: a known action, a 1–60 character phrase and a target. Returns null if it can't be used. */
export function cleanCommand(c, i = 0) {
  const phrase = String(c?.phrase ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const target = String(c?.target ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 300);
  if (!key(phrase) || !target || !IDS.has(c?.action)) return null;
  const id = /^[\w-]{1,40}$/.test(c?.id ?? '') ? c.id : `c${Date.now().toString(36)}${i}`;
  return { id, phrase, action: c.action, target, enabled: c?.enabled !== false };
}

/** Checks a whole list from the dashboard: bad rows are dropped; a phrase used twice is refused. */
export function cleanList(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'That list is not readable.' };
  const out = list.slice(0, 200).map(cleanCommand).filter(Boolean);
  const seen = new Map();
  for (const c of out) {
    const k = key(c.phrase);
    if (seen.has(k)) return { ok: false, error: `“${c.phrase}” is used twice. Each phrase can do one thing.` };
    seen.set(k, c);
  }
  return { ok: true, commands: out };
}

export function loadCommands(file) {
  try { return cleanList(JSON.parse(fs.readFileSync(file, 'utf8'))).commands ?? []; } catch { return []; }
}
export function saveCommands(file, list) {
  const r = cleanList(list);
  if (r.ok) fs.writeFileSync(file, JSON.stringify(r.commands, null, 2), { mode: 0o600 });
  return r;
}

/** The enabled command these words call for: "Claude", "open Claude", "Dixi, launch Claude please". */
export function matchCommand(text, list) {
  const k = key(text);
  return k ? list.find((c) => c.enabled !== false && key(c.phrase) === k) ?? null : null;
}

/** "~/Documents" → an absolute path inside home, or null (nothing outside your home folder). */
export function homePath(p, home) {
  const s = String(p ?? '').trim().replace(/^~(?=\/|$)/, home);
  if (!s.startsWith('/') || s.split('/').includes('..')) return null;
  return s === home || s.startsWith(`${home}/`) ? s : null;
}
