// The Mac suite: commands said to Dixi Everywhere, each checked against the REAL state of the Mac (osascript,
// Accessibility, files on disk), never against what Dixi says. kind: simple = one task, multi = several in one breath.
// known = a failure already reported. blocked = never run (e.g. messaging before the "Dixi Test" contact exists).
// Every row restores the Mac: volume, apps it opened, tabs/windows it added, notes/events/files it created.
// A check returns { ok, got }: got is the state actually seen, for the report.

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nextFriday = (now = new Date()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (((5 - d.getDay()) + 7) % 7 || 7)); return d; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const tomorrow = (now = new Date()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; };
// URLs of browser tabs this row opened or changed (s.tabs0 = the tabs before the row, set by the runner).
const fresh = async (m, s) => Object.entries(await m.tabURLs()).filter(([id, u]) => s.tabs0?.[id] !== u).map(([, u]) => u);
const url = (hostRe, textRe) => async (m) => { const u = await m.browserURL(); return { ok: hostRe.test(host(u)) && (!textRe || textRe.test(dec(u))), got: u }; };
const front = (app) => async (m) => { const f = await m.front(); return { ok: f === app, got: `front ${f}` }; };
const newEvents = async (m, s, day) => (await m.eventsOn(day)).filter((e) => !s.before.some((b) => b.uid === e.uid));
const dropEvents = async (m, s, day) => { for (const e of await newEvents(m, s, day)) await m.deleteEvent(e.uid); };
const REFUSAL = /unsafe|not safe|isn't safe|malware|phishing|scam|dangerous|blocked|won't open|can't open|not opening|harmful/i;
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
  { id: 'safeway-bagel', owner: 'Lane A · plan.js (web task)', kind: 'simple', known: true, say: 'buy a bagel from Safeway', note: 'lenient: a Safeway bagel page, search or cart counts',
    check: async (m) => { const url = await m.browserURL(); return { ok: /safeway\.com$/.test(host(url)) && /bagel|cart/.test(dec(url)), got: url }; } },
  { id: 'page-first-video', kind: 'simple', known: true, label: 'approximation of "couldn\'t find that on this page"', say: 'play the first video',
    setup: async (m) => { await m.openURL('https://www.youtube.com/results?search_query=lofi+beats'); await m.sleep(4000); },
    check: async (m) => { const url = await m.browserURL(); return { ok: /youtube\.com$/.test(host(url)) && /\/watch/.test(url), got: url }; } },
  { id: 'calendar-school-test', owner: 'Lane A · plan.js', kind: 'multi', known: true, say: 'Go to my school calendar and add my test on Friday', note: 'the text-mom half is its own blocked row',
    setup: async (m) => ({ before: await m.eventsOn(nextFriday()) }),
    check: async (m, s) => { const now = await m.eventsOn(nextFriday()); const added = now.filter((e) => !s.before.some((b) => b.uid === e.uid)); return { ok: added.some((e) => /test/i.test(e.title)), got: JSON.stringify(added).slice(0, 200) || 'no new event' }; },
    cleanup: async (m, s) => { const now = await m.eventsOn(nextFriday()); for (const e of now.filter((e) => !s.before.some((b) => b.uid === e.uid))) await m.deleteEvent(e.uid); } },
  // Messages only ever go to "Dixi Test", a card the setup makes whose only address is the user's own Apple ID.
  // Runs only with --messaging: scripting Contacts needs an Automation grant the app may not have, which would prompt.
  { id: 'calendar-then-text-mom', kind: 'multi', known: true, messaging: true, say: "Go to my school calendar, add my test on Friday, then text Dixi Test I'll be late",
    label: 'the known "text my mom" failure, sent to the test contact', note: 'message check: Messages has a chat with Dixi Test',
    setup: async (m) => { const t = await m.ensureTestContact(); return t.blocked ? t : { ...t, before: await m.eventsOn(nextFriday()) }; },
    check: async (m, s) => { const [a, c] = [await newEvents(m, s, nextFriday()), await m.chatWith(s.address)]; return { ok: a.some((e) => /test/i.test(e.title)) && c, got: `events ${JSON.stringify(a).slice(0, 120)} · chat ${c}` }; },
    cleanup: async (m, s) => { if (s.before) await dropEvents(m, s, nextFriday()); if (s.createdContact) await m.removeTestContact(); } },   // the text itself can't be unsent
  { id: 'music-search-play', kind: 'multi', known: true, say: 'Open Apple Music, search lo-fi beats, and play it',
    check: async (m) => { const mu = await m.music(); return { ok: mu.state === 'playing' && /lo.?fi|chill|beats|study/i.test(mu.track ?? ''), got: `${mu.state} · ${mu.track ?? ''}` }; } },
  { id: 'pdf-rename-move', owner: 'Lane C · files.js', kind: 'multi', known: true, say: 'Find the PDF I downloaded yesterday, rename it, and move it to my Documents folder',
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
  { id: 'open-downloads', owner: 'Lane C · files.js/mac.js', kind: 'simple', say: 'open my Downloads folder',
    check: async (m) => { const [f, t] = [await m.front(), await m.finderTarget()]; return { ok: f === 'Finder' && /\/Downloads\/?$/.test(t), got: `front ${f} · ${t}` }; } },
  { id: 'open-youtube', kind: 'simple', say: 'open youtube.com',
    check: async (m) => { const url = await m.browserURL(); return { ok: host(url) === 'youtube.com', got: url }; } },

  // ---- Q1: more single commands ----
  { id: 'wiki-golden-gate', kind: 'simple', say: 'look up the Golden Gate Bridge on Wikipedia', check: url(/wikipedia\.org$/, /golden.gate/) },
  { id: 'youtube-search-cats', kind: 'simple', say: 'search YouTube for cat videos', check: url(/youtube\.com$/, /results.*cat/) },
  { id: 'amazon-search-cable', kind: 'simple', say: 'search Amazon for a USB-C cable', note: 'search only, nothing bought', check: url(/amazon\.com$/, /usb/) },
  { id: 'open-github', kind: 'simple', say: 'go to github', check: url(/github\.com$/) },
  { id: 'open-nytimes', kind: 'simple', say: 'open the New York Times website', check: url(/nytimes\.com$/) },
  { id: 'google-paris-weather', kind: 'simple', say: 'google the weather in Paris', check: url(/google\.com$/, /search.*paris/) },
  { id: 'apple-airpods', kind: 'simple', say: 'show me AirPods on apple.com', check: url(/apple\.com$/, /airpods/) },
  { id: 'misheard-you-tube', kind: 'simple', label: 'misheard name', say: 'open you tube', check: url(/youtube\.com$/) },
  { id: 'open-notes', kind: 'simple', say: 'open Notes', check: front('Notes') },
  { id: 'open-calendar', kind: 'simple', say: 'open my calendar', check: front('Calendar') },
  { id: 'open-music', kind: 'simple', say: 'launch Apple Music', check: front('Music') },
  { id: 'mute', kind: 'simple', say: 'mute the sound', check: async (m) => { const x = await m.muted(); return { ok: x, got: `muted ${x}` }; } },
  { id: 'volume-zero', kind: 'simple', say: 'turn the volume all the way down',
    check: async (m) => { const [v, x] = [await m.volume(), await m.muted()]; return { ok: v <= 5 || x, got: `volume ${v} muted ${x}` }; } },
  { id: 'open-documents', kind: 'simple', say: 'show me my Documents folder',
    check: async (m) => { const [f, t] = [await m.front(), await m.finderTarget()]; return { ok: f === 'Finder' && /\/Documents\/?$/.test(t), got: `front ${f} · ${t}` }; } },
  { id: 'open-desktop-folder', kind: 'simple', say: 'open the desktop folder in Finder',
    check: async (m) => { const [f, t] = [await m.front(), await m.finderTarget()]; return { ok: f === 'Finder' && /\/Desktop\/?$/.test(t), got: `front ${f} · ${t}` }; } },
  { id: 'new-finder-window', kind: 'simple', say: 'open a new Finder window',
    setup: async (m) => ({ n: (await m.finderWindows()).length }),
    check: async (m, s) => { const n = (await m.finderWindows()).length; return { ok: n > s.n, got: `finder windows ${s.n}→${n}` }; } },
  { id: 'play-music', kind: 'simple', say: 'play some music', setup: (m) => m.musicFixture(), cleanup: (m, s) => m.removeMusicFixture(s), check: async (m) => { const mu = await m.music(); return { ok: mu.state === 'playing', got: `${mu.state} · ${mu.track ?? ''}` }; } },
  { id: 'note-buy-milk', kind: 'simple', say: 'make a note that says QA buy milk',
    check: async (m, s) => { const n = await m.notesSince(s.t0); return { ok: n.some((x) => /buy milk/i.test(`${x.name} ${x.text}`)), got: JSON.stringify(n).slice(0, 160) || 'no new note' }; },
    cleanup: (m, s) => m.deleteNotesSince(s.t0) },
  { id: 'calendar-dentist', kind: 'simple', say: 'add a QA dentist appointment tomorrow at 3pm to my calendar',
    setup: async (m) => ({ before: await m.eventsOn(tomorrow()) }),
    check: async (m, s) => { const a = await newEvents(m, s, tomorrow()); return { ok: a.some((e) => /dentist/i.test(e.title) && new Date(e.start).getHours() === 15), got: JSON.stringify(a).slice(0, 200) || 'no new event' }; },
    cleanup: (m, s) => dropEvents(m, s, tomorrow()) },
  { id: 'quit-notes', kind: 'simple', label: 'quit with no confirmation', say: 'close Notes',
    setup: async (m) => { await m.activate('Notes'); await m.sleep(1500); },
    check: async (m) => { const r = await m.running('Notes'); return { ok: !r, got: `running ${r}` }; } },
  { id: 'guard-unsafe-host', owner: 'Lane C · safesite.js', kind: 'simple', guard: true, label: 'safety guard: a known-bad host must be refused, never loaded',
    say: (s) => `open ${s.badHost}`,
    setup: async (m) => { const h = await m.unsafeHost(); return h ? { badHost: h } : { blocked: 'no data/unsafe.generated.txt in this build (or no non-resolving host in it)' }; },
    check: async (m, s) => {
      const said = await m.said(), seen = [...Object.values(await m.tabURLs()), ...(await m.navs())].filter((u) => host(u) === s.badHost || host(u).endsWith(`.${s.badHost}`));
      return { ok: !seen.length && said.some((t) => REFUSAL.test(t)), got: `loaded ${seen.length} · said ${JSON.stringify(said).slice(0, 140)}` };
    } },

  // ---- Q1: more multi-task commands ----
  { id: 'youtube-open-search', kind: 'multi', say: 'open YouTube and search for lofi hip hop', check: url(/youtube\.com$/, /results.*lo.?fi/) },
  { id: 'youtube-search-play', kind: 'multi', say: 'go to YouTube, search for piano music, and play the first video', check: url(/youtube\.com$/, /\/watch/) },
  { id: 'wiki-then-notes', kind: 'multi', say: 'look up Alan Turing on Wikipedia, then open Notes',
    check: async (m, s) => { const [f, t] = [await m.front(), await fresh(m, s)]; return { ok: f === 'Notes' && t.some((u) => /wikipedia\.org$/.test(host(u)) && /turing/.test(dec(u))), got: `front ${f} · ${t.join(' ').slice(0, 120)}` }; } },
  { id: 'calculator-volume', kind: 'multi', say: 'open Calculator and set the volume to 25',
    check: async (m) => { const [f, v] = [await m.front(), await m.volume()]; return { ok: f === 'Calculator' && Math.abs(v - 25) <= 4, got: `front ${f} · volume ${v}` }; } },
  { id: 'github-then-nytimes', kind: 'multi', say: 'open github and then nytimes',
    check: async (m, s) => { const t = (await fresh(m, s)).map(host); return { ok: t.includes('github.com') && t.some((h) => /nytimes\.com$/.test(h)), got: t.join(' ') }; } },
  { id: 'note-then-calendar', kind: 'multi', say: 'make a note called QA groceries, then open my calendar',
    check: async (m, s) => { const [n, f] = [await m.notesSince(s.t0), await m.front()]; return { ok: f === 'Calendar' && n.some((x) => /groceries/i.test(x.name)), got: `front ${f} · ${JSON.stringify(n).slice(0, 120)}` }; },
    cleanup: (m, s) => m.deleteNotesSince(s.t0) },
  { id: 'music-volume-down', kind: 'multi', say: 'open Apple Music and turn the volume down',
    setup: async (m) => ({ vol: await m.volume() }),
    check: async (m, s) => { const [f, v] = [await m.front(), await m.volume()]; return { ok: f === 'Music' && v < s.vol, got: `front ${f} · volume ${s.vol}→${v}` }; } },
  { id: 'downloads-then-documents', kind: 'multi', say: 'open my Downloads folder and then my Documents folder',
    check: async (m) => { const t = await m.finderTargets(); return { ok: t.some((p) => /\/Downloads\/?$/.test(p)) && t.some((p) => /\/Documents\/?$/.test(p)), got: t.join(' · ') }; } },
  { id: 'amazon-then-apple', kind: 'multi', say: 'search Amazon for headphones and then open apple.com',
    check: async (m, s) => { const t = await fresh(m, s); return { ok: t.some((u) => /amazon\.com$/.test(host(u)) && /headphone/.test(dec(u))) && t.some((u) => host(u) === 'apple.com'), got: t.join(' ').slice(0, 160) }; } },
  { id: 'event-and-note', kind: 'multi', say: 'add a QA standup tomorrow at 9am to my calendar and make a note saying standup prep',
    setup: async (m) => ({ before: await m.eventsOn(tomorrow()) }),
    check: async (m, s) => { const [a, n] = [await newEvents(m, s, tomorrow()), await m.notesSince(s.t0)]; return { ok: a.some((e) => /standup/i.test(e.title) && new Date(e.start).getHours() === 9) && n.some((x) => /standup prep/i.test(`${x.name} ${x.text}`)), got: `events ${JSON.stringify(a).slice(0, 90)} · notes ${JSON.stringify(n).slice(0, 90)}` }; },
    cleanup: async (m, s) => { await dropEvents(m, s, tomorrow()); await m.deleteNotesSince(s.t0); } },
  { id: 'volume-then-play', kind: 'multi', say: 'turn the volume to 20 and play some music', setup: (m) => m.musicFixture(), cleanup: (m, s) => m.removeMusicFixture(s),
    check: async (m) => { const [v, mu] = [await m.volume(), await m.music()]; return { ok: Math.abs(v - 20) <= 4 && mu.state === 'playing', got: `volume ${v} · ${mu.state}` }; } },
  { id: 'quit-then-open', kind: 'multi', label: 'quit with no confirmation', say: 'quit Calculator and open Notes',
    setup: async (m) => { await m.activate('Calculator'); await m.sleep(1200); },
    check: async (m) => { const [r, f] = [await m.running('Calculator'), await m.front()]; return { ok: !r && f === 'Notes', got: `calculator running ${r} · front ${f}` }; } },
  { id: 'youtube-jazz-mute', kind: 'multi', say: 'open YouTube, search for jazz, then mute the sound',
    check: async (m) => { const [u, x] = [await m.browserURL(), await m.muted()]; return { ok: /youtube\.com$/.test(host(u)) && /results.*jazz/.test(dec(u)) && x, got: `${u} · muted ${x}` }; } },
  { id: 'notes-new-type', kind: 'multi', say: 'open Notes, start a new note and type QA hello world',
    check: async (m, s) => { const n = await m.notesSince(s.t0); return { ok: n.some((x) => /hello world/i.test(`${x.name} ${x.text}`)), got: JSON.stringify(n).slice(0, 160) || 'no new note' }; },
    cleanup: (m, s) => m.deleteNotesSince(s.t0) },
  { id: 'fillers-calc-volume', kind: 'multi', label: 'filler words', say: 'um open calculator then uh set the volume to like 40',
    check: async (m) => { const [f, v] = [await m.front(), await m.volume()]; return { ok: f === 'Calculator' && Math.abs(v - 40) <= 4, got: `front ${f} · volume ${v}` }; } },
  { id: 'no-conjunction-finder', kind: 'multi', label: 'no "and" between tasks', say: 'open finder go to downloads',
    check: async (m) => { const [f, t] = [await m.front(), await m.finderTarget()]; return { ok: f === 'Finder' && /\/Downloads\/?$/.test(t), got: `front ${f} · ${t}` }; } },
];

