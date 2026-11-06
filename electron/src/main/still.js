// Idle CPU (checkpoint, Nov 6): a window you aren't looking at kept the mascot's CSS blink compositing at 60 fps.
// The hidden main window cost +3.3 % and an open dashboard +~12 %. While a window is hidden, minimized or in the
// background, every CSS animation is paused; focus resumes them. Windows that never take focus (the island) are
// left alone: they animate while you talk.
const STILL = '*,*::before,*::after{animation-play-state:paused!important}';
export function stillWhenAway(w) {
  if (!w.isFocusable()) return;
  const wc = w.webContents;
  let key = null, q = Promise.resolve();
  const set = (still) => { q = q.then(async () => {
    if (wc.isDestroyed()) return;
    if (still && !key) key = await wc.insertCSS(STILL);
    else if (!still && key) { await wc.removeInsertedCSS(key); key = null; }
  }).catch(() => {}); return q; };
  wc.on('did-finish-load', () => { key = null; set(!w.isVisible() || !w.isFocused()); });   // a new page drops inserted CSS
  for (const ev of ['blur', 'hide', 'minimize']) w.on(ev, () => set(true));
  w.on('focus', () => set(false));
}
