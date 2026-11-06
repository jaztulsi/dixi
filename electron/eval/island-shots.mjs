// Screenshots of the overlay in every state: the bottom pill (default, over a light and a dark desktop with a
// Dock) and the island in the notch (menu bar setting) → docs/ui/.
// Offscreen: the real overlay.html + preload render in a window that is never on screen, and capturePage
// reads that window only (never your screen). It also logs thinking's first frame and idle CPU.
//   env -u ELECTRON_RUN_AS_NODE npx electron eval/island-shots.mjs
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../docs/ui');
const W = 1470, H = 956, NOTCH = { w: 179, h: 32 }, DOCK = 70;   // this MacBook Air's display, notch (notch.js) and Dock
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATES = {
  'listening-quiet': { state: 'listening' },
  listening: { state: 'listening', text: 'open my resume and email it to' },
  thinking: { state: 'thinking', text: 'open my resume and email it to Sam' },
  acting: { state: 'acting', title: 'Dixi is on it', steps: [{ label: 'Attaching Resume.pdf in Mail', state: 'running' }] },
  done: { state: 'done', title: 'Moved', text: 'Moved Resume.pdf to Documents', undo: true },
  error: { state: 'error', title: 'Dixi', text: "Couldn't reach Safari. Try again in a moment." },
  'done-card': { state: 'done', title: 'Next meeting', text: 'Your next meeting is Design review at 3:30 with Priya and Tom, in the 4th floor room. You have 40 minutes until then.' },
};
// Shot-only stand-ins drawn under the transparent overlay: a desktop, a menu bar, the hardware notch, a Dock.
// (Set through CSSOM: the overlay's CSP blocks style="" attributes.)
const desk = (theme, notch, dock) => {
  const light = theme === 'light';
  const parts = [`position:fixed;inset:0;z-index:-1;background:${light ? '#e9e9ee' : '#1b1b1f'}`,
    `position:absolute;top:0;left:0;right:0;height:${notch ? NOTCH.h : 24}px;background:${light ? 'rgba(255,255,255,.75)' : 'rgba(40,40,44,.85)'}`,
    notch && `position:absolute;top:0;left:${(W - NOTCH.w) / 2}px;width:${NOTCH.w}px;height:${NOTCH.h}px;background:#000;border-radius:0 0 9px 9px`,
    dock && `position:absolute;bottom:4px;left:${W / 2 - 300}px;width:600px;height:${DOCK - 8}px;border-radius:18px;background:${light ? 'rgba(255,255,255,.7)' : 'rgba(70,70,76,.7)'};box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)`].filter(Boolean);
  return `(() => { document.getElementById('desk')?.remove(); const d = document.createElement('div'); d.id = 'desk'; d.style.cssText = ${JSON.stringify(parts[0])};
    for (const css of ${JSON.stringify(parts.slice(1))}) { const e = document.createElement('div'); e.style.cssText = css; d.append(e); } document.body.prepend(d); })()`;
};

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
  for (const [place, theme] of [['pill', 'light'], ['pill', 'dark'], ['notch', 'dark']]) {
    const notch = place === 'notch';
    send('ew:prefs', { top: notch });
    send('ew:notch', NOTCH);
    send('ew:dock', notch ? 0 : DOCK);
    await wc.executeJavaScript(desk(theme, notch, !notch));
    for (const [name, s] of Object.entries(STATES)) {
      send('ew:state', { state: 'idle' });
      await sleep(260);
      send('ew:state', s);
      if (s.state === 'listening' && s.text) for (const v of [0.05, 0.2, 0.5, 0.35, 0.6, 0.25, 0.4]) { send('ew:level', v); await sleep(70); }
      await sleep(320);   // every transition is 200 ms or less
      const file = `island-${place}-${theme}-${name}.png`;
      const area = notch ? { x: W / 2 - 260, y: 0, width: 520, height: 210 } : { x: W / 2 - 300, y: H - 250, width: 600, height: 250 };
      fs.writeFileSync(path.join(out, file), (await wc.capturePage(area)).toPNG());
      shots.push(file);
    }
  }
  // thinking: IPC → the frame that shows the rippling waveform (must be under 200 ms)
  send('ew:prefs', {});
  const t = [];
  for (let i = 0; i < 9; i++) {
    send('ew:state', { state: 'idle' }); await sleep(260);
    const t0 = performance.now();
    send('ew:state', { state: 'thinking', text: 'x' });
    await wc.executeJavaScript(`new Promise((r) => { const f = () => getComputedStyle(document.querySelector('.wave')).display === 'flex' ? requestAnimationFrame(() => r()) : requestAnimationFrame(f); f(); })`);
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
