// Word error rate of whisper.cpp transcripts vs the reference lines (free, local).
//   node eval/capture/wer.mjs ref.txt hyp.txt [hyp2.txt …]
import fs from 'node:fs';
const NUM = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
export const words = (t) => t.toLowerCase().replace(/\b(\d+)\b/g, (m) => NUM[m] ?? m).replace(/lo-?fi/g, 'lofi').replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
export function wer(ref, hyp) {
  const r = words(ref), h = words(hyp), d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { errors: d[r.length][h.length], words: r.length };
}
if (process.argv[1].endsWith('wer.mjs')) {
  const ref = fs.readFileSync(process.argv[2], 'utf8');
  for (const f of process.argv.slice(3)) { const w = wer(ref, fs.readFileSync(f, 'utf8')); console.log(`${f.split('/').pop()}\tWER ${(100 * w.errors / w.words).toFixed(1)}%\t(${w.errors}/${w.words})`); }
}
