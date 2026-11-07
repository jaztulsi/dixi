// DIXI_DEBUG_AUDIO=1: the exact audio sent to speech-to-text, one 16 kHz mono WAV per ⌥Space session, in
// userData/audio-debug (local only, never uploaded, deleted after 7 days), plus one log line per session:
// device, native rate, resample path, peak/RMS dBFS, energy in the first 200 ms, dropped audio, how it ended.
import fs from 'node:fs';
import path from 'node:path';

const RATE = 16000, WEEK = 7 * 864e5;
const db = (x) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -Infinity);

/** Peak / RMS dBFS of Int16 samples, and of the first 200 ms (speech already there = the first word was cut). */
export function levels(s) {
  let peak = 0, sum = 0, clip = 0, head = 0;
  const n200 = Math.min(s.length, RATE / 5);
  for (let i = 0; i < s.length; i++) {
    const v = Math.abs(s[i]) / 32768;
    if (v > peak) peak = v;
    sum += v * v;
    if (v >= 0.999) clip++;
    if (i < n200) head += v * v;
  }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / (s.length || 1))), first200Db: db(Math.sqrt(head / (n200 || 1))), clippedSamples: clip };
}

export function wav(samples) {
  const h = Buffer.alloc(44), bytes = samples.length * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
  return Buffer.concat([h, Buffer.from(samples.buffer, samples.byteOffset, bytes)]);
}

export class AudioDump {
  // lateMS: the provider's last turn and the transcript on screen can arrive just after the mic closes; the
  // log line waits that long so they land in it.
  constructor(dir, { now = Date.now, provider = () => '', lateMS = 2500 } = {}) { Object.assign(this, { dir, now, provider, lateMS, cur: null, late: null }); }

  begin() { this.end('reopened'); this.cur = { at: this.now(), chunks: [], mic: null, eot: 0, said: [], shown: '' }; }
  add(chunk) { this.cur?.chunks.push(Buffer.from(chunk)); }
  info(mic) { if (this.cur) this.cur.mic = { ...this.cur.mic, ...mic }; }
  /** A provider event; an EndOfTurn's transcript is what the provider heard, before any of Dixi's filters. */
  heard(event, text) { const c = this.cur ?? this.late; if (c && event === 'EndOfTurn') { c.eot++; if (text) c.said.push(text); } }
  /** The words on screen (after Dixi's filters): the last one wins. */
  shown(text) { const c = this.cur ?? this.late; if (c) c.shown = String(text ?? ''); }
  hotkey() { if (this.cur) this.cur.hotkey = true; }

  /** Writes the WAV and the log line; returns the record (null when nothing was heard). */
  end(reason = 'closed') {
    const c = this.cur;
    this.cur = null;
    if (!c?.chunks.length) return null;
    const buf = Buffer.concat(c.chunks), s = new Int16Array(buf.length >> 1);
    for (let i = 0; i < s.length; i++) s[i] = buf.readInt16LE(i * 2);   // a pooled Buffer can sit at an odd offset
    const secs = s.length / RATE;
    fs.mkdirSync(this.dir, { recursive: true });
    const stamp = new Date(c.at).toISOString().replace(/[:.]/g, '-');
    const file = path.join(this.dir, `${stamp}.wav`);
    fs.writeFileSync(file, wav(s));
    const rec = {
      file, provider: this.provider(), ...c.mic, secs: Math.round(secs * 100) / 100,
      // Audio the mic held for vs audio that arrived here (one 80 ms frame of slack): a gap means dropped frames.
      droppedMS: c.mic?.heldMS ? Math.max(0, c.mic.heldMS - Math.round(secs * 1000) - 80) : undefined,
      ...levels(s),
      endpoint: c.hotkey ? 'hotkey' : c.eot ? 'provider-end-of-turn' : reason,
      providerTurns: c.eot,
    };
    rec.firstWordCut = rec.first200Db > -40;   // already speech-loud in the first 200 ms: the mic opened mid-word
    const log = () => {
      if (this.late === c) this.late = null;
      Object.assign(rec, { providerTurns: c.eot, said: c.said.join(' '), shown: c.shown });
      fs.appendFileSync(path.join(this.dir, 'capture.log'), JSON.stringify(rec) + '\n');
      this.prune();
    };
    this.late = c;
    if (this.lateMS) setTimeout(log, this.lateMS); else log();
    return rec;
  }

  prune() {
    for (const f of fs.readdirSync(this.dir)) {
      const p = path.join(this.dir, f);
      if (f.endsWith('.wav') && this.now() - fs.statSync(p).mtimeMs > WEEK) fs.rmSync(p, { force: true });
    }
  }
}
