// The faint contour-line background (ADDENDUM A5), made ONCE from smooth noise with marching squares and
// shipped as static SVGs: src/renderer/assets/contour-{1,2,3}.svg (one seed each: dashboard, onboarding, website).
// Hairlines, white at 4.5% (every 5th at 8%), a 1.5% marble glow behind, a radial mask fading to the black.
//   node eval/contours.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer/assets');
const W = 1600, H = 1000, C = 8, LEVELS = 20;   // viewBox, grid cell, lines per picture

function perlin(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
  const P = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  const G = P.map(() => { const a = rand() * 2 * Math.PI; return [Math.cos(a), Math.sin(a)]; });
  const dot = (ix, iy, x, y) => { const g = G[P[(ix + P[iy & 255]) & 255]]; return g[0] * (x - ix) + g[1] * (y - iy); };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), u = fade(x - x0), v = fade(y - y0);
    const top = dot(x0, y0, x, y) + u * (dot(x0 + 1, y0, x, y) - dot(x0, y0, x, y));
    const bot = dot(x0, y0 + 1, x, y) + u * (dot(x0 + 1, y0 + 1, x, y) - dot(x0, y0 + 1, x, y));
    return top + v * (bot - top);
  };
}

// Corner bits a(TL)=8 b(TR)=4 c(BR)=2 d(BL)=1 → the cell edges each segment joins (saddles: corners stay apart).
const CASES = { 1: ['LB'], 2: ['BR'], 3: ['LR'], 4: ['TR'], 5: ['TR', 'LB'], 6: ['TB'], 7: ['TL'], 8: ['TL'], 9: ['TB'], 10: ['TL', 'BR'], 11: ['TR'], 12: ['LR'], 13: ['BR'], 14: ['LB'] };

function picture(seed) {
  const n = perlin(seed), f = 1 / 620;
  const field = (x, y) => {   // domain-warped noise: large smooth curves that bend like marble veins
    const wx = n(x * f * 0.7 + 3.1, y * f * 0.7 + 7.7), wy = n(x * f * 0.7 + 11.3, y * f * 0.7 + 2.9);
    return n(x * f + 1.3 * wx, y * f + 1.3 * wy) + 0.3 * n(x * f * 2.1 + 5, y * f * 2.1 + 9);
  };
  const nx = W / C + 1, ny = H / C + 1, v = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v.push(field(i * C, j * C));
  const at = (i, j) => v[j * nx + i];
  const lo = Math.min(...v), hi = Math.max(...v);
  const paths = [[], []];
  for (let k = 1; k <= LEVELS; k++) {
    const t = lo + ((hi - lo) * k) / (LEVELS + 1), pt = new Map(), adj = new Map(), segs = [];
    // An edge point is shared by the two cells on either side of it, so segments chain through its id.
    const edge = (i, j, horiz) => {
      const id = `${horiz ? 'h' : 'v'}${i},${j}`;
      if (!pt.has(id)) {
        const a = at(i, j), b = horiz ? at(i + 1, j) : at(i, j + 1), s = (t - a) / (b - a);
        pt.set(id, horiz ? [(i + s) * C, j * C] : [i * C, (j + s) * C]);
      }
      return id;
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const bits = (at(i, j) >= t) * 8 + (at(i + 1, j) >= t) * 4 + (at(i + 1, j + 1) >= t) * 2 + (at(i, j + 1) >= t);
      for (const pair of CASES[bits] ?? []) {
        const [e1, e2] = [...pair].map((e) => (e === 'T' ? edge(i, j, true) : e === 'B' ? edge(i, j + 1, true) : e === 'L' ? edge(i, j, false) : edge(i + 1, j, false)));
        const id = segs.push([e1, e2]) - 1;
        for (const e of [e1, e2]) adj.set(e, [...(adj.get(e) ?? []), id]);
      }
    }
    const used = new Set();
    const walk = (from) => { const line = []; for (let e = from; ;) { const next = (adj.get(e) ?? []).find((s) => !used.has(s)); if (next == null) return line; used.add(next); e = segs[next][0] === e ? segs[next][1] : segs[next][0]; line.push(e); } };
    for (let s = 0; s < segs.length; s++) {
      if (used.has(s)) continue;
      used.add(s);
      const line = [...walk(segs[s][0]).reverse(), segs[s][0], segs[s][1], ...walk(segs[s][1])];
      if (line.length < 6) continue;   // specks
      paths[k % 5 === 0 ? 1 : 0].push('M' + line.map((e) => pt.get(e).map(Math.round).join(' ')).join(' '));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs><radialGradient id="f" cx="50%" cy="45%" r="62%"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="g" cx="38%" cy="32%" r="58%"><stop offset="0" stop-color="#fff" stop-opacity=".015"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="${W}" height="${H}" fill="url(#f)"/></mask></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<g mask="url(#m)" fill="none" stroke="#fff" stroke-linejoin="round">
<path stroke-opacity=".045" vector-effect="non-scaling-stroke" d="${paths[0].join('')}"/>
<path stroke-opacity=".08" vector-effect="non-scaling-stroke" d="${paths[1].join('')}"/>
</g></svg>\n`;
}

for (const [i, seed] of [[1, 7], [2, 23], [3, 101]]) {
  const svg = picture(seed);
  fs.writeFileSync(path.join(out, `contour-${i}.svg`), svg);
  console.log(`contour-${i}.svg ${(svg.length / 1024).toFixed(0)} KB`);
}
