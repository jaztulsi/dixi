// Mouse, keyboard and "what is under this point" for Dixi Everywhere, with no native addon: JXA
// (osascript -l JavaScript) calls CoreGraphics and the macOS Accessibility API. Clicking, typing and
// reading other apps' controls need the Accessibility permission (System Settings → Privacy & Security).

import { execFile, execFileSync } from 'node:child_process';
import { findApp } from './mac.js';

// C3: nothing may stay pressed. `kids` are the osascript processes posting events right now; `held` is what they pressed
// and haven't let go yet (id → JXA line that lets go). If a press is cut short (timeout, the kill switch, quit, a crash),
// stopAll() kills the posters and releases every held key and button.
const kids = new Set();
const held = new Map();
const keyUp = (code) => `$.CGEventPost(0, $.CGEventCreateKeyboardEvent(null, ${Number(code)}, false));`;
const mouseUp = ({ x, y }) => `$.CGEventPost(0, $.CGEventCreateMouseEvent(null, 2, {x: ${Number(x)}, y: ${Number(y)}}, 0));`;
const run = (args, timeout = 5000) => new Promise((resolve, reject) => {
  const c = execFile(args[0], args.slice(1), { timeout }, (err, out) => { kids.delete(c); return err ? reject(err) : resolve(String(out).trim()); });
  kids.add(c);
});
/** Runs one press while it's tracked: released for sure if it fails or is cut short. */
const pressing = (id, release, p) => { held.set(id, release); return p.then((v) => { held.delete(id); return v; }, async (e) => { await releaseAll(); throw e; }); };

/** Lets go of every key and mouse button Dixi still holds. sync for process exit, when nothing async can run. */
export function releaseAll({ sync = false } = {}) {
  if (!held.size) return Promise.resolve(false);
  const args = ['-l', 'JavaScript', '-e', `ObjC.import('CoreGraphics'); ${[...held.values()].join(' ')}`];
  held.clear();
  if (sync) { try { execFileSync('osascript', args, { timeout: 3000 }); } catch {} return Promise.resolve(true); }
  return new Promise((r) => execFile('osascript', args, { timeout: 3000 }, () => r(true)));
}
/** The kill switch and quit: stop every event poster mid-way, then release what they held. */
export function stopAll({ sync = false } = {}) {
  for (const c of kids) { try { c.kill('SIGKILL'); } catch {} }
  kids.clear();
  return releaseAll({ sync });
}
process.once('exit', () => stopAll({ sync: true }));   // a crash or a quit: nothing keeps pressing after Dixi is gone
// Arguments go in as JSON (valid JS), never spliced into the script as text.
const jxa = (body, args = {}, timeout) => run(['osascript', '-l', 'JavaScript', '-e', `ObjC.import('CoreGraphics'); ObjC.import('ApplicationServices'); const A = ${JSON.stringify(args)}; ${body}`], timeout);

const FLAGS = { shift: 0x20000, ctrl: 0x40000, control: 0x40000, alt: 0x80000, option: 0x80000, opt: 0x80000, cmd: 0x100000, command: 0x100000, super: 0x100000, meta: 0x100000, win: 0x100000 };
// macOS virtual key codes (ANSI layout). Names as the computer-use model writes them (xdotool style).
const KEYS = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, '=': 24, 9: 25, 7: 26, '-': 27, 8: 28, 0: 29, ']': 30, o: 31, u: 32, '[': 33,
  i: 34, p: 35, l: 37, j: 38, "'": 39, k: 40, ';': 41, '\\': 42, ',': 43, '/': 44, n: 45, m: 46, '.': 47, '`': 50,
  return: 36, enter: 36, kp_enter: 76, tab: 48, space: 49, backspace: 51, escape: 53, esc: 53, delete: 117,
  home: 115, end: 119, page_up: 116, pageup: 116, prior: 116, page_down: 121, pagedown: 121, next: 121,
  left: 123, right: 124, down: 125, up: 126,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};

/** "cmd+shift+t" → { code, flags }; null for a key this map doesn't know. */
export function parseKey(combo) {
  const parts = String(combo).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
  const key = parts.pop();
  const code = KEYS[key] ?? KEYS[key?.replace(/^kp_/, '')];
  if (code == null) return null;
  return { code, flags: parts.reduce((f, m) => f | (FLAGS[m] ?? 0), 0) };
}
const modFlags = (text) => String(text ?? '').toLowerCase().split('+').reduce((f, m) => f | (FLAGS[m.trim()] ?? 0), 0);

