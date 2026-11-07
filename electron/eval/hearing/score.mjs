// Hearing scorecard on YOUR recordings (DIXI_DEBUG_AUDIO=1 sessions). Everything stays in the audio-debug
// folder, outside the repo; this prints only totals.
//   node eval/hearing/score.mjs init   → adds new sessions to refs.tsv, each line "<wav>\t?? <what the provider heard>"
//   (open refs.tsv, fix each line to exactly what you said, and delete the "?? "; lines still starting "??" are skipped)
//   node eval/hearing/score.mjs        → WER per candidate on the checked lines; per-file detail in score-detail.tsv
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { wer } from '../capture/wer.mjs';

const dir = process.env.DIXI_AUDIO_DIR ?? path.join(os.homedir(), 'Library/Application Support/Dixi/audio-debug');
const here = path.dirname(new URL(import.meta.url).pathname);
const log = fs.readFileSync(path.join(dir, 'capture.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const refsFile = path.join(dir, 'refs.tsv');
const refs = new Map(fs.existsSync(refsFile) ? fs.readFileSync(refsFile, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')) : []);

if (process.argv[2] === 'init') {
  const add = log.filter((r) => !refs.has(path.basename(r.file)) && r.secs >= 1);
  fs.appendFileSync(refsFile, add.map((r) => `${path.basename(r.file)}\t?? ${r.said || r.shown || ''}\n`).join(''));
  console.log(`${add.length} new lines in ${refsFile}`);
  process.exit(0);
}

const rows = log.filter((r) => refs.get(path.basename(r.file)) && !refs.get(path.basename(r.file)).startsWith('??'));
if (!rows.length) { console.log('no checked lines in refs.tsv yet'); process.exit(1); }
const files = rows.map((r) => r.file);

// Apple's on-device SpeechTranscriber (compiled once into the scratch folder next to the WAVs).
const apple = path.join(dir, '.apple-transcriber');
if (!fs.existsSync(apple)) execFileSync('swiftc', ['-parse-as-library', '-O', path.join(here, 'apple.swift'), '-o', apple]);
const appleOut = new Map(execFileSync(apple, files, { encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').map((l) => l.split('\t')));
// ponytail: whisper base.en only (the model on disk); a bigger model is one download if it wins.
const model = process.env.WHISPER_MODEL ?? path.join(os.homedir(), 'whisper.cpp/models/ggml-base.en.bin');
const whisper = (f) => execFileSync('whisper-cli', ['-m', model, '-f', f, '-nt', '-np'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\s+/g, ' ').trim();

const cands = {
  'live: on screen (after Dixi filters)': (r) => r.shown ?? '',
  'live: provider heard (before filters)': (r) => r.said ?? '',
  'offline: Apple SpeechTranscriber': (r) => appleOut.get(r.file) ?? '',
  'offline: whisper.cpp base.en': (r) => whisper(r.file),
};
const tot = Object.fromEntries(Object.keys(cands).map((k) => [k, { errors: 0, words: 0 }]));
const detail = ['wav\tcandidate\terrors\twords\ttext'];
for (const r of rows) {
  const ref = refs.get(path.basename(r.file));
  for (const [k, f] of Object.entries(cands)) {
    const hyp = f(r), w = wer(ref, hyp);
    tot[k].errors += w.errors; tot[k].words += w.words;
    detail.push([path.basename(r.file), k, w.errors, w.words, hyp].join('\t'));
  }
}
fs.writeFileSync(path.join(dir, 'score-detail.tsv'), detail.join('\n') + '\n');
console.log(`${rows.length} recordings, ${tot[Object.keys(cands)[0]].words} reference words\n`);
for (const [k, t] of Object.entries(tot)) console.log(`${(100 * t.errors / t.words).toFixed(1).padStart(5)}% WER  ${k}`);
const n = (p) => rows.filter(p).length;
console.log(`\nfailure counts: split into >1 provider turn ${n((r) => r.providerTurns > 1)} · filtered away (heard, nothing shown) ${n((r) => r.said && !r.shown)}` +
  ` · first word cut ${n((r) => r.firstWordCut)} · dropped audio >100 ms ${n((r) => r.droppedMS > 100)} · device ${[...new Set(rows.map((r) => r.device))].join(', ')}`);
