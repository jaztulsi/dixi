import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Samples the real rendered background (marble, images, glass) under every text box and checks WCAG contrast
// against the text's computed color. Also reports the bright/dark share of each viewport-height screen.
// ponytail: p5/p95 of the background ignores grain and single-pixel vein specks; tighten to min/max if needed.

const VIEWPORTS = [
  [1440, 900],
  [1024, 768],
  [390, 844],
  [320, 640],
] as const;

type Box = { x: number; y: number; w: number; h: number; rgba: number[]; large: boolean; text: string };
// Sample inside rounded corners: a pill's corners show the page behind it, not the pill.

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

for (const [width, height] of VIEWPORTS) {
  test(`contrast ${width}x${height}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // static layout: nothing pinned, no demo loop
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Lazy images must be loaded before we sample what's behind the text.
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    });

    const boxes: Box[] = await page.evaluate(() => {
      const out: Box[] = [];
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      for (const el of document.querySelectorAll<HTMLElement>('main *, footer *')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!own) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (cs.position === 'absolute' && cs.clip !== 'auto') continue; // sr-only
        const rgba = parse(cs.color);
        if (rgba.length === 3) rgba.push(1);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight) >= 700;
        const inset = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.height / 2);
        out.push({
          x: r.left + scrollX + inset,
          y: r.top + scrollY + (inset ? r.height * 0.2 : 0),
          w: r.width - 2 * inset,
          h: r.height * (inset ? 0.6 : 1),
          rgba,
          large: size >= 24 || (size >= 18.66 && bold),
          text: el.textContent!.trim().slice(0, 48),
        });
      }
      return out;
    });

    // Hide text and the fixed island, then photograph what's behind.
    await page.addStyleTag({
      content: '*{color:transparent!important;text-decoration-color:transparent!important} nav[aria-label=Main]{display:none!important} main svg, footer svg{visibility:hidden}',
    });
    const png = PNG.sync.read(await page.screenshot({ fullPage: true }));
    const px = (x: number, y: number) => {
      const i = (Math.min(png.height - 1, Math.max(0, Math.round(y))) * png.width + Math.min(png.width - 1, Math.max(0, Math.round(x)))) * 4;
      return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };

    const failures: string[] = [];
    for (const b of boxes) {
      const lums: number[] = [];
      const pairs: number[][] = [];
      for (let y = b.y; y < b.y + b.h; y += 3)
        for (let x = b.x; x < b.x + b.w; x += 3) {
          const bg = px(x, y);
          pairs.push(bg);
          lums.push(lum(bg[0], bg[1], bg[2]));
        }
      const order = lums.map((l, i) => [l, i]).sort((a, c) => a[0] - c[0]);
      const pick = (q: number) => pairs[order[Math.floor(q * (order.length - 1))][1]];
      let worst = Infinity;
      for (const bg of [pick(0.05), pick(0.95)]) {
        const [r, g, bl, a] = b.rgba;
        const fg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), bl * a + bg[2] * (1 - a)];
        worst = Math.min(worst, ratio(lum(fg[0], fg[1], fg[2]), lum(bg[0], bg[1], bg[2])));
      }
      const need = b.large ? 3 : 4.5;
      if (worst < need) failures.push(`${worst.toFixed(2)} < ${need}  "${b.text}" @${Math.round(b.y)}`);
    }

    // Bright share per screen (L > 0.5 counts as bright marble).
    const shares: string[] = [];
    for (let top = 0; top < png.height; top += height) {
      let bright = 0, n = 0;
      for (let y = top; y < Math.min(top + height, png.height); y += 4)
        for (let x = 0; x < png.width; x += 4) {
          const [r, g, b] = px(x, y);
          bright += lum(r, g, b) > 0.5 ? 1 : 0;
          n++;
        }
      shares.push(`${Math.round((100 * bright) / n)}%`);
    }
    console.log(`${width}x${height}  ${boxes.length} text boxes  bright share per screen: ${shares.join(' ')}`);
    if (failures.length) console.log(failures.join('\n'));
    expect(failures, failures.join('\n')).toEqual([]);
  });
}
