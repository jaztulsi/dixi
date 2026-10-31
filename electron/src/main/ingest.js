// What goes into the personal index (index.js), and keeping it current:
//  · folders you choose: text, Markdown, code, PDF (PDFKit), Word / RTF / HTML / ODT (textutil). A watch
//    re-reads a file when it changes and drops it when it's gone.
//  · Notes and Mail, read through JXA (one Automation prompt each, the first time). Mail only when it's
//    already open, so Dixi never launches it.
//  · what you asked Dixi (the activity log) and what you talked about (each turn), for session memory.
// Programs run with execFile and an argv list, never a shell. File names and contents are data.
import fs from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';

const TEXT = /\.(?:txt|md|markdown|csv|tsv|json|ya?ml|log|xml|ini|toml|tex|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|swift|sh|sql|css|vue|svelte)$/i;
const TEXTUTIL = /\.(?:docx?|rtfd?|odt|html?|webarchive)$/i;
const PDF = /\.pdf$/i;
export const indexable = (f) => TEXT.test(f) || TEXTUTIL.test(f) || PDF.test(f);
const SKIP = /^(?:\.|node_modules$|Library$|__pycache__$|venv$|\.venv$|dist$|build$|target$|Pods$)/;
const MAX_BYTES = 20e6, MAX_CHARS = 200000;

const PDF_JXA = `ObjC.import('PDFKit');
function run(argv) { const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0])); return d.isNil() ? '' : ObjC.unwrap(d.string) || ''; }`;
export const runText = (cmd, args, { timeout = 20000 } = {}) => new Promise((res, rej) =>
  execFile(cmd, args, { maxBuffer: 32e6, timeout }, (err, out) => (err ? rej(err) : res(String(out)))));

/** A file's text, or '' (unsupported, too big, unreadable). */
export async function extractText(file, { run = runText } = {}) {
  try {
    const st = await fs.stat(file);
    if (!st.isFile() || st.size > MAX_BYTES) return '';
    let t = '';
    if (TEXT.test(file)) t = await fs.readFile(file, 'utf8');
    else if (PDF.test(file)) t = await run('osascript', ['-l', 'JavaScript', '-e', PDF_JXA, file]);   // a scan has no text: OCR is capture.js
    else if (TEXTUTIL.test(file)) t = await run('textutil', ['-convert', 'txt', '-stdout', file]);
    return t.includes('\u0000') ? '' : t.slice(0, MAX_CHARS);   // binary in disguise
  } catch { return ''; }
}

async function* walk(dir, depth = 0) {
  if (depth > 12) return;
  let ents = [];
  try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (SKIP.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, depth + 1);
    else if (e.isFile() && indexable(e.name)) yield p;
  }
}

async function addFile(idx, file, extract) {
  const st = await fs.stat(file).catch(() => null);
  const uri = pathToFileURL(file).href;
  if (!st) return idx.remove(uri) ? 'removed' : 'gone';
  const mtime = Math.floor(st.mtimeMs);
  if (idx.has(uri, mtime)) return 'same';
  const text = await extract(file);
  if (!text.trim()) return 'empty';
  await idx.add({ uri, kind: 'file', title: path.basename(file), text, mtime, at: mtime });
  return 'added';
}

/** Indexes everything under `dir` that changed, and forgets files that are gone. → { added, same, removed } */
export async function indexFolder(idx, dir, { extract = extractText, signal, limit = 20000, onProgress = () => {} } = {}) {
  const seen = new Set(), n = { added: 0, same: 0, removed: 0 };
  for await (const f of walk(dir)) {
    if (signal?.aborted || seen.size >= limit) break;
    seen.add(pathToFileURL(f).href);
    const r = await addFile(idx, f, extract);
    if (r === 'added') { n.added++; if (n.added % 25 === 0) onProgress(`Indexed ${n.added} files`, null); } else n.same++;
  }
  const base = pathToFileURL(dir).href.replace(/\/?$/, '/');
  if (!signal?.aborted) for (const uri of idx.uris('file')) if (uri.startsWith(base) && !seen.has(uri)) { idx.remove(uri); n.removed++; }
  return n;
}

