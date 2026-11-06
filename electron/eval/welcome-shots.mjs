// Screenshots of the first-run window (the real main/welcome.js + page + preload, fake permission status),
// one per step → docs/ui/welcome-*.png. Never on screen; capturePage reads that window only.
//   env -u ELECTRON_RUN_AS_NODE npx electron eval/welcome-shots.mjs
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWelcome } from '../src/main/welcome.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../docs/ui');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keys = { ask: '⌥Space', mic: '⌘⌥Space' };
let perms = { mic: 'not-determined', screen: 'denied', ax: false, automation: null };

app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.dock?.hide();
setTimeout(() => app.exit(2), 45000).unref();
app.whenReady().then(async () => {
  const win = openWelcome({ here: path.join(root, 'src/main'), status: async () => ({ ...perms, keys }), openPane: async () => {} });
  win.removeAllListeners('ready-to-show');   // never on screen
  const wc = win.webContents;
  await new Promise((r) => wc.once('did-finish-load', r));
  const steps = [['mic', perms], ['ax', { mic: 'granted', screen: 'granted', ax: false, automation: null }], ['try', { mic: 'granted', screen: 'granted', ax: true, automation: true }]];
  for (const [name, p] of steps) {
    perms = p;
    await wc.executeJavaScript('window.dispatchEvent(new Event("focus"))');   // the page re-checks status on focus
    await sleep(2600);   // and every 2 s
    fs.writeFileSync(path.join(out, `welcome-${name}.png`), (await wc.capturePage(undefined, { stayHidden: true })).toPNG());
    console.log(`welcome-${name}.png`);
  }
  app.exit(0);
});