const MOUSE = { left: [1, 2, 0], right: [3, 4, 1], middle: [25, 26, 2] };  // [down, up, button]
/** One click (count 2 = double, 3 = triple) at a screen point, with optional modifier keys ("shift"). */
export function click({ x, y }, { button = 'left', count = 1, mods = '' } = {}) {
  const [down, up, btn] = MOUSE[button] ?? MOUSE.left;
  return jxa(`const p = {x: A.x, y: A.y};
    $.CGEventPost(0, $.CGEventCreateMouseEvent(null, 5, p, 0));
    for (let n = 1; n <= A.count; n++) for (const t of [A.down, A.up]) {
      const e = $.CGEventCreateMouseEvent(null, t, p, A.btn);
      $.CGEventSetIntegerValueField(e, 1, n);
      if (A.flags) $.CGEventSetFlags(e, A.flags);
      $.CGEventPost(0, e);
    }`, { x, y, count, down, up, btn, flags: modFlags(mods) });
}
export const move = ({ x, y }) => jxa('$.CGEventPost(0, $.CGEventCreateMouseEvent(null, 5, {x: A.x, y: A.y}, 0));', { x, y });
export const mouseButton = ({ x, y }, down) => {
  const p = jxa('$.CGEventPost(0, $.CGEventCreateMouseEvent(null, A.t, {x: A.x, y: A.y}, 0));', { x, y, t: down ? 1 : 2 });
  if (!down) return p.then((v) => { held.delete('mouse'); return v; });
  held.set('mouse', mouseUp({ x, y }));   // stays held until the matching up (or stopAll)
  return p.catch(async (e) => { await releaseAll(); throw e; });
};
export function drag(from, to) {
  return pressing('drag', mouseUp(to), jxa(`const post = (t, p) => $.CGEventPost(0, $.CGEventCreateMouseEvent(null, t, p, 0));
    post(5, A.a); post(1, A.a);
    for (let i = 1; i <= 10; i++) { post(6, {x: A.a.x + (A.b.x - A.a.x) * i / 10, y: A.a.y + (A.b.y - A.a.y) * i / 10}); delay(0.02); }
    post(2, A.b);`, { a: from, b: to }));
}
/** Wheel clicks; direction up/down/left/right. Moves to the point first when one is given. */
export function scroll(at, direction, amount = 3) {
  const n = Math.max(1, Math.min(30, Math.round(amount)));
  const dy = direction === 'up' ? n : direction === 'down' ? -n : 0;
  const dx = direction === 'left' ? n : direction === 'right' ? -n : 0;
  return jxa(`if (A.at) $.CGEventPost(0, $.CGEventCreateMouseEvent(null, 5, A.at, 0));
    $.CGEventPost(0, $.CGEventCreateScrollWheelEvent2(null, 1, 2, A.dy, A.dx, 0));`, { at, dx, dy });
}
export function key(combo, { repeat = 1, holdSecs = 0 } = {}) {
  const k = parseKey(combo);
  if (!k) return Promise.reject(new Error(`unknown key "${combo}"`));
  const reps = Math.max(1, Math.min(100, repeat)), hold = Math.max(0, Math.min(5, holdSecs));
  // The timeout covers every hold, so it never cuts a press in half (and if anything else does, pressing() lets go).
  return pressing(`key${k.code}`, keyUp(k.code), jxa(`for (let i = 0; i < A.repeat; i++) for (const down of [true, false]) {
      const e = $.CGEventCreateKeyboardEvent(null, A.code, down);
      if (A.flags) $.CGEventSetFlags(e, A.flags);
      $.CGEventPost(0, e);
      if (down && A.hold) delay(A.hold);
    }`, { ...k, repeat: reps, hold }, 15000 + reps * hold * 1000));
}
/** Types text by pasting it (any language, emoji, any length), then puts your clipboard back (every format). */
export async function type(text) {
  const [{ clipboard }, { pasteText }] = await Promise.all([import('electron'), import('./capture.js')]);   // loaded here so the unit tests can import this file under plain Node
  await pasteText({ clipboard, key, text });
}
export async function cursor() { const [x, y] = (await jxa('const p = $.CGEventGetLocation($.CGEventCreate(null)); [Math.round(p.x), Math.round(p.y)].join(",")')).split(',').map(Number); return { x, y }; }

