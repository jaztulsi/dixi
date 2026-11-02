// "Find and open my files" for Dixi Everywhere: understand the ask, search with Spotlight (mdfind),
// open / reveal, and (after a yes) move or rename. There is no delete and no trash here, on purpose.
// Processes run with execFile and an argv list, never a shell. File names come from disk: treat as hostile.

import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { checkContext, checkText } from './guardian.js';
import { RUNS } from './safesite.js';

const run = (args, timeout = 8000) => new Promise((resolve, reject) => {
  execFile(args[0], args.slice(1), { timeout, maxBuffer: 8 << 20 }, (err, out) => (err ? reject(err) : resolve(String(out))));
});

// ---- 1. the parser (pure) ----
const KINDS = [
  ['folder', /\b(?:folders?|directory|directories)\b/i],
  ['pdf', /\bpdfs?\b/i],
  ['spreadsheet', /\b(?:spreadsheets?|excel|xlsx?|csv|sheets?)\b/i],
  ['slides', /\b(?:slides?|slideshows?|presentations?|decks?|keynote|powerpoint|pptx?)\b/i],
  ['video', /\b(?:videos?|movies?|mp4s?|clips?)\b/i],
  ['audio', /\b(?:audio|songs?|recordings?|mp3s?|music|voice memos?)\b/i],
  ['image', /\b(?:images?|photos?|pictures?|pics?|jpe?gs?|pngs?|screenshots?)\b/i],
  ['document', /\b(?:documents?|docs?|docx?|word files?)\b/i],
];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WHEN = new RegExp(`\\b(today|yesterday|this week|last week|this month|last year|(?:from|in|during|back in)\\s+(${MONTHS.join('|')}))\\b`, 'i');
const ORD = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2, fourth: 3, '4th': 3, four: 3, fifth: 4, '5th': 4, five: 4, last: -1 };
const ORDS = Object.keys(ORD).join('|');
const REF = `(?:it|that|this|them|(?:the\\s+)?(?:${ORDS})(?:\\s+one)?|number\\s+\\d)`;
const indexOf = (ref) => {
  const w = String(ref ?? '').toLowerCase().match(new RegExp(`\\b(${ORDS})\\b|number\\s+(\\d)`));
  return w ? (w[2] ? Number(w[2]) - 1 : ORD[w[1]]) : 0;
};
const LEAD = /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:(find|search for|look for|locate|pull up|get me|open|show me|show)\b|(what (?:files? )?did i (?:download|save))\b)/i;
const NOISE = /\b(?:my|the|a|an|me|newest|latest|last|recent|most recent|newly|file|files|from|in|of|called|named|for|on|all|any|some|that|i|did|what|please|up|saved|downloads?|downloaded|folders?|screenshots?|pdfs?|images?|photos?|pictures?|pics?)\b/gi;
const clean1 = (s) => s.replace(/\s+/g, ' ').trim();
// A second command after the first ("…, search lo-fi beats", "…and move it to Documents"): the planner splits those, not us.
const MORE = /(?:[,;]|\b(?:and|then)\b)\s+(?:(?:and|then|also)\s+)?(?:(?:open|find|search|look|play|rename|move|put|show|send|email|share|copy|print|close|quit|go|click|type|tell|read|make|create|add|set|turn|start|save|upload|attach|delete|trash)\b|\w+\s+(?:it|them)\b)/i;
// Words that only ever mean files. "music", "photos", "slides" alone can be an app ("open Apple Music"), so they need more.
const FILE_WORD = /\b(?:files?|folders?|director(?:y|ies)|pdfs?|docx?|xlsx?|csv|pptx?|jpe?gs?|pngs?|heic|mp3s?|mp4s?|movs?|zips?|spreadsheets?)\b/i;
// "open my Downloads folder" → ~/Downloads itself. Music, Pictures and Movies need the word "folder" (they're apps too).
const HOME_DIR = /^(?:my\s+|the\s+)?(?:(downloads|documents|desktop)(?:\s+folder)?|(downloads|documents|desktop|pictures|music|movies)\s+folder)$/i;

