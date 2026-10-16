// Runic main process: window, keys, and every network call that needs a key.
// The renderer (UI + agents) never sees an API key: Groq and Deepgram calls go through IPC here.

import { app, BrowserWindow, ipcMain, session, shell, systemPreferences, webContents } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { groqChat } from './groq.js';
import { DeepgramBridge } from './deepgram.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

// Voice-opened videos must play without a real user click (same fix as the Swift app's WebKit setting).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// End-to-end tests: play a WAV file as the microphone (RUNIC_FAKE_AUDIO=/path/to.wav).
if (process.env.RUNIC_FAKE_AUDIO) {
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${process.env.RUNIC_FAKE_AUDIO}%noloop`);
  // The sandboxed audio service can't read the file; run it in-process for tests only.
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox');
}

// One window, one app: a runic:// link from the website focuses it instead of opening another copy.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let pendingURL = null;
const deepgram = new DeepgramBridge(config.deepgramAPIKey, (channel, data) => win?.webContents.send(channel, data));

function createWindow() {
  win = new BrowserWindow({
    title: 'Runic',
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 500,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  win.loadFile(path.join(here, '../renderer/index.html'));
  win.on('closed', () => { win = null; deepgram.close(); });
  win.webContents.on('did-finish-load', () => {
    if (pendingURL) { win.webContents.send('app:open-url', pendingURL); pendingURL = null; }
  });
}

// runic:// deep links (website "Launch Runic" button). They only focus/prefill, never run a task.
function handleDeepLink(url) {
  if (!url?.startsWith('runic://')) return;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('app:open-url', url);
  } else {
    pendingURL = url;
  }
}
app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });           // macOS
app.on('second-instance', (_e, argv) => handleDeepLink(argv.find(a => a.startsWith('runic://')))); // Windows/Linux

app.whenReady().then(() => {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('runic', process.execPath, [path.resolve(process.argv[1] ?? '.')]);
  } else {
    app.setAsDefaultProtocolClient('runic');
  }

  // Microphone: only the Runic UI may use it, never the websites inside the tabs.
  // Ask, but don't wait: blocking here would delay the window (and hang automated tests).
  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone').catch(() => false);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && wc.getURL().startsWith('file://'));
  });
  session.fromPartition('persist:runic-tabs').setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
  });

  createWindow();
  handleDeepLink(process.argv.find(a => a.startsWith('runic://')));
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win) createWindow(); });

// ---- IPC: everything that needs a key or main-process powers ----

ipcMain.handle('config:get', () => ({
  hasGroqKey: Boolean(config.groqAPIKey),
  hasDeepgramKey: Boolean(config.deepgramAPIKey),
  agentModel: config.agentModel,
  voiceModel: config.voiceModel,
}));

ipcMain.handle('groq:chat', (_e, body) => groqChat(config, body));

ipcMain.handle('deepgram:open', (_e, params) => deepgram.open(params));
ipcMain.on('deepgram:audio', (_e, chunk) => deepgram.sendAudio(chunk));
ipcMain.on('deepgram:control', (_e, message) => deepgram.sendControl(message));
ipcMain.handle('deepgram:close', () => deepgram.close());

// Screenshots for the agent when it's stuck: small JPEG, same as the Swift app (~640pt wide).
ipcMain.handle('tab:screenshot', async (_e, webContentsId) => {
  const wc = webContents.fromId(webContentsId);
  if (!wc) return null;
  const image = await wc.capturePage();
  const small = image.resize({ width: Math.min(1280, image.getSize().width) });
  return small.toJPEG(50).toString('base64');
});

ipcMain.handle('shell:open-external', (_e, url) => {
  if (/^https?:\/\//.test(url)) return shell.openExternal(url);
});