// ---- reading the screen's controls (Accessibility API) ----
const AX_HELPERS = `
  function attr(el, name) { const r = Ref(); return $.AXUIElementCopyAttributeValue(el, $(name), r) === 0 ? r[0] : null; }
  // An element read from an attribute (parent, window, focus) must go back in as an object: passed on as
  // the raw ref, the next AX call throws ("Ref has incompatible type"), so nothing could ever be read.
  function elAttr(el, name) { const v = attr(el, name); return v ? ObjC.castRefToObject(v) : null; }
  function str(el, name) { const v = attr(el, name); if (!v) return ''; try { const s = ObjC.unwrap(ObjC.castRefToObject(v)); return typeof s === 'string' ? s.slice(0, 120) : ''; } catch (e) { return ''; } }
  function kids(el, max = 12) { const v = attr(el, 'AXChildren'); if (!v) return []; try { const a = ObjC.castRefToObject(v); const out = []; for (let i = 0; i < Math.min(max, Number(a.count)); i++) out.push(a.objectAtIndex(i)); return out; } catch (e) { return []; } }
  // Where a control is: AXPosition/AXSize read from their descriptions ("x:812.0 y:64.0", "w:90.0 h:22.0").
  function frame(el) {
    try {
      const d = (n) => { const v = attr(el, n); return v ? String(ObjC.unwrap(ObjC.castRefToObject(v).description)) : ''; };
      const p = d('AXPosition').match(/x:(-?[\\d.]+)\\s+y:(-?[\\d.]+)/), s = d('AXSize').match(/w:([\\d.]+)\\s+h:([\\d.]+)/);
      return p && s ? { x: +p[1], y: +p[2], w: +s[1], h: +s[2] } : null;
    } catch (e) { return null; }
  }
  function describe(el) {
    if (!el) return null;
    const pr = Ref(); $.AXUIElementGetPid(el, pr);   // whose control it is (Dixi never presses its own)
    const out = { role: str(el, 'AXRole'), subrole: str(el, 'AXSubrole'), value: str(el, 'AXValue'), pid: Number(pr[0]) || 0, labels: [] };
    // The words you actually see on a control (its text children), not only the name it claims: a web
    // page can name a visible "Pay now" button "Close" (aria-label), and the gate reads each label alone.
    const seen = (e, depth) => { for (const k of kids(e)) { const t = str(k, 'AXValue') || str(k, 'AXTitle'); if (str(k, 'AXRole') === 'AXStaticText' && t && !out.labels.includes(t)) out.labels.push(t); if (depth) seen(k, depth - 1); } };
    if (/^AX(Button|Link|MenuItem|MenuButton|PopUpButton|CheckBox|RadioButton|Cell)$/.test(out.role)) { try { seen(el, 0); } catch (e) {} }
    let cur = el;
    for (let i = 0; i < 4 && cur; i++) {   // the control itself, then the buttons/links around a label
      for (const n of ['AXTitle', 'AXDescription', 'AXValue', 'AXHelp']) { const s = str(cur, n); if (s && !out.labels.includes(s)) out.labels.push(s); }
      if (out.labels.length && i > 0) break;
      // Only text or a picture inside a control borrows the control's name; a button never takes its
      // window's title (an unnamed close button is not called "Inbox").
      if (i === 0 && /^AX(Button|Link|MenuItem|MenuButton|PopUpButton|CheckBox|RadioButton|Tab|TextField|TextArea|ComboBox|SearchField|Slider|MenuBarItem|DisclosureTriangle)$/.test(out.role)) break;
      cur = elAttr(cur, 'AXParent');
    }
    return out;
  }`;
/** The control at a screen point: { role, subrole, labels[] }, or null when it can't be read. */
export async function elementAt({ x, y }) {
  try {
    const out = await jxa(`${AX_HELPERS}
      const sys = $.AXUIElementCreateSystemWide(); const r = Ref();
      JSON.stringify($.AXUIElementCopyElementAtPosition(sys, A.x, A.y, r) === 0 ? describe(r[0]) : null);`, { x, y });
    return JSON.parse(out);
  } catch { return null; }
}
/** The focused control (where typing goes): { role, subrole, labels[] }, or null. */
export async function focused() {
  try {
    const { pid } = await frontApp();
    return JSON.parse(await jxa(`${AX_HELPERS}
      const el = elAttr(A.pid ? $.AXUIElementCreateApplication(A.pid) : $.AXUIElementCreateSystemWide(), 'AXFocusedUIElement');
      JSON.stringify(el ? describe(el) : null);`, { pid }));
  } catch { return null; }
}
// ---- "click Send" with no model: find the control by its name in the window in front, then press it ----
// The window's controls, breadth first, as a path of child indexes (an element can't outlive one script).
const PRESSABLE = 'AX(Button|Link|MenuItem|MenuButton|PopUpButton|CheckBox|RadioButton|Tab|DisclosureTriangle)';
const WALK = `${AX_HELPERS}
  // The app in front by its pid (lsappinfo): the system-wide "focused application" often fails (-25204).
  function front() { const app = $.AXUIElementCreateApplication(A.pid); return elAttr(app, 'AXFocusedWindow') || elAttr(app, 'AXMainWindow'); }
  function at(path) { let el = front(); for (const i of path) { if (!el) return null; el = kids(el, 400)[i] ?? null; } return el; }`;
