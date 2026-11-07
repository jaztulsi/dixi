import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AudioDump, levels } from '../../src/main/audiodump.js';

test('debug audio: one 16 kHz WAV per session with levels, first-word check, dropped audio and how it ended; old WAVs pruned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dixi-dump-'));
  let now = Date.parse('2026-11-07T10:00:00Z');
  const d = new AudioDump(dir, { now: () => now, provider: () => 'deepgram-flux' });
  const old = path.join(dir, 'old.wav'); fs.writeFileSync(old, 'x'); fs.utimesSync(old, new Date(now - 8 * 864e5), new Date(now - 8 * 864e5));
  d.begin();
  const quiet = new Int16Array(3200), loud = new Int16Array(16000).map((_, i) => Math.round(Math.sin(i / 5) * 8000));
  d.add(quiet.buffer); d.add(loud.buffer);
  d.info({ device: 'MacBook Air Microphone', nativeRate: 48000 }); d.info({ heldMS: 1500 }); d.hotkey();
  const r = d.end();
  assert.equal(r.provider, 'deepgram-flux'); assert.equal(r.device, 'MacBook Air Microphone'); assert.equal(r.nativeRate, 48000);
  assert.equal(r.secs, 1.2); assert.equal(r.droppedMS, 220, '1.5 s held, 1.2 s arrived');
  assert.equal(r.endpoint, 'hotkey'); assert.equal(r.firstWordCut, false, '200 ms of silence first');
  assert.ok(r.peakDb > -13 && r.peakDb < -12, `peak ${r.peakDb}`);
  const b = fs.readFileSync(r.file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.readUInt32LE(24), 16000); assert.equal(b.length, 44 + 19200 * 2);
  assert.equal(fs.readFileSync(path.join(dir, 'capture.log'), 'utf8').trim().split('\n').length, 1);
  assert.equal(fs.existsSync(old), false, '> 7 days old: deleted');
  // Speech-loud from the first sample: the mic opened mid-word.
  d.begin(); d.add(loud.buffer); assert.equal(d.end().firstWordCut, true);
  d.begin(); assert.equal(d.end(), null, 'nothing heard: no file');
  assert.equal(levels(new Int16Array(4)).rmsDb, -Infinity);
});
