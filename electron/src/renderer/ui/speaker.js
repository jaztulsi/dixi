// Spoken replies with the system's on-device voices (speechSynthesis). While Runic talks, and for a
// moment after, the voice agent ignores the mic: otherwise Runic hears itself and acts on it.

const ECHO_TAIL_MS = 1500;  // Deepgram delivers words ~1s late

export class Speaker {
  constructor(synth = globalThis.speechSynthesis) {
    this.synth = synth;
    this.speaking = false;
    this.deafUntil = 0;
    this.spans = [];  // [{start, end}] when Runic was talking, to drop late-arriving echoes
  }

  isBusy() { return this.speaking || Date.now() < this.deafUntil; }

  wasSpeaking(time) {
    return this.spans.some((s) => time >= s.start - 200 && time <= (s.end ?? Infinity) + 600);
  }

  say(text) {
    if (!this.synth) return;
    this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    const span = { start: Date.now(), end: null };
    this.spans = [...this.spans.slice(-4), span];
    this.speaking = true;
    const done = () => { this.speaking = false; span.end = Date.now(); this.deafUntil = Date.now() + ECHO_TAIL_MS; };
    u.onend = done;
    u.onerror = done;
    this.synth.speak(u);
  }

  stop() { this.synth?.cancel(); }
}