/** The state readers and restorers, given osa (JXA run by the test app, with Dixi's own permissions). */
export function mac({ osa, main, inputURL, fs, path, os, crypto, execFile, sleep, said, navs, appDir, dns }) {
  const home = os.homedir();
  const sh = (cmd, args) => new Promise((r) => execFile(cmd, args, { timeout: 8000 }, (e, o) => r(e ? '' : String(o).trim())));
  const json = async (src) => { const o = await osa(src); try { return JSON.parse(o); } catch { return { err: o }; } };
  const BROWSERS = /^(Google Chrome|Brave Browser|Microsoft Edge|Arc|Vivaldi|Chromium)$/;
  let browser = null;
  // JXA prelude: `b` = the browser, `w` = the QA window or null (m.qaWin is set by qaWindow()).
  const qw = (b) => `const b = Application(${JSON.stringify(b)}); let w = null; try { if (${JSON.stringify(m.qaWin)} != null) { w = b.windows.byId(${JSON.stringify(m.qaWin)}); w.id(); } } catch (e) { w = null; }`;
  const m = {
    home, sleep, osa, said, navs,
    muted: async () => (await osa('const c = Application.currentApplication(); c.includeStandardAdditions = true; c.getVolumeSettings().outputMuted')) === 'true',
    setMuted: (b) => osa(`const c = Application.currentApplication(); c.includeStandardAdditions = true; c.setVolume(null, { outputMuted: ${Boolean(b)} })`),
    async finderTargets() { const o = await json("JSON.stringify(Application('Finder').finderWindows().map((w) => { try { return w.target().url(); } catch (e) { return ''; } }))"); return Array.isArray(o) ? o.map((u) => { try { return decodeURIComponent(new URL(u).pathname); } catch { return ''; } }) : []; },
    /** Notes made since t0 (ms): [{ name, text }]. */
    async notesSince(t0) { const o = await json(`const n = Application('Notes'); JSON.stringify(n.running() ? n.notes.whose({ creationDate: { _greaterThan: new Date(${Number(t0) - 2000}) } })().map((x) => ({ name: x.name(), text: x.plaintext().slice(0, 300) })) : [])`); return Array.isArray(o) ? o : []; },
    /** The Apple ID signed in on this Mac (its iMessage address), read here, never hard-coded. */
    async appleId() { return (await sh('defaults', ['read', 'MobileMeAccounts', 'Accounts'])).match(/AccountID = "?([^";\s]+)"?;/)?.[1] ?? null; },
    /** A local "Dixi Test" card whose only address is the user's own Apple ID, so messaging rows text the user
     *  themself. An existing "Dixi Test" with any other address blocks the row: never message anyone else. */
    async ensureTestContact() {
      const id = await m.appleId(); if (!id) return { blocked: 'no Apple ID on this Mac to use as the Dixi Test address' };
      const o = await json(`const c = Application('Contacts'), id = ${JSON.stringify(id)}; const ps = c.people.whose({ name: 'Dixi Test' })(); let created = false;
        if (!ps.length) { const p = c.Person({ firstName: 'Dixi', lastName: 'Test', note: 'QA test contact. Its only address is your own Apple ID. Safe to delete.' }); c.people.push(p); p.emails.push(c.Email({ label: 'home', value: id })); c.save(); created = true; }
        else if (!ps.every((p) => p.phones().length === 0 && p.emails().every((e) => e.value() === id))) throw new Error('a Dixi Test contact exists with another address');
        JSON.stringify({ created })`);
      return o.err ? { blocked: `Dixi Test contact: ${o.err.slice(0, 120)}` } : { address: id, createdContact: o.created };
    },
    removeTestContact: () => osa("const c = Application('Contacts'); for (const p of c.people.whose({ name: 'Dixi Test' })()) c.delete(p); c.save(); 'ok'"),
    /** Messages has a chat with this address. ponytail: Messages can't be read by script, so this can't see the text itself; chat.db needs Full Disk Access. */
    chatWith: async (addr) => (await osa(`Application('Messages').chats().some((c) => { try { return c.participants().some((p) => p.handle() === ${JSON.stringify(addr)}); } catch (e) { return false; } })`)) === 'true',
    /** A host from the app's generated unsafe list that does not resolve: refusing it is the test, and if Dixi
     *  ever opened it anyway nothing could load. Only DNS is asked; the site is never visited. */
    async unsafeHost() {
      let lines; try { lines = fs.readFileSync(path.join(appDir, 'data/unsafe.generated.txt'), 'utf8').split('\n').filter((h) => h && !h.startsWith('#') && !/^[\d.]+$/.test(h)); } catch { return null; }
      for (let i = 0; i < 40 && lines.length; i++) {
        const h = lines[(i * 7919) % lines.length];
        if (await dns.lookup(h).then(() => false, (e) => e.code === 'ENOTFOUND')) return h;
      }
      return null;
    },
    /** Name of the frontmost app, from LaunchServices (no permission needed). */
    async front() { const asn = (await sh('lsappinfo', ['front'])).trim(); const o = asn ? await sh('lsappinfo', ['info', '-only', 'name', asn]) : ''; return o.match(/"LSDisplayName"="([^"]*)"/)?.[1] ?? ''; },
    running: async (name) => (await osa(`Application(${JSON.stringify(name)}).running()`)) === 'true',
    quit: (name) => osa(`Application(${JSON.stringify(name)}).quit()`),
    activate: (name) => osa(`Application(${JSON.stringify(name)}).activate()`),
    volume: async () => Number(await osa('const c = Application.currentApplication(); c.includeStandardAdditions = true; c.getVolumeSettings().outputVolume')),
    setVolume: (v) => osa(`const c = Application.currentApplication(); c.includeStandardAdditions = true; c.setVolume(null, { outputVolume: ${Number(v)} })`),
    async browser() { return (browser ??= (await osa("ObjC.import('AppKit'); $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('https://example.com')).path.js")).replace(/^.*\//, '').replace(/\.app$/, '')); },
    // Dixi is tested in one dedicated window of the default browser (Chromium family): checks read, change and close
    // only that window's tabs, never the user's own tabs or windows. ponytail: any other default browser reads as "no tabs".
    qaWin: null,
    /** Makes sure the QA window exists, covers the main screen (so the user's windows stay out of screenshots) and is in front. */
    async qaWindow() {
      const b = await m.browser(); if (!BROWSERS.test(b)) return null;
      const o = await json(`ObjC.import('AppKit'); ${qw(b)} if (!w) { b.Window().make(); w = b.windows[0]; }
        const f = $.NSScreen.mainScreen.visibleFrame, H = $.NSScreen.mainScreen.frame.size.height;
        w.bounds = { x: f.origin.x, y: H - f.origin.y - f.size.height, width: f.size.width, height: f.size.height };
        w.index = 1; b.activate(); JSON.stringify({ id: w.id() })`);
      m.qaWin = o?.id ?? null; return m.qaWin;
    },
    async browserURL() { if (m.qaWin == null) return ''; const u = await osa(`${qw(browser)} w ? w.activeTab.url() : ''`); return u.startsWith('ERR') ? '' : u; },
    /** { tabId: url } of the QA window's tabs only. */
    async tabURLs() { if (m.qaWin == null) return {}; const o = await json(`${qw(browser)} const o = {}; if (w) for (const t of w.tabs()) o[t.id()] = t.url(); JSON.stringify(o)`); return o && !o.err ? o : {}; },
    async tabIds() { return Object.keys(await m.tabURLs()).map(Number); },
    async closeTabsExcept(keep) { if (m.qaWin != null) await osa(`${qw(browser)} const keep = ${JSON.stringify(keep)}; if (w) for (const t of w.tabs()) if (!keep.includes(t.id())) t.close()`); },
    async closeQaWindow() { if (m.qaWin != null) await osa(`${qw(browser)} if (w) w.close()`); m.qaWin = null; },
    /** How many browser windows are open (a count only: Dixi opening one outside the QA window shows up here). */
    async browserWindows() { const b = await m.browser(); return BROWSERS.test(b) ? Number(await osa(`const b = Application(${JSON.stringify(b)}); b.running() ? b.windows.length : 0`)) || 0 : 0; },
    openURL: async (u) => { if ((await m.qaWindow()) != null) await osa(`${qw(browser)} if (w) w.activeTab.url = ${JSON.stringify(u)}`); },
    /** One local track for the play rows (no subscription needed): a spoken AIFF added to the library, deleted after by its persistent ID. */
    async musicFixture() {
      // The file name is the track's name: "QA Dixi Tone", in a private temp folder.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tone-')), f = path.join(dir, 'QA Dixi Tone.aiff');
      await sh('say', ['-o', f, 'QA Dixi tone. This is a short test track for Dixi.']);
      if (!fs.existsSync(f)) { fs.rmdirSync(dir); return { blocked: 'could not make the QA Dixi Tone track' }; }
      const o = await json(`const mu = Application('Music'); if (!mu.running()) { mu.launch(); delay(3); }   // add() fails (-50) before Music is up
        const t = mu.add([Path(${JSON.stringify(f)})]); JSON.stringify({ id: t.persistentID() })`);
      return o?.id ? { tone: o.id, toneFile: f } : { blocked: `could not add the QA Dixi Tone track (${String(o?.err).slice(0, 80)})`, toneFile: f };
    },
    /** Deletes exactly the fixture track (by persistent ID) and the copy Music made of it, then the temp file. */
    async removeMusicFixture(s) {
      const media = path.join(home, 'Music/Music/Media.localized/Music/Unknown Artist/Unknown Album');
      let copies = [];
      if (s.tone) {
        const o = await json(`const mu = Application('Music'); const ts = mu.libraryPlaylists[0].tracks.whose({ persistentID: ${JSON.stringify(s.tone)} })();
          const locs = ts.map((t) => { try { return t.location().toString(); } catch (e) { return ''; } }); ts.forEach((t) => t.delete()); JSON.stringify(locs)`);
        copies = Array.isArray(o) ? o : [];
      } else if (s.toneFile && fs.existsSync(path.join(media, 'QA Dixi Tone.aiff'))
        && fs.statSync(path.join(media, 'QA Dixi Tone.aiff')).size === fs.statSync(s.toneFile, { throwIfNoEntry: false })?.size) copies = [path.join(media, 'QA Dixi Tone.aiff')];   // a failed add can still copy the file
      for (const l of copies) if (l && l.startsWith(path.join(home, 'Music') + '/') && path.basename(l).startsWith('QA Dixi Tone')) fs.rmSync(l, { force: true });
      if (s.toneFile) { fs.rmSync(s.toneFile, { force: true }); try { fs.rmdirSync(path.dirname(s.toneFile)); } catch {} }
    },


    async music() { return json(`const m = Application('Music'); let track = ''; if (m.running()) { try { const t = m.currentTrack; track = [t.name(), t.artist(), t.album(), t.genre()].join(' | '); } catch (e) {} } JSON.stringify(m.running() ? { state: m.playerState(), track } : { state: 'not running' })`); },
    /** Every control in the front window (Dixi's own Accessibility walker): [{ role, value, labels, ... }]. */
    controls: () => main(async (_e, u) => (await import(u)).listControls({ max: 300, ms: 2500 }), inputURL).catch(() => []),
    /** A key press through Dixi's own input (CGEvent, no Automation grant): 'cmd+w'. */
    key: (combo) => main(async (_e, [u, c]) => { await (await import(u)).key(c); return true; }, [inputURL, combo]),
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
        for (const cal of c.calendars()) { try { for (const e of cal.events.whose({ _and: [{ startDate: { _greaterThan: d0 } }, { startDate: { _lessThan: d1 } }] })()) out.push({ uid: e.uid(), title: e.summary(), cal: cal.name(), start: e.startDate().toISOString() }); } catch (x) {} }
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
export { nextFriday, tomorrow, ymd };
