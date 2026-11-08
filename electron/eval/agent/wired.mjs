// The ⌥Space path end to end, with nothing on the Mac touched: everywhere.js's run() → the agent (real Haiku via the SDK)
// → Dixi's real tool code, with the Mac's hands faked (keys, typing, clicks, opening, AppleScript and desktop controls are
// recorded, not done). Reading (AX, Spotlight, Bash read-only) is real. Speech is captured, never played.
// node eval/agent/wired.mjs [filter]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../../src/main/config.js';

const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/main');
const did = [];
globalThis.__did = did;
const names = [...fs.readFileSync(path.join(main, 'input.js'), 'utf8').matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
const fakeInput = 'data:text/javascript,' + encodeURIComponent(names.map((n) => `export const ${n} = (...a) => globalThis.__input.${n}(...a);`).join('\n'));
const fakeMac = 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(pathToFileURL(path.join(main, 'mac.js')).href)};
export const openTarget = async (a) => { globalThis.__did.push(['open', a]); if (a.url) globalThis.__tab = { url: a.url, title: '' }; return { ok: true }; };
export const runScript = async (a) => { globalThis.__did.push(['script', a.code.slice(0, 160)]); return { ok: true, out: /Calendar/i.test(a.code) ? 'Dentist, tomorrow 10:00 AM' : 'note id x-coredata://1' }; };
export const check = async () => true;`);
const fakeDesktop = 'data:text/javascript,' + encodeURIComponent(`export * from ${JSON.stringify(pathToFileURL(path.join(main, 'desktop.js')).href)};
export const exec = async (cmd, args) => { globalThis.__did.push(['desktop', [cmd, ...(args ?? [])].join(' ').slice(0, 120)]); return ''; };`);
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'electron') return { url: 'data:text/javascript,export default globalThis.__electron;', shortCircuit: true };
    const fromEw = ctx.parentURL?.endsWith('/src/main/everywhere.js');
    if (spec === './input.js' && fromEw) return { url: ${JSON.stringify(fakeInput)}, shortCircuit: true };
    if (spec === './mac.js' && fromEw) return { url: ${JSON.stringify(fakeMac)}, shortCircuit: true };
    if (spec === './desktop.js' && fromEw) return { url: ${JSON.stringify(fakeDesktop)}, shortCircuit: true };
    return next(spec, ctx);
  }`));

const any = () => new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : any()), apply: () => any(), construct: () => any() });
const toMain = [];
class Win { constructor() { this.webContents = { on() {}, once: (_e, fn) => fn(), send: (ch, d) => toMain.push([ch, d]), setWindowOpenHandler() {} }; } isDestroyed() { return false; } isVisible() { return true; } }
for (const m of ['setAlwaysOnTop', 'setVisibleOnAllWorkspaces', 'setIgnoreMouseEvents', 'setContentProtection', 'loadFile', 'setBounds', 'showInactive', 'hide', 'show']) Win.prototype[m] = () => {};
globalThis.__electron = new Proxy({
  BrowserWindow: Win,
  screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 2 }), getAllDisplays: () => [{ workArea: { x: 0, y: 25, width: 1440, height: 875 } }] },
  clipboard: { readText: () => '', writeText: () => {} },
  systemPreferences: { isTrustedAccessibilityClient: () => true, getMediaAccessStatus: () => 'granted' },
  globalShortcut: { register: () => true, unregister: () => {} },
  app: { on: () => {} },
}, { get: (t, k) => (k in t ? t[k] : any()) });

let front = { name: 'Safari', bundle: 'com.apple.Safari', pid: 4242 };
let tab = { url: 'https://en.wikipedia.org/wiki/Honey_bee', title: 'Honey bee - Wikipedia' };
const rec = (what) => async (...a) => { did.push([what, ...a]); return true; };
globalThis.__input = new Proxy({
  frontApp: async () => front, browserTab: async () => globalThis.__tab ?? tab, enableAX: async () => {},
  openApp: rec('openApp'), key: rec('key'), type: rec('type'), click: rec('click'),
  pasteChecked: async (t) => { did.push(['type', t]); return { ok: true }; },
  focused: async () => ({ role: 'AXTextArea', labels: [], pid: front.pid }), isEditable: () => true,
  fieldHas: async () => ({ read: true, len: 0, has: false }), procName: async () => front.name,
}, { get: (t, k) => t[k] ?? (async () => null) });

const config = loadConfig();
config.env = { ...config.env, DIXI_BRIDGE: '0' };
const { setupEverywhere } = await import('../../src/main/everywhere.js');
const handlers = {};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-wired-'));
setupEverywhere({ config, spend: { overFor: () => false, add() {}, addUSD() {}, over: false }, here: main, userData: dir, trashDir: path.join(dir, 'trash'),
  getMainWindow: () => new Win(), handle: (ch, fn) => { handlers[ch] = fn; }, on: () => {}, onShowMain() {}, webAnswer: async () => null });

const CASES = [
  { say: 'open you tube and search lo fi beats', ok: () => did.some(([w, a]) => w === 'open' && /youtube\.com\/results/.test(a?.url)) },
  { say: 'set the volume to 30', ok: () => did.some(([w, a]) => w === 'desktop' && /30/.test(a)) },
  { say: 'make a note called ideas that says try the new pasta place', ok: () => did.some(([w, a]) => w === 'script' && /Notes/.test(a) && /pasta/.test(a)) },
  { say: 'new tab', ok: () => did.some(([w, a]) => w === 'key' && /cmd\+t/i.test(a)) },
  { say: 'type hello world', setup: () => { front = { name: 'TextEdit', bundle: 'com.apple.TextEdit', pid: 4243 }; tab = null; }, ok: () => did.some(([w, a]) => w === 'type' && /hello world/i.test(a)) },
  { say: 'how much battery do i have', ok: (said) => /\d+\s*(%|percent)/i.test(said) },
  { say: "what's 15 percent of 80", ok: (said) => /\b(12|twelve)\b/i.test(said) },
  { say: 'find my resume', ok: (said) => said.length > 0 },
];
const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
await new Promise((r) => setTimeout(r, 9000));   // the warm-up at launch
let pass = 0, n = 0;
for (const c of CASES) {
  if (only && !only.test(c.say)) continue;
  n++; did.length = 0; toMain.length = 0; c.setup?.();
  const t0 = Date.now();
  await handlers['everywhere:run'](c.say);
  const said = toMain.filter(([ch]) => ch === 'everywhere:say').map(([, d]) => d).join(' ');
  const steps = toMain.filter(([ch, d]) => ch === 'ew:state' && d?.steps).map(([, d]) => d.steps.at(-1)?.label);
  const ok = Boolean(c.ok(said)); pass += ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(Date.now() - t0).padStart(6)}ms "${c.say}" → ${did.map(([w, a]) => `${w}:${JSON.stringify(a).slice(0, 70)}`).join(' | ') || '(nothing done)'} → said "${said.slice(0, 110)}"${steps.length ? ` · island: ${[...new Set(steps)].join(' / ').slice(0, 80)}` : ''}`);
}
console.log(`\n${pass}/${n} passed`);
process.exit(0);
