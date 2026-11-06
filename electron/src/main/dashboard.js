// The Dixi dashboard: your own voice commands, skills, what Dixi did, and settings, in one window.
// everywhere.js supplies `api`; this file owns the window and its IPC channels, which answer only the
// dashboard's own page.
import electron from 'electron';
import path from 'node:path';
const { BrowserWindow, ipcMain } = electron;

const d = { win: null, api: null, hooked: false };
const OPEN = /^(?:browser|setup|profile|tasks|pane:(?:mic|screen|ax|automation))$/;
const KEYS = new Set(['careful', 'allowSend', 'allowSpend', 'allowDelete', 'large', 'contrast', 'sounds']);

export function openDashboard({ here, api }) {
  d.api = api;
  if (d.win && !d.win.isDestroyed()) { d.win.show(); d.win.focus(); return d.win; }
  const mine = (e) => Boolean(d.win) && !d.win.isDestroyed() && e.sender === d.win.webContents;
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (mine(e) ? fn(...a) : null));
  if (!d.hooked) {
    d.hooked = true;
    handle('dash:get', () => d.api.state());
    handle('dash:save', (list) => d.api.saveCommands(list));
    handle('dash:test', (cmd) => d.api.testCommand(cmd));
    handle('dash:run', (text) => d.api.run(String(text ?? '').slice(0, 500)));
    handle('dash:apps', () => d.api.apps());
    handle('dash:skill:delete', (name) => d.api.deleteSkill(String(name ?? '').slice(0, 80)));
    handle('dash:set', (k, v) => (KEYS.has(k) ? d.api.set(k, Boolean(v)) : d.api.state()));
    ipcMain.on('dash:open', (e, what) => { if (mine(e) && OPEN.test(String(what))) d.api.open(String(what)); });
  }
  const win = new BrowserWindow({ width: 1100, height: 760, minWidth: 860, minHeight: 600, title: 'Dixi', show: false, titleBarStyle: 'hiddenInset', backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(here, '../preload/dashboard.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (d.win === win) d.win = null; });
  win.loadFile(path.join(here, '../renderer/dashboard/dashboard.html'));
  d.win = win;
  return win;
}

/** An open dashboard gets the new state when something changes (listening, careful mode, a watch…). */
export async function dashChanged() {
  if (!d.win || d.win.isDestroyed()) return;
  try { d.win.webContents.send('dash:changed', await d.api.state()); } catch {}
}