/** Keeps `dir` current: a changed file is re-read a moment after it settles. → { close() } */
export function watchFolder(idx, dir, { extract = extractText, settleMs = 1500, watch = fsWatch } = {}) {
  const due = new Set();
  let timer = null;
  const flush = async () => {
    timer = null;
    for (const f of [...due]) { due.delete(f); await addFile(idx, f, extract).catch(() => {}); }
  };
  const w = watch(dir, { recursive: true }, (_ev, name) => {
    if (!name || String(name).split(path.sep).some((part) => SKIP.test(part)) || !indexable(String(name))) return;
    due.add(path.join(dir, String(name)));
    clearTimeout(timer); timer = setTimeout(flush, settleMs);
  });
  return { close: () => { clearTimeout(timer); w.close(); }, flush };
}

// ---- Notes and Mail (bulk property reads: one Apple Event per field, not per note) ----
const NOTES_JXA = `function run() {
  const n = Application('Notes').notes;
  const id = n.id(), name = n.name(), body = n.plaintext(), at = n.modificationDate();
  return JSON.stringify(id.slice(0, 2000).map((x, i) => ({ id: x, title: name[i], text: body[i], at: +at[i] })));
}`;
const MAIL_JXA = `function run(argv) {
  const Mail = Application('Mail');
  if (!Mail.running()) return '[]';
  const since = Number(argv[0]), out = [];
  for (const m of Mail.inbox.messages().slice(0, 300)) {
    const at = +m.dateReceived();
    if (at < since) break;
    out.push({ id: m.messageId(), title: m.subject() + ' (from ' + m.sender() + ')', text: m.content().slice(0, 20000), at });
  }
  return JSON.stringify(out);
}`;
async function indexRows(idx, rows, kind, scheme) {
  let added = 0;
  for (const r of rows) {
    if (!r?.id || !String(r.text ?? '').trim()) continue;
    added += (await idx.add({ uri: `${scheme}://${encodeURIComponent(r.id)}`, kind, title: String(r.title ?? '').slice(0, 200), text: r.text, mtime: r.at, at: r.at })) ? 1 : 0;
  }
  return added;
}
export async function indexNotes(idx, { run = runText } = {}) {
  return indexRows(idx, JSON.parse(await run('osascript', ['-l', 'JavaScript', '-e', NOTES_JXA], { timeout: 60000 })), 'note', 'note');
}
export async function indexMail(idx, { run = runText, days = 30, now = Date.now } = {}) {
  return indexRows(idx, JSON.parse(await run('osascript', ['-l', 'JavaScript', '-e', MAIL_JXA, String(now() - days * 864e5)], { timeout: 60000 })), 'mail', 'mail');
}

// ---- what you asked, and what was said (session memory) ----
/** Each request in the activity log since `since` → one 'command' source. */
export async function indexActivity(idx, act, { since = 0 } = {}) {
  let added = 0;
  for (const e of act.read({ since })) if (e.kind === 'run' && e.text) added += (await idx.add({ uri: `command://${e.t}`, kind: 'command', title: `You asked${e.app ? ` (in ${e.app})` : ''}`, text: `You asked: ${e.text}`, mtime: e.t, at: e.t })) ? 1 : 0;
  return added;
}
/** One conversation turn, so "where did we leave off" and "what did you tell me about X" can be answered. */
export const addTurn = (idx, { said, answer, app = '', at = Date.now() }) =>
  idx.add({ uri: `session://${at}`, kind: 'session', title: `Conversation${app ? ` in ${app}` : ''}`, text: `You said: ${String(said).slice(0, 2000)}\nDixi answered: ${String(answer ?? '').slice(0, 4000)}`, mtime: at, at });
