// The overlay's cues for people who can't (or don't want to) watch it: earcons, short WebAudio sounds
// with no audio files, and the approval card's keys. Pure enough to test in Node with a fake AudioContext.

// Each note: [start Hz, end Hz, starts at s, lasts s, wave]. Every earcon ends within 200 ms.
export const EARCONS = {
  listen: [[523, 784, 0, 0.14]],                          // a soft rise: your turn to talk
  card: [[659, 659, 0, 0.09], [988, 988, 0.1, 0.1]],      // a two-note chime: a question for you
  done: [[784, 784, 0, 0.08], [523, 523, 0.09, 0.11]],    // two notes down: finished
  guard: [[220, 220, 0, 0.2, 'triangle']],                // one low, steady tone (not an alarm): Guardian stopped something
};

// Which earcon a change of overlay state calls for. `now` is the state, or 'guard' for a Guardian stop.
export const earconFor = (prev, now) => (now === prev ? null : { listening: 'listen', done: 'done', guard: 'guard' }[now] ?? null);

// Earcons wait out Dixi's own voice: none while it speaks (a question, say) or for 0.8 s after, while the
// microphone listens for your answer, so a beep is never heard as part of it (council condition).
export const ECHO_MS = 800;
export const canSound = (talking, stoppedAt, now) => !talking && now - stoppedAt >= ECHO_MS;

// Plays one earcon on an AudioContext: a soft attack and fade on each note, so there are no clicks.
export function play(ac, name, volume = 0.08) {
  const t0 = ac.currentTime + 0.01;
  for (const [f1, f2, at, len, wave = 'sine'] of EARCONS[name] ?? []) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f1, t0 + at);
    o.frequency.exponentialRampToValueAtTime(f2, t0 + at + len);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(volume, t0 + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(g).connect(ac.destination);
    o.start(t0 + at);
    o.stop(t0 + at + len);
  }
}

// The approval card's keys: Y or Enter = yes, N or Esc = no. No always counts. A yes in the first 0.7 s
// after the card opens, or right after other typing, doesn't: it was meant for the app you were typing in.
export const QUIET_MS = 700;
export function cardAnswer(key, sinceQuiet = Infinity) {
  const k = String(key).toLowerCase();
  if (k === 'n' || k === 'escape') return false;
  if ((k === 'y' || k === 'enter') && sinceQuiet >= QUIET_MS) return true;
  return null;
}

// The global ⌥Return "yes": false within 500 ms of the agent's last synthetic input (CGEventPost reaches
// globalShortcut) and within 700 ms of the card opening. `now`, `lastSynthetic`, `cardAt` are in ms.
export const keyApprovalOk = ({ now, lastSynthetic = -Infinity, cardAt = -Infinity }) => now - lastSynthetic >= 500 && now - cardAt >= QUIET_MS;
