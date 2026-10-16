// Dixi main process: window, keys, and every network call that needs a key.
// The renderer (UI + agents) never sees an API key: Groq and Deepgram calls go through IPC here.

import { app, BrowserWindow, ipcMain, session, shell, systemPreferences, webContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { groqChat } from './groq.js';
import { DeepgramBridge } from './deepgram.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

// Voice-opened videos must play without a real user click (same fix as the Swift app's WebKit setting).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Hands-free: Dixi works while other apps are in front, so a covered window must not be paused.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// End-to-end tests: play a WAV file as the microphone (DIXI_FAKE_AUDIO=/path/to.wav).
if (process.env.DIXI_FAKE_AUDIO) {
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${process.env.DIXI_FAKE_AUDIO}%noloop`);
  // The sandboxed audio service can't read the file; run it in-process for tests only.
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox');
}

// One window, one app: a dixi:// link from the website focuses it instead of opening another copy.
// The app was called Runic. On the first launch as Dixi, carry its data folder over (settings, learned
// phrases, tab logins) so nothing is lost. The old names below are the only ones left on purpose.
{
  const legacy = path.join(app.getPath('appData'), 'Runic');
  const data = app.getPath('userData');
  if (!fs.existsSync(data) && fs.existsSync(legacy)) {
    fs.cpSync(legacy, data, { recursive: true, filter: (src) => !path.basename(src).startsWith('Singleton') });
    const tabs = path.join(data, 'Partitions');
    if (fs.existsSync(path.join(tabs, 'runic-tabs'))) fs.renameSync(path.join(tabs, 'runic-tabs'), path.join(tabs, 'dixi-tabs'));
  }
}
if (!app.requestSingleInstanceLock()) app.quit();

// ponytail: a short list of the heaviest ad/tracking hosts, not a full blocklist; add hosts as they show up.
const AD_URLS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com', 'googletagmanager.com',
  'googletagservices.com', 'adservice.google.com', 'imasdk.googleapis.com', 'amazon-adsystem.com', 'adnxs.com',
  'criteo.com', 'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'moatads.com', 'vdo.ai', 'lijit.com', 'gumgum.com',
].flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`])
  .concat(['*://www.youtube.com/pagead/*', '*://www.youtube.com/api/stats/ads*', '*://www.youtube.com/ptracking*']);

let win = null;
let pendingURL = null;
const deepgram = new DeepgramBridge(config.deepgramAPIKey, (channel, data) => win?.webContents.send(channel, data));

function createWindow() {
  win = new BrowserWindow({
    title: 'Dixi',
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

// dixi:// deep links (website "Launch Dixi" button). They only focus/prefill, never run a task.
function handleDeepLink(url) {
  if (!url?.startsWith('dixi://')) return;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('app:open-url', url);
  } else {
    pendingURL = url;
  }
}
app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });           // macOS
app.on('second-instance', (_e, argv) => handleDeepLink(argv.find(a => a.startsWith('dixi://')))); // Windows/Linux

app.whenReady().then(() => {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('dixi', process.execPath, [path.resolve(process.argv[1] ?? '.')]);
  } else {
    app.setAsDefaultProtocolClient('dixi');
  }

  // Microphone: only the Dixi UI may use it, never the websites inside the tabs.
  // Ask, but don't wait: blocking here would delay the window (and hang automated tests).
  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone').catch(() => false);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && wc.getURL().startsWith('file://'));
  });
  session.fromPartition('persist:dixi-tabs').setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write');
  });
  // Ads and trackers never load in the tabs: lighter pages render sooner (and nothing to "skip").
  session.fromPartition('persist:dixi-tabs').webRequest.onBeforeRequest({ urls: AD_URLS }, (_details, callback) => callback({ cancel: true }));

  createWindow();
  handleDeepLink(process.argv.find(a => a.startsWith('dixi://')));
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