/** Controls in the front window named `name` (title, description or visible text; a shortcut in brackets
 *  after the name doesn't count: "Go Back (⌃-)" is "Go Back"): up to 3, each
 *  { role, subrole, labels, path }. [] when there's none, or the tree can't be read. */
export async function findControls(name) {
  try {
    return JSON.parse(await jxa(`${WALK}
      const want = A.name.toLowerCase(); const plain = (l) => l.trim().toLowerCase().replace(/\\s*\\([^)]*\\)$/, ''); const hits = []; const queue = [[front(), []]]; let seen = 0;
      const t0 = Date.now();
      while (queue.length && seen < 3000 && hits.length < 3 && Date.now() - t0 < 1200) {
        const [el, path] = queue.shift(); if (!el) continue; seen++;
        if (new RegExp('^${PRESSABLE}$').test(str(el, 'AXRole'))) {
          const d = describe(el);
          if (d.labels.some((l) => plain(l) === want)) hits.push({ ...d, path, frame: frame(el) });
        }
        kids(el, 400).forEach((k, i) => queue.push([k, [...path, i]]));
      }
      JSON.stringify(hits);`, { name: String(name).slice(0, 80), pid: (await frontApp()).pid }, 4000));
  } catch { return []; }
}
/** The text showing in an app's first window, breadth first within a time budget: to check a page really
 *  loaded (it needn't be in front). [] when it isn't running or can't be read. */
export async function windowTexts(app, { max = 400, ms = 800 } = {}) {
  try {
    const pid = Number(String(await run(['pgrep', '-x', String(app)])).trim().split('\n')[0]);
    return JSON.parse(await jxa(`${AX_HELPERS}
      const w = kids($.AXUIElementCreateApplication(A.pid), 20).find((e) => str(e, 'AXRole') === 'AXWindow');
      const out = []; const queue = w ? [w] : []; const t0 = Date.now();
      while (queue.length && out.length < A.max && Date.now() - t0 < A.ms) {
        const el = queue.shift();
        if (str(el, 'AXRole') === 'AXStaticText') { const t = str(el, 'AXValue') || str(el, 'AXTitle'); if (t) out.push(t); }
        queue.push(...kids(el, 400));
      }
      JSON.stringify(out);`, { pid, max, ms }, 3000));
  } catch { return []; }
}
/** Press the control at `path`, only if it still carries the same labels (the screen can change between
 *  finding it and your yes). A text box is focused instead. 'ok'; 'gone' (changed or not there);
 *  'nopress' (it's there but won't take a press: click its centre instead). */
export async function pressControl(path, labels) {
  try {
    return await jxa(`${WALK}
      const el = at(A.path); const d = el && describe(el);
      if (!d || JSON.stringify(d.labels) !== JSON.stringify(A.labels)) 'gone';
      else if (/^AX(TextField|TextArea|ComboBox|SearchField)$/.test(d.role)) $.AXUIElementSetAttributeValue(el, $('AXFocused'), $.kCFBooleanTrue) === 0 ? 'ok' : 'nopress';
      else $.AXUIElementPerformAction(el, $('AXPress')) === 0 ? 'ok' : 'nopress';`, { path, labels, pid: (await frontApp()).pid });
  } catch { return 'gone'; }
}
// What the model is shown, like the browser's element list: the window's controls, numbered. Breadth
// first within a time budget (a big web page has thousands of nodes); a button's insides aren't walked.
const LISTED = 'AX(Button|Link|MenuItem|MenuButton|PopUpButton|CheckBox|RadioButton|Tab|DisclosureTriangle|TextField|TextArea|ComboBox|SearchField|Slider|Cell|MenuBarItem)';
/** The front window's controls: [{ role, subrole, value, labels, path, frame }], at most `max`. */
export async function listControls({ max = 120, ms = 1500 } = {}) {
  try {
    return JSON.parse(await jxa(`${WALK}
      const t0 = Date.now(); const out = []; const queue = [[front(), []]]; const re = new RegExp('^${LISTED}$');
      while (queue.length && out.length < A.max && Date.now() - t0 < A.ms) {
        const [el, path] = queue.shift(); if (!el) continue;
        const role = str(el, 'AXRole');
        if (re.test(role)) {
          const f = frame(el);
          if (!f || (f.w > 1 && f.h > 1)) out.push({ ...describe(el), path, frame: f });
          if (role !== 'AXCell') continue;
        }
        kids(el, 200).forEach((k, i) => queue.push([k, [...path, i]]));
      }
      JSON.stringify(out);`, { max, ms, pid: (await frontApp()).pid }, ms + 5000));
  } catch { return []; }
}

