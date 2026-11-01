// The Mac suite: commands said to Dixi Everywhere, each checked against the REAL state of the Mac (osascript,
// Accessibility, files on disk), never against what Dixi says. kind: simple = one task, multi = several in one breath.
// known = a failure already reported. blocked = never run (e.g. messaging before the "Dixi Test" contact exists).
// Every row restores the Mac: volume, apps it opened, tabs/windows it added, notes/events/files it created.
// A check returns { ok, got }: got is the state actually seen, for the report.

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nextFriday = (now = new Date()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (((5 - d.getDay()) + 7) % 7 || 7)); return d; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const dec = (u) => { try { return decodeURIComponent(String(u).replace(/\+/g, ' ')).toLowerCase(); } catch { return String(u).toLowerCase(); } };

export const ROWS = [
  // ---- known failures (Q2 baseline) ----
  { id: 'music-search', kind: 'simple', known: true, say: 'search lo-fi beats on Apple Music',
    check: async (m) => {
      const url = await m.browserURL();
      if (host(url) === 'music.apple.com' && /lo.?fi/.test(dec(url))) return { ok: true, got: url };
      const front = await m.front(), fields = front === 'Music' ? await m.fieldValues() : [];
      return { ok: front === 'Music' && fields.some((v) => /lo.?fi/i.test(v)), got: `front ${front}; fields ${JSON.stringify(fields).slice(0, 120)}; browser ${url.slice(0, 80)}` };
    } },
  { id: 'safeway-bagel', kind: 'simple', known: true, say: 'buy a bagel from Safeway', note: 'lenient: a Safeway bagel page, search or cart counts',
    check: async (m) => { const url = await m.browserURL(); return { ok: /safeway\.com$/.test(host(url)) && /bagel|cart/.test(dec(url)), got: url }; } },
  { id: 'page-first-video', kind: 'simple', known: true, label: 'approximation of "couldn\'t find that on this page"', say: 'play the first video',
    setup: async (m) => { await m.openURL('https://www.youtube.com/results?search_query=lofi+beats'); await m.sleep(4000); },
    check: async (m) => { const url = await m.browserURL(); return { ok: /youtube\.com$/.test(host(url)) && /\/watch/.test(url), got: url }; } },
  { id: 'calendar-school-test', kind: 'multi', known: true, say: 'Go to my school calendar and add my test on Friday', note: 'the text-mom half is its own blocked row',
    setup: async (m) => ({ before: await m.eventsOn(nextFriday()) }),
    check: async (m, s) => { const now = await m.eventsOn(nextFriday()); const added = now.filter((e) => !s.before.some((b) => b.uid === e.uid)); return { ok: added.some((e) => /test/i.test(e.title)), got: JSON.stringify(added).slice(0, 200) || 'no new event' }; },
    cleanup: async (m, s) => { const now = await m.eventsOn(nextFriday()); for (const e of now.filter((e) => !s.before.some((b) => b.uid === e.uid))) await m.deleteEvent(e.uid); } },
  { id: 'calendar-then-text-mom', kind: 'multi', known: true, say: "Go to my school calendar, add my test on Friday, then text my mom I'll be late", blocked: 'needs Dixi Test contact (never message a real person)' },
  { id: 'music-search-play', kind: 'multi', known: true, say: 'Open Apple Music, search lo-fi beats, and play it',
    check: async (m) => { const mu = await m.music(); return { ok: mu.state === 'playing' && /lo.?fi|chill|beats|study/i.test(mu.track ?? ''), got: `${mu.state} · ${mu.track ?? ''}` }; } },
  { id: 'pdf-rename-move', kind: 'multi', known: true, say: 'Find the PDF I downloaded yesterday, rename it, and move it to my Documents folder',
    setup: (m) => m.pdfFixture(),
    check: async (m, s) => { const f = await m.findFixture(s); return { ok: Boolean(f) && f.startsWith(`${m.home}/Documents/`) && !f.endsWith(`/${s.name}`), got: f ?? 'fixture not found' }; },
    cleanup: (m, s) => m.cleanFixture(s) },
  { id: 'volume-notes-new', kind: 'multi', known: true, say: 'Turn the volume down, open my notes, and start a new note',
    setup: async (m) => ({ vol: await m.volume(), notes: await m.notesCount() }),
    check: async (m, s) => { const [vol, front, notes] = [await m.volume(), await m.front(), await m.notesCount()]; return { ok: vol < s.vol && front === 'Notes' && notes > s.notes, got: `volume ${s.vol}→${vol} · front ${front} · notes ${s.notes}→${notes}` }; },
    cleanup: (m, s) => m.deleteNotesSince(s.t0) },

  // ---- simple single commands (Q2 baseline) ----
  { id: 'open-calculator', kind: 'simple', say: 'open Calculator',
    check: async (m) => { const f = await m.front(); return { ok: f === 'Calculator', got: `front ${f}` }; } },
  { id: 'quit-calculator', kind: 'simple', say: 'quit Calculator',
    setup: async (m) => { await m.osa("Application('Calculator').activate()"); await m.sleep(1200); },
    check: async (m) => { const r = await m.running('Calculator'); return { ok: !r, got: `running ${r}` }; } },
  { id: 'volume-30', kind: 'simple', say: 'set the volume to 30 percent',
    check: async (m) => { const v = await m.volume(); return { ok: Math.abs(v - 30) <= 4, got: `volume ${v}` }; } },
  { id: 'open-downloads', kind: 'simple', say: 'open my Downloads folder',
    check: async (m) => { const [f, t] = [await m.front(), await m.finderTarget()]; return { ok: f === 'Finder' && /\/Downloads\/?$/.test(t), got: `front ${f} · ${t}` }; } },
  { id: 'open-youtube', kind: 'simple', say: 'open youtube.com',
    check: async (m) => { const url = await m.browserURL(); return { ok: host(url) === 'youtube.com', got: url }; } },
];

