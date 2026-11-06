// The first-run window: walks through the Mac permissions. The lead injects status() and openPane(pane),
// so this file only owns the window and its four checked IPC channels.
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { BrowserWindow, ipcMain } = electron;

const here = path.dirname(fileURLToPath(import.meta.url));
const PANES = new Set(['mic', 'screen', 'ax', 'automation']);

/** Normalizes raw macOS answers to what welcome.js reads: mic/screen are the status string, ax/automation a boolean (automation null = never asked). */
export const permStatus = ({ mic, screen, ax, automation } = {}) => ({
  mic: typeof mic === 'string' ? mic : 'unknown',
  screen: typeof screen === 'string' ? screen : 'unknown',
  ax: ax === true,
  automation: automation === true ? true : automation === false ? false : null,
});

const w = { win: null, hooked: false, h: {} };

export function openWelcome({ here: _here, say = () => {}, status, openPane, onDone = () => {} }) {
  w.h = { say, status, openPane, onDone };
  if (w.win && !w.win.isDestroyed()) { w.win.show(); w.win.focus(); return w.win; }
  const mine = (e) => Boolean(w.win) && !w.win.isDestroyed() && e.sender === w.win.webContents;
  if (!w.hooked) {
    w.hooked = true;
    ipcMain.handle('welcome:status', async (e) => { if (!mine(e)) return null; const s = await w.h.status(); return { ...permStatus(s), keys: s?.keys }; });
    ipcMain.handle('welcome:open', async (e, pane) => { if (mine(e) && PANES.has(pane)) await w.h.openPane(pane); });
    ipcMain.on('welcome:say', (e, text) => { if (mine(e) && typeof text === 'string') w.h.say(text.slice(0, 400)); });
    ipcMain.on('welcome:done', (e) => { if (mine(e)) { const win = w.win; setTimeout(() => win.close(), 0); w.h.onDone(); } });
  }
  const win = new BrowserWindow({ width: 520, height: 640, center: true, title: 'Set up Dixi', show: false, titleBarStyle: 'hiddenInset', backgroundColor: '#0a0a0a', fullscreenable: false, minimizable: false,
    webPreferences: { preload: path.join(_here ?? here, '../preload/welcome.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.setContentProtection(true);
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (w.win === win) w.win = null; });
  win.loadFile(path.join(_here ?? here, '../renderer/everywhere/welcome.html'));
  w.win = win;
  return win;
}