// ---- A2: into a text box without guessing, and a paste that's checked ----
const EDITABLE = /^AX(TextField|TextArea|SearchField|ComboBox)$/;
export const isEditable = (el) => Boolean(el) && EDITABLE.test(el.role ?? '');
// What a box is for, best first: where you write to someone or something, then a search. The browser's own
// address bar is never "the box" (Cmd+L is for that).
const BOX = [/\b(prompt|ask|message|chat|reply|write|type|compose)\b/i, /\b(search|query|comment|find)\b/i];
const ADDRESS = /\b(address|url|location)\b/i;
// Keys a site documents for "go to the box"; what worked on a site is tried first next time.
const SITE_KEYS = { 'youtube.com': '/', 'github.com': '/', 'google.com': '/', 'chatgpt.com': 'shift+escape' };
const learned = new Map();   // ponytail: per run of Dixi; save it to userData if relearning each run costs
const siteOf = (where) => { try { return new URL(where).hostname.replace(/^www\./, ''); } catch { return String(where ?? ''); } };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
/** The cheapest way to a text box in the front window, checked after each: already in one (no click) → the
 *  box by role and name (AX focus, no pointer) → the app's AX tree switched on, read again → a key the site
 *  answers to. At most 2 tries. → { ok, how, el } | { ok: false, why }. `skip`: ways already tried. */
