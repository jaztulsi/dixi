// Capture harness (free, offline): a WAV plays as the microphone (Chromium fake capture), the real mic.js
// pipeline records it with the given processing, and the 16 kHz audio it would send to STT is written out.
//   electron eval/capture/main.cjs <in.wav> <out.wav> <secs> <ec,ns,agc as 0/1>
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const [inWav, outWav, secs, flags] = process.argv.slice(-4);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox');   // the sandboxed audio service can't read the WAV
app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${path.resolve(inWav)}%noloop`);
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(true));
  const w = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  ipcMain.once('done', (_e, { pcm, info }) => {
    const s = Buffer.from(pcm), h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + s.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(s.length, 40);
    fs.writeFileSync(outWav, Buffer.concat([h, s]));
    fs.writeFileSync(outWav + '.json', JSON.stringify(info));
    app.quit();
  });
  w.loadFile(path.join(__dirname, 'page.html'), { query: { secs, flags, cold: process.env.COLD ?? '0' } });
});
