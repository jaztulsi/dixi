// Screenshots of the island, every state, notch and pill, over a light and a dark desktop → docs/ui/.
// Offscreen: the real overlay.html + preload render in a window that is never on screen, and capturePage
// reads that window only (never your screen). It also logs thinking's first frame and idle CPU.
//   env -u ELECTRON_RUN_AS_NODE npx electron eval/island-shots.mjs
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../docs/ui');
const W = 1470, H = 956, NOTCH = { w: 179, h: 32 };   // this MacBook Air's display and notch (notch.js)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATES = {
  listening: { state: 'listening', text: 'open my resume and email it to' },
  thinking: { state: 'thinking', text: 'open my resume and email it to Sam' },
  acting: { state: 'acting', title: 'Dixi is on it', steps: [{ label: 'Attaching Resume.pdf in Mail', state: 'running' }] },
  done: { state: 'done', title: 'Moved', text: 'Moved Resume.pdf to Documents', undo: true },
  error: { state: 'error', title: 'Dixi', text: "Couldn't reach Safari. Try again in a moment." },
  'done-card': { state: 'done', title: 'Next meeting', text: 'Your next meeting is Design review at 3:30 with Priya and Tom, in the 4th floor room. You have 40 minutes until then.' },
};
// Shot-only stand-ins drawn under the transparent overlay: a desktop, a menu bar, and the hardware notch.
const desk = (theme, notch) => `(() => { const d = document.createElement('div'); d.id = 'desk';
  d.style.cssText = 'position:fixed;inset:0;z-index:-1;background:${theme === 'light' ? '#e9e9ee' : '#1b1b1f'}';
  d.innerHTML = '<div style="height:${notch ? NOTCH.h : 24}px;background:${theme === 'light' ? 'rgba(255,255,255,.75)' : 'rgba(40,40,44,.85)'}"></div>${notch ? `<div style="position:absolute;top:0;left:${(W - NOTCH.w) / 2}px;width:${NOTCH.w}px;height:${NOTCH.h}px;background:#000;border-radius:0 0 9px 9px"></div>` : ''}';
  document.getElementById('desk')?.remove(); document.body.prepend(d); })()`;

app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.dock?.hide();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, preload: path.join(root, 'src/preload/everywhere.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await w.loadFile(path.join(root, 'src/renderer/everywhere/overlay.html'));
  const wc = w.webContents;
  const frame = () => wc.executeJavaScript('new Promise((r) => requestAnimationFrame(() => r()))');
  const send = (ch, data) => wc.send(ch, data);
  send('ew:prefs', {});
  const shots = [];
  for (const notch of [true, false]) for (const theme of ['light', 'dark']) {
    send('ew:notch', notch ? NOTCH : null);
    await wc.executeJavaScript(desk(theme, notch));
    for (const [name, s] of Object.entries(STATES)) {
      send('ew:state', { state: 'idle' });
      await sleep(260);
      send('ew:state', s);
      if (s.state === 'listening') for (const v of [0.3, 0.7, 0.5]) { send('ew:level', v); await sleep(70); }
      await sleep(320);   // every transition is 200 ms or less
      const file = `island-${notch ? 'notch' : 'pill'}-${theme}-${name}.png`;
      fs.writeFileSync(path.join(out, file), (await wc.capturePage({ x: W / 2 - 260, y: 0, width: 520, height: 210 })).toPNG());
      shots.push(file);
    }
  }
  // thinking: IPC → the frame that shows the shimmer (must be under 200 ms)
  const t = [];
  for (let i = 0; i < 9; i++) {
    send('ew:state', { state: 'idle' }); await sleep(260);
    const t0 = performance.now();
    send('ew:state', { state: 'thinking', text: 'x' });
    await wc.executeJavaScript(`new Promise((r) => { const f = () => getComputedStyle(document.querySelector('.shimmer')).display === 'block' ? requestAnimationFrame(() => r()) : requestAnimationFrame(f); f(); })`);
    t.push(performance.now() - t0);
  }
  // listening: IPC → "Listening…" fully shown (the row's opacity reaches 1)
  const l = [];
  for (let i = 0; i < 9; i++) {
    send('ew:state', { state: 'idle' }); await sleep(260);
    const t0 = performance.now();
    send('ew:state', { state: 'listening' });
    await wc.executeJavaScript(`new Promise((r) => { const f = () => getComputedStyle(document.querySelector('.row')).opacity === '1' && !document.querySelector('#pill').hidden ? r() : requestAnimationFrame(f); f(); })`);
    l.push(performance.now() - t0);
  }
  l.sort((a, b) => a - b);
  // idle CPU of the overlay's renderer, 3 s after it went idle
  send('ew:state', { state: 'idle' });
  await sleep(1000);
  const pid = wc.getOSProcessId();
  const cpu = () => app.getAppMetrics().find((m) => m.pid === pid)?.cpu.percentCPUUsage ?? NaN;
  cpu(); await sleep(3000);
  const idle = cpu();
  send('ew:state', STATES.thinking); await sleep(500); cpu(); await sleep(2000);
  const thinking = cpu();
  t.sort((a, b) => a - b);
  console.log(JSON.stringify({ shots: shots.length, dir: path.relative(path.resolve(root, '..'), out), thinkingFirstFrameMs: { p50: +t[4].toFixed(1), max: +t[8].toFixed(1) }, listeningFullMs: { p50: +l[4].toFixed(1), max: +l[8].toFixed(1) }, cpuPercent: { idle: +idle.toFixed(2), thinking: +thinking.toFixed(2) } }));
  app.exit(0);
});