/** The state readers and restorers, given osa (JXA run by the test app, with Dixi's own permissions). */
export function mac({ osa, main, inputURL, fs, path, os, crypto, execFile, sleep }) {
  const home = os.homedir();
  const sh = (cmd, args) => new Promise((r) => execFile(cmd, args, { timeout: 8000 }, (e, o) => r(e ? '' : String(o).trim())));
  const json = async (src) => { const o = await osa(src); try { return JSON.parse(o); } catch { return { err: o }; } };
  const BROWSERS = /^(Google Chrome|Brave Browser|Microsoft Edge|Arc|Vivaldi|Chromium)$/;
  let browser = null;
  const m = {
    home, sleep, osa,
    /** Name of the frontmost app, from LaunchServices (no permission needed). */
    async front() { const asn = (await sh('lsappinfo', ['front'])).trim(); const o = asn ? await sh('lsappinfo', ['info', '-only', 'name', asn]) : ''; return o.match(/"LSDisplayName"="([^"]*)"/)?.[1] ?? ''; },
    running: async (name) => (await osa(`Application(${JSON.stringify(name)}).running()`)) === 'true',
    quit: (name) => osa(`Application(${JSON.stringify(name)}).quit()`),
    activate: (name) => osa(`Application(${JSON.stringify(name)}).activate()`),
    volume: async () => Number(await osa('const c = Application.currentApplication(); c.includeStandardAdditions = true; c.getVolumeSettings().outputVolume')),
    setVolume: (v) => osa(`const c = Application.currentApplication(); c.includeStandardAdditions = true; c.setVolume(null, { outputVolume: ${Number(v)} })`),
    async browser() { return (browser ??= (await osa("ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('https://example.com')).path.js")).replace(/^.*\//, '').replace(/\.app$/, '')); },
    async browserURL() {
      const b = await m.browser();
      const src = b === 'Safari' ? "const s = Application('Safari'); s.running() && s.documents.length ? s.documents[0].url() : ''"
        : `const b = Application(${JSON.stringify(b)}); b.running() && b.windows.length ? b.windows[0].activeTab.url() : ''`;
      const u = await osa(src); return u.startsWith('ERR') ? '' : u;
    },
    async tabIds() { const b = await m.browser(); if (!BROWSERS.test(b)) return []; const o = await json(`const b = Application(${JSON.stringify(b)}); JSON.stringify(b.running() ? b.windows().flatMap((w) => w.tabs().map((t) => t.id())) : [])`); return Array.isArray(o) ? o : []; },
    async closeTabsExcept(keep) { const b = await m.browser(); if (!BROWSERS.test(b)) return; await osa(`const b = Application(${JSON.stringify(b)}); const keep = ${JSON.stringify(keep)}; if (b.running()) for (const w of b.windows()) for (const t of w.tabs()) if (!keep.includes(t.id())) t.close()`); },
    openURL: async (u) => { await sh('open', [u]); },
    async music() { return json(`const m = Application('Music'); let track = ''; if (m.running()) { try { const t = m.currentTrack; track = [t.name(), t.artist(), t.album(), t.genre()].join(' | '); } catch (e) {} } JSON.stringify(m.running() ? { state: m.playerState(), track } : { state: 'not running' })`); },
    /** Values of the text and search fields in the front window (Dixi's own Accessibility walker). */
    fieldValues: () => main(async (_e, u) => { const i = await import(u); return (await i.listControls({ max: 300, ms: 2500 })).filter((c) => /TextField|SearchField|ComboBox/.test(c.role)).map((c) => c.value).filter(Boolean); }, inputURL).catch(() => []),
    async finderTarget() { const u = await osa("const f = Application('Finder'); f.finderWindows.length ? f.finderWindows[0].target().url() : ''"); try { return decodeURIComponent(new URL(u).pathname); } catch { return ''; } },
    async finderWindows() { const o = await json("JSON.stringify(Application('Finder').finderWindows().map((w) => w.id()))"); return Array.isArray(o) ? o : []; },
    closeFinderExcept: (keep) => osa(`const keep = ${JSON.stringify(keep)}; for (const w of Application('Finder').finderWindows()) if (!keep.includes(w.id())) w.close()`),
    async notesCount() { const n = Number(await osa("const n = Application('Notes'); n.running() ? n.notes.length : -1")); return Number.isFinite(n) ? n : -1; },
    /** Notes made since t0 (ms), moved to Recently Deleted. Only ones the test created. */
    deleteNotesSince: (t0) => osa(`const n = Application('Notes'); if (n.running()) { const since = new Date(${Number(t0) - 2000}); for (const x of n.notes()) { try { if (x.creationDate() >= since) x.delete(); } catch (e) {} } } 'ok'`),
    async eventsOn(day) {
      const d0 = new Date(day), d1 = new Date(day); d1.setDate(d1.getDate() + 1);
      const o = await json(`const c = Application('Calendar'); const d0 = new Date(${d0.getTime()}), d1 = new Date(${d1.getTime()}); const out = [];
        for (const cal of c.calendars()) { try { for (const e of cal.events.whose({ _and: [{ startDate: { _greaterThan: d0 } }, { startDate: { _lessThan: d1 } }] })()) out.push({ uid: e.uid(), title: e.summary(), cal: cal.name() }); } catch (x) {} }
        JSON.stringify(out)`);
      return Array.isArray(o) ? o : [];
    },
    deleteEvent: (uid) => osa(`const c = Application('Calendar'); for (const cal of c.calendars()) { try { for (const e of cal.events.whose({ uid: ${JSON.stringify(uid)} })()) e.delete(); } catch (x) {} } 'ok'`),
    /** A small real PDF in ~/Downloads dated yesterday, named with a QA marker; plus an inode map of the user's own PDFs. */
    async pdfFixture() {
      const name = `QA Dixi receipt ${Date.now().toString(36)}.pdf`, file = path.join(home, 'Downloads', name);
      const body = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 80]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 52>>stream\nBT /F1 12 Tf 10 40 Td (QA Dixi test receipt) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
      fs.writeFileSync(file, body);
      const y = Date.now() / 1000 - 86400; fs.utimesSync(file, y, y);
      const sha = crypto.createHash('sha256').update(body).digest('hex');
      const theirs = Object.fromEntries(fs.readdirSync(path.join(home, 'Downloads')).filter((f) => /\.pdf$/i.test(f) && f !== name).map((f) => [fs.statSync(path.join(home, 'Downloads', f)).ino, f]));
      return { name, file, sha, theirs };
    },
    /** Where the fixture is now (by content), searching Downloads, Documents (2 deep), Desktop and the Trash. */
    async findFixture(s) {
      const roots = ['Downloads', 'Documents', 'Desktop', '.Trash'].map((d) => path.join(home, d));
      for (const r of roots) for (const f of walk(r, r.endsWith('Documents') ? 2 : 1)) {
        try { if (/\.pdf$/i.test(f) && fs.statSync(f).size < 4096 && crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === s.sha) return f; } catch {}
      }
      return null;
    },
    /** Removes the fixture, and puts back any of the user's own PDFs that left ~/Downloads. */
    async cleanFixture(s) {
      const f = await m.findFixture(s); if (f) fs.rmSync(f, { force: true });
      const restored = [];
      const left = Object.entries(s.theirs).filter(([, n]) => !fs.existsSync(path.join(home, 'Downloads', n)));
      for (const [ino, n] of left) for (const g of walk(path.join(home, 'Documents'), 2)) { try { if (String(fs.statSync(g).ino) === ino) { fs.renameSync(g, path.join(home, 'Downloads', n)); restored.push(n); break; } } catch {} }
      return restored;
    },
  };
  function* walk(dir, depth) {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const p = path.join(dir, e.name); if (e.isFile()) yield p; else if (e.isDirectory() && depth > 1) yield* walk(p, depth - 1); }
  }
  return m;
}
export { nextFriday, ymd };
