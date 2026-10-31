// Undo for file changes. Every move, rename and clean-up a new Dixi feature does goes through here and is
// written to <userData>/undo.jsonl (owner-only, one JSON line per change), so "undo that" puts things back.
// Nothing is ever deleted: "throw it away" moves it to the Trash, and undo moves it back out. Nothing is
// overwritten either: a name that's taken becomes "name 2.ext". One request = one group, undone together.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function createUndo(file, { trashDir = path.join(os.homedir(), '.Trash'), now = Date.now } = {}) {
  const append = (e) => fs.appendFile(file, JSON.stringify(e) + '\n', { mode: 0o600 });
  const read = async () => (await fs.readFile(file, 'utf8').catch(() => '')).split('\n').flatMap((l) => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } });
  const exists = (p) => fs.lstat(p).then(() => true, () => false);
  async function free(p) {
    const { dir, name, ext } = path.parse(p);
    for (let i = 1; i < 1000; i++) { const c = i === 1 ? p : path.join(dir, `${name} ${i}${ext}`); if (!(await exists(c))) return c; }
    throw new Error(`no free name for ${p}`);
  }
  async function shift(from, to) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    try { await fs.rename(from, to); } catch (err) {
      if (err.code !== 'EXDEV') throw err;   // another disk: copy, then remove the original
      await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
      await fs.rm(from, { recursive: true });
    }
  }
  const abs = (p) => { if (!path.isAbsolute(String(p ?? ''))) throw new Error(`not a full path: ${p}`); return path.normalize(p); };

  const u = {
    /** A new group for one request: pass it to each change so "undo" reverses them together. */
    group: (label) => ({ id: `${now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label: String(label ?? '').slice(0, 80) }),
    /** Moves a file or folder to `to` (a free name next to it if taken). → where it ended up. */
    async move(from, to, g = u.group('Move')) {
      from = abs(from); to = abs(to);
      if (from === to) return to;
      if (!(await exists(from))) throw Object.assign(new Error(`ENOENT: ${path.basename(from)}`), { code: 'ENOENT' });
      const dest = await free(to);
      const made = [];
      for (let d = path.dirname(dest); !(await exists(d)); d = path.dirname(d)) made.unshift(d);   // folders this creates
      await shift(from, dest);
      await append({ g: g.id, label: g.label, at: now(), from, to: dest, made });
      return dest;
    },
    rename: async (p, name, g = u.group('Rename')) => {
      if (/[/:]/.test(name) || !name.trim() || name.startsWith('.')) throw new Error(`can't name a file "${name}"`);
      return u.move(p, path.join(path.dirname(abs(p)), name), g);
    },
    trash: async (p, g = u.group('Move to Trash')) => u.move(p, path.join(trashDir, path.basename(abs(p))), g),
    /** Reverses the latest group not yet undone. → { label, restored, skipped } or null (nothing to undo). */
    async undo() {
      const log = await read();
      const undone = new Set(log.filter((e) => e.undone).map((e) => e.undone));
      const last = log.findLast((e) => e.g && !undone.has(e.g));
      if (!last) return null;
      let restored = 0, skipped = 0;
      for (const e of log.filter((x) => x.g === last.g).reverse()) {
        // Only if it's still where Dixi put it and nothing has taken its old place since.
        if ((await exists(e.to)) && !(await exists(e.from))) { await shift(e.to, e.from); restored++; } else skipped++;
        for (const d of [...(e.made ?? [])].reverse()) await fs.rmdir(d).catch(() => {});   // only if empty
      }
      await append({ undone: last.g, at: now() });
      return { label: last.label, restored, skipped };
    },
    /** The latest groups, newest first: [{ label, at, count, undone }]. */
    async history(n = 10) {
      const log = await read();
      const undone = new Set(log.filter((e) => e.undone).map((e) => e.undone));
      const groups = new Map();
      for (const e of log) if (e.g) groups.set(e.g, { label: e.label, at: groups.get(e.g)?.at ?? e.at, count: (groups.get(e.g)?.count ?? 0) + 1, undone: undone.has(e.g) });
      return [...groups.values()].reverse().slice(0, n);
    },
  };
  return u;
}
