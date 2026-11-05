// Where the camera notch is, per display, so the island can grow out of it (MASTER Phase 5).
// NSScreen via JXA (macOS 12+): safeAreaInsets.top > 0 means a notch, and its width is what the two
// menu-bar areas beside it leave. If JXA fails: a menu bar taller than 30 pt (notch Macs 32-38, others 24).
import { execFile } from 'node:child_process';

const JXA = `ObjC.import('AppKit'); JSON.stringify(ObjC.unwrap($.NSScreen.screens).map((s) => ({ x: s.frame.origin.x, w: s.frame.size.width,
  top: s.safeAreaInsets.top, notch: s.safeAreaInsets.top > 0 ? s.frame.size.width - s.auxiliaryTopLeftArea.size.width - s.auxiliaryTopRightArea.size.width : 0 })))`;

/** → [{ x, w, top, notch }] in points, one per NSScreen; [] when it can't be read. */
export const readScreens = () => new Promise((resolve) => {
  execFile('osascript', ['-l', 'JavaScript', '-e', JXA], { timeout: 3000 }, (err, out) => { try { resolve(err ? [] : JSON.parse(out)); } catch { resolve([]); } });
});

/** The notch on an Electron display as { w, h } in points, or null (no notch: the island is a pill). */
export function notchOf(display, screens = []) {
  if (!display) return null;
  const s = screens.find((x) => Math.round(x.x) === display.bounds.x && Math.round(x.w) === display.bounds.width);
  if (s) return s.top > 0 && s.notch > 0 ? { w: Math.round(s.notch), h: Math.round(s.top) } : null;
  const bar = display.workArea.y - display.bounds.y;
  return bar > 30 ? { w: 180, h: bar } : null;   // ponytail: without NSScreen the width is a guess (180 pt, this MBA reads 179)
}