export async function focusField({ where = '', name = 'text', want = BOX, skip = [] } = {}, d = {}) {
  const { now = focused, list = listControls, press = pressControl, enable = enableAX, send = key, front = frontApp, wait = nap } = d;
  const f0 = await now();
  if (!skip.length && isEditable(f0)) return { ok: true, how: 'focused', el: f0 };
  const site = siteOf(where), seed = Object.entries(SITE_KEYS).find(([h]) => site === h || site.endsWith(`.${h}`))?.[1];
  const landed = async () => { for (let i = 0; i < 4; i++) { const f = await now(); if (isEditable(f)) return f; await wait(80); } return null; };
  let empty = false;
  const ways = {
    async ax() {
      const all = await list({ max: 200, ms: 600 }); empty = !all.length;
      const boxes = all.filter((b) => isEditable(b) && !b.labels.some((l) => ADDRESS.test(l)));
      const rank = (b) => want.findIndex((re) => b.labels.some((l) => re.test(l)));
      const named = boxes.filter((b) => rank(b) >= 0).sort((a, b) => rank(a) - rank(b));
      const pick = boxes.length === 1 ? boxes[0] : named[0];
      return pick && (await press(pick.path, pick.labels)) === 'ok' ? landed() : null;
    },
    async enable() {   // no tree: Chrome/Electron build it once asked; read until it's there (~1 s at most)
      if (!empty) return undefined;
      await enable((await front()).pid, { again: true });
      for (let i = 0; i < 5; i++) { const el = await ways.ax(); if (el || !empty) return el; await wait(200); }
      return null;
    },
    async key() { const k = learned.get(site)?.key ?? seed; if (!k) return undefined; await send(k); return landed(); },
  };
  const order = [learned.get(site)?.how, 'ax', 'enable', 'key'].filter((w, i, a) => w && ways[w] && a.indexOf(w) === i && !skip.includes(w));
  let tries = 0;
  for (const how of order) {
    if (tries === 2) break;
    const el = await ways[how]();
    if (el === undefined) continue;   // that way doesn't apply here: no try spent
    tries++;
    if (el) { if (site) learned.set(site, { how, key: how === 'key' ? (learned.get(site)?.key ?? seed) : undefined }); return { ok: true, how, el }; }
  }
  return { ok: false, why: `Couldn't find the ${name} input.` };
}
/** The focused box's whole value, read for a check: { role, len, has } (has: `text` is in it). */
export async function fieldHas(text) {
  try {
    return JSON.parse(await jxa(`${AX_HELPERS}
      const el = elAttr($.AXUIElementCreateApplication(A.pid), 'AXFocusedUIElement'); let s = '';
      try { const v = el && attr(el, 'AXValue'); s = v ? String(ObjC.unwrap(ObjC.castRefToObject(v))) : ''; } catch (e) {}
      const flat = (x) => x.replace(/\\s+/g, ' ').trim();
      JSON.stringify({ role: el ? str(el, 'AXRole') : '', read: Boolean(el && attr(el, 'AXValue') != null), len: s.length, has: Boolean(A.text) && flat(s).includes(flat(A.text).slice(0, 80)) });`, { pid: (await frontApp()).pid, text: String(text ?? '') }));
  } catch { return { role: '', read: false, len: 0, has: false }; }
}
/** Paste into the box, then check it landed; nothing changed → one more way to the box, once. */
export async function pasteChecked(text, { where, name, how = 'focused', before } = {}, d = {}) {
  const { paste = type, has = fieldHas, focus = focusField } = d;
  before ??= await has(text);   // (the caller can read it alongside focused(): one AX round trip fewer)
  await paste(text);
  let after = await has(text);
  // Nothing readable after the paste (a canvas, a custom control, or focus moved on): said so, never
  // claimed, and never pasted a second time.
  const landed = () => after.has || after.len !== before.len;
  if (after.read === false) return { ok: true, checked: false };
  if (!landed()) {
    const r = await focus({ where, name, skip: [how] }, d);
    if (r.ok) { before = await has(text); await paste(text); after = await has(text); }   // (the new box's own before)
    if (after.read === false) return { ok: true, checked: false };
    if (!r.ok || !landed()) return { ok: false, why: `The text didn't show up in the ${name} input.` };
  }
  return { ok: true, checked: true };
}
/** Chromium and Electron apps build their accessibility tree only when asked: ask, once per app. */
const askedAX = new Set();
export function enableAX(pid, { again = false } = {}) {
  if (!pid || (askedAX.has(pid) && !again)) return Promise.resolve();
  askedAX.add(pid);
  return jxa('$.AXUIElementSetAttributeValue($.AXUIElementCreateApplication(A.pid), $("AXManualAccessibility"), $.kCFBooleanTrue);', { pid }).catch(() => {});
}

// ---- which app you're in (no permission needed) and the page it shows (asks once per browser) ----
/** The process behind a pid (its path), for who owns a point that isn't the front app's. */
export async function procName(pid) { try { return (await run(['/bin/ps', '-p', String(pid), '-o', 'comm='])).trim(); } catch { return ''; } }
export async function frontApp() {
  try {
    const out = await run(['/bin/sh', '-c', 'lsappinfo info -only name -only bundleid -only pid "$(lsappinfo front)"']);
    const get = (k) => out.match(new RegExp(`"${k}"="?([^"\\n]*)`))?.[1] ?? '';
    return { name: get('LSDisplayName'), bundle: get('CFBundleIdentifier'), pid: Number(get('pid')) || 0 };
  } catch { return { name: '', bundle: '', pid: 0 }; }
}
const CHROMIUM = /^(Google Chrome|Google Chrome Beta|Brave Browser|Microsoft Edge|Arc|Chromium|Vivaldi|Opera)$/;
export async function browserTab(appName) {
  const script = CHROMIUM.test(appName) ? `tell application "${appName}" to get {URL, title} of active tab of front window`
    : appName === 'Safari' ? 'tell application "Safari" to get {URL, name} of current tab of front window' : null;
  if (!script) return null;
  try {
    const out = await run(['osascript', '-e', script], 3000);
    const i = out.indexOf(', ');
    return i > 0 ? { url: out.slice(0, i), title: out.slice(i + 2) } : null;
  } catch { return null; }   // no Automation permission yet, or no window
}
/** macOS's own launcher: "open Spotify"; else the installed app the words mean ("my calendar"). False when there's none. */
export async function openApp(name) {
  const open = (n) => run(['open', '-a', n]).then(() => true, () => false);
  if (await open(String(name))) return true;
  const a = await findApp(name).catch(() => null);
  return Boolean(a) && open(a.path);
}