/** What was asked about files, or null. A search needs a kind of file, "download", "screenshot" or the word "file", so screen tasks ("find the buy button", "what is this file") never match. */
export function fileIntent(text) {
  const t = clean1(String(text ?? '').replace(/[.!?]+$/, ''));
  let m;
  const none = { kind: null, when: null, index: 0, dest: null, name: null, query: '' };
  if (MORE.test(t)) return null;
  if ((m = t.match(new RegExp(`^(?:please\\s+)?(?:show|reveal)\\s+(${REF})\\s+in finder$`, 'i')))) return { ...none, verb: 'reveal', index: indexOf(m[1]) };
  if ((m = t.match(new RegExp(`^(?:please\\s+)?open\\s+(?:up\\s+)?(${REF})$`, 'i')))) return { ...none, verb: 'open', index: indexOf(m[1]) };
  if ((m = t.match(new RegExp(`^(?:please\\s+)?(?:move|put)\\s+(${REF})\\s+(?:to|into|in)\\s+(?:my\\s+|the\\s+)?(.+?)(?:\\s+folder)?$`, 'i')))) return { ...none, verb: 'move', index: indexOf(m[1]), dest: m[2] };
  if ((m = t.match(new RegExp(`^(?:please\\s+)?rename\\s+(${REF})\\s+(?:to|as)\\s+(.+)$`, 'i')))) return { ...none, verb: 'rename', index: indexOf(m[1]), name: m[2].replace(/^["“']|["”']$/g, '') };

  const lead = t.match(LEAD);
  if (!lead) return null;
  let rest = t.slice(lead[0].length);
  if (/^\s*(?:this|that|these|those|here)\b/i.test(rest)) return null;   // about the screen, not a search
  if ((m = rest.trim().match(HOME_DIR))) { const f = (m[1] ?? m[2]).toLowerCase(); return { ...none, verb: 'open', kind: 'folder', folder: f[0].toUpperCase() + f.slice(1) }; }
  const w = rest.match(WHEN);
  const when = !w ? null : w[2] ? w[2].toLowerCase() : w[1].toLowerCase();
  if (w) rest = rest.replace(WHEN, ' ');
  const kind = KINDS.find(([, re]) => re.test(rest))?.[0] ?? null;
  const shot = /\bscreenshots?\b|\bscreen shots?\b/i.test(rest);
  const src = shot ? 'screenshot' : kind !== 'folder' && (lead[2] || /\bdownload(?:s|ed)?\b/i.test(rest)) ? 'downloads' : null;
  if (!src && !FILE_WORD.test(rest) && !(kind && (w || (/\b(?:my|the)\b/i.test(rest) && !/\bapps?\b/i.test(rest))))) return null;
  const newest = /\b(?:newest|latest|last|most recent|recent)\b/i.test(rest);
  const verb = lead[1]?.toLowerCase() === 'open' || (newest && /^show/i.test(lead[1] ?? '')) ? 'open' : 'find';
  const query = clean1(rest.replace(/\bscreen shots?\b/gi, ' ').replace(NOISE, ' ')).replace(/[^\p{L}\p{N}\s._'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return { verb, query: stripKinds(query), kind: shot ? 'image' : kind, when, index: 0, dest: null, name: null, src, newest };
}
const stripKinds = (q) => clean1(KINDS.reduce((s, [, re]) => s.replace(new RegExp(re.source, 'gi'), ' '), q));
/** For everywhere-words.js: cheap pre-check; fileIntent has the final say. */
export const FILES = /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:(?:find|search for|look for|locate|pull up|get me|open|show me|show|reveal|move|put|rename)\b|what (?:files? )?did i (?:download|save)\b)/i;

// ---- 2. the search ----
const TYPES = {
  pdf: ['com.adobe.pdf'],
  image: ['public.image'],
  spreadsheet: ['org.openxmlformats.spreadsheetml.sheet', 'com.microsoft.excel.xls', 'public.comma-separated-values-text', 'com.apple.iwork.numbers.sffnumbers'],
  document: ['org.openxmlformats.wordprocessingml.document', 'com.microsoft.word.doc', 'com.apple.iwork.pages.sffpages', 'public.rtf', 'public.plain-text'],
  slides: ['org.openxmlformats.presentationml.presentation', 'com.microsoft.powerpoint.ppt', 'com.apple.iwork.keynote.sffkey'],
  video: ['public.movie'],
  audio: ['public.audio'],
  folder: ['public.folder'],
};
/** Spotlight string literal: " and \ escaped. */
const lit = (s) => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
const day = (d, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);

/** [from, to) as Dates for a "when", or null. */
export function range(when, now) {
  const d = day(now);
  const monday = day(now, -((now.getDay() + 6) % 7));
  const mi = MONTHS.indexOf(when);
  if (when === 'today') return [d, day(now, 1)];
  if (when === 'yesterday') return [day(now, -1), d];
  if (when === 'this week') return [monday, day(now, 1)];
  if (when === 'last week') return [new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7), monday];
  if (when === 'this month') return [new Date(now.getFullYear(), now.getMonth(), 1), day(now, 1)];
  if (when === 'last year') return [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1)];
  if (mi >= 0) { const y = mi > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear(); return [new Date(y, mi, 1), new Date(y, mi + 1, 1)]; }
  return null;
}

/** The Spotlight query for an intent. Words are ANDed, each a name contains-match. */
export function spotlight({ query, kind, when, src }, now = new Date()) {
  const p = [];
  if (src === 'screenshot') p.push('kMDItemIsScreenCapture == 1');
  if (kind && TYPES[kind]) p.push(`(${TYPES[kind].map((t) => `kMDItemContentTypeTree == ${lit(t)}`).join(' || ')})`);
  for (const w of String(query ?? '').split(/\s+/).filter(Boolean).slice(0, 8)) p.push(`kMDItemDisplayName == ${lit(`*${w}*`)}cd`);
  const r = range(when, now);
  // "Downloaded yesterday": when it arrived (date added), or when it was last saved (a browser sets that to the download time).
  const span = (at) => `(${at} >= $time.iso(${iso(r[0])}) && ${at} < $time.iso(${iso(r[1])}))`;
  if (r) p.push(src === 'downloads' ? `(${span('kMDItemDateAdded')} || ${span('kMDItemContentModificationDate')})` : span('kMDItemContentModificationDate'));
  return p.length ? p.join(' && ') : 'kMDItemFSName == "*"';
}

/** Is this somewhere we may show or touch: inside home, not ~/Library, no hidden folder, no node_modules. */
export function allowed(p, home) {
  const rel = path.relative(home, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const seg = rel.split(path.sep);
  return seg[0] !== 'Library' && !seg.some((s) => s.startsWith('.') || s === 'node_modules');
}

/** Up to 5 { path, name, modified (ms) }, newest first. */
export async function findFiles({ query, kind, when, src } = {}, { exec = run, now = () => new Date(), home = os.homedir(), fs = fsp } = {}) {
  const where = src === 'downloads' ? path.join(home, 'Downloads') : home;
  const out = await exec(['mdfind', '-onlyin', where, spotlight({ query, kind, when, src }, now())]);
  const paths = String(out).split('\n').filter((p) => path.isAbsolute(p) && allowed(p, home)).slice(0, 300);   // ponytail: stats at most 300 hits; narrow with a "when" if more
  const stats = await Promise.all(paths.map((p) => fs.stat(p).then((s) => ({ path: p, name: path.basename(p), modified: s.mtimeMs })).catch(() => null)));
  return stats.filter(Boolean).sort((a, b) => b.modified - a.modified).slice(0, 5);
}

// ---- 3. the actions ----
let lastResults = [];
/** Keep the list so "open the second one" has something to point at. */
export const remember = (results) => { lastResults = Array.isArray(results) ? results.slice(0, 5) : []; };

/** A name that is safe to show or say: no control or direction characters, at most 60 long. */
// A name on disk is anyone's words ("Call Apple 1-800… virus alert.pdf"): Dixi never says a scammy one aloud.
export const safeName = (s) => { const n = String(s ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60); return checkText(n).length ? 'a file' : n; };
async function openFile(f, { exec, tell }) {
  const name = safeName(f.name);
  if (/\.mobileconfig$/i.test(f.path) || checkContext({ name: f.name }).some((x) => x.rule === 'remote-access')) return tell("I won't open that one: it can change settings or let someone control your Mac. If someone on the phone asked you to, hang up first.");
  // Running a program or installer is the main step of a "tech support" call: Dixi never does it.
  if (RUNS.test(f.path.replace(/\/+$/, ''))) return tell(`“${name}” is a program or installer, and I don't open those. If you trust it, open it yourself in Finder.`);
  await exec(['open', f.path]);
  return tell(`Opening ${name}.`, 'Opening', name);
}
const NUM = ['none', 'one', 'two', 'three', 'four', 'five'];
const ORDW = ['first', 'second', 'third', 'fourth', 'fifth'];
const dateWords = (ms, now) => {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
};

/** The tidy list text for the screen. */
export const listText = (list) => list.map((f, i) => `${i + 1}. ${safeName(f.name)}`).join('\n');

/** Where a "move it to X" may go: an existing, visible folder in home (or inside one); never Library. Null otherwise. */
async function destFolder(dest, home, fs) {
  const parts = String(dest ?? '').split(/[/>]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.length > 4) return null;
  let at = home;
  for (const [i, want] of parts.entries()) {
    if (want === '..' || want.startsWith('.')) return null;
    const names = await fs.readdir(at).catch(() => []);
    const hit = names.find((n) => n.toLowerCase() === want.toLowerCase() && !n.startsWith('.') && !(i === 0 && n === 'Library'));
    if (!hit) return null;
    at = path.join(at, hit);
  }
  return allowed(at, home) && (await fs.stat(at).then((s) => s.isDirectory(), () => false)) ? at : null;
}
const exists = (fs, p) => fs.stat(p).then(() => true, (e) => e?.code !== 'ENOENT');   // unsure counts as "there": never overwrite

/** Do one file action. Returns { title, text, results? } for show(); speaks through say(). */
// With `undo` (undo.js's log) a move or rename happens straight away and "undo that" puts it back; without it, approve() asks first.
export async function fileAction(intent, last, { exec = run, approve, say, undo, now = () => new Date(), home = os.homedir(), fs = fsp } = {}) {
  const tell = (s, title = 'Files', text = s) => { say(s); return { title, text }; };
  const pick = () => {
    const list = last?.length ? last : lastResults;
    const f = intent.index < 0 ? list.at(-1) : list[intent.index];
    return f && allowed(f.path, home) ? f : null;
  };

  if (intent.folder) {
    const dir = path.join(home, path.basename(String(intent.folder)));
    if (!(await fs.stat(dir).then((x) => x.isDirectory(), () => false))) return tell(`I couldn't find your ${safeName(intent.folder)} folder.`);
    await exec(['open', dir]);
    return tell(`Opening your ${safeName(intent.folder)} folder.`, 'Opening', safeName(intent.folder));
  }
  if (intent.verb === 'find' || (intent.verb === 'open' && (intent.query || intent.kind || intent.src))) {
    let list;
    try { list = await findFiles(intent, { exec, now, home, fs }); } catch { return tell("I couldn't search your files just now."); }
    if (intent.newest) list = list.slice(0, 1);
    remember(list);
    if (!list.length) return tell("I didn't find anything like that.", 'No files found');
    if (intent.verb === 'open') {
      return { ...(await openFile(list[0], { exec, tell })), results: list };
    }
    const n = list.length;
    const when = dateWords(list[0].modified, now());
    const s = n === 1
      ? `I found one: ${safeName(list[0].name)} from ${when}. Say open it.`
      : `I found ${NUM[n]}. The newest is ${safeName(list[0].name)} from ${when}. Say open the first one, or the second one.`;
    return { ...tell(s, `Found ${n}`, listText(list)), results: list };
  }

  const f = pick();
  if (!f) return tell("I don't have a file in mind. Ask me to find it first.");
  const name = safeName(f.name);
  if (intent.verb === 'open') return openFile(f, { exec, tell });
  if (intent.verb === 'reveal') { await exec(['open', '-R', f.path]); return tell('Here it is in Finder.', 'In Finder', name); }

  let to, ask;
  if (intent.verb === 'move') {
    const dir = await destFolder(intent.dest, home, fs);
    if (!dir) return tell("I can only move files into your folders, like Documents or Desktop. I didn't move it.");
    to = path.join(dir, path.basename(f.path));
    ask = `Move “${name}” to ${safeName(path.relative(home, dir))}?`;
  } else if (intent.verb === 'rename') {
    let n = String(intent.name ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
    if (!n || /[/\\:]/.test(n) || n.startsWith('.') || n.length > 120) return tell("I can't use that name. I didn't rename it.");
    const ext = path.extname(f.path);   // always kept: photo.jpg must never become photo.command
    if (path.extname(n).toLowerCase() !== ext.toLowerCase()) n += ext;
    to = path.join(path.dirname(f.path), n);
    ask = `Rename “${name}” to “${safeName(n)}”?`;
  } else return tell("I can't do that with files.");

  if (await exists(fs, to)) return tell('There is already a file with that name there, so I left it alone.');
  if (!undo) {
    if (!(await approve(ask))) return tell(`Okay, I didn't ${intent.verb} it.`);
    if (await exists(fs, to)) return tell('There is already a file with that name there, so I left it alone.');   // looked again after the wait
  }
  try {
    if (undo) to = await undo.move(f.path, to, undo.group(`${intent.verb === 'move' ? 'Move' : 'Rename'} ${path.basename(f.path)}`));
    else await fs.rename(f.path, to);
  } catch { return tell(`I couldn't ${intent.verb} it.`); }
  remember(lastResults.map((r) => (r.path === f.path ? { ...r, path: to, name: path.basename(to) } : r)));
  return tell(`${intent.verb === 'move' ? 'Moved' : 'Renamed'}.${undo ? ' Say undo that to put it back.' : ''}`, 'Done', safeName(path.basename(to)));
}
