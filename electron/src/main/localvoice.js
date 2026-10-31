// The Mac's own voice as sound bytes, for when ElevenLabs can't answer. Played through the page like any
// other reply, the mic's echo canceller hears it go out and removes it from what the mic picks up.
// (speechSynthesis plays outside Chrome: the mic heard Dixi at full volume and took it for you.)
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const say = (args) => new Promise((resolve, reject) => execFile('say', args, { timeout: 8000 }, (err) => (err ? reject(err) : resolve())));

/** Text → WAV bytes (16-bit, 22.05 kHz) in the system voice. `run` stands in for `say` in tests. */
export async function localVoice(text, { voice, rate, run = say } = {}) {
  const file = path.join(os.tmpdir(), `dixi-voice-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  // "--": text that starts with "-" is still text, never an option.
  const args = ['-o', file, '--data-format=LEI16@22050', ...(voice ? ['-v', String(voice)] : []), ...(rate ? ['-r', String(rate)] : []), '--', String(text)];
  try {
    await run(args);
    return new Uint8Array(await fs.readFile(file));
  } finally { await fs.rm(file, { force: true }); }
}
