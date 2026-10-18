// Spoken replies: an ElevenLabs voice (fetched by the main process, key stays there), else the system's
// on-device voice. While Dixi talks, and for a moment after, the voice agent treats what the mic hears
// as a possible echo: otherwise Dixi hears itself and acts on it.

const ECHO_TAIL_MS = 1200;  // speech-to-text delivers words ~1s late

export class Speaker {
  constructor({ synth = globalThis.speechSynthesis, tts = globalThis.window?.dixi?.tts } = {}) {
    this.synth = synth;
    this.tts = tts;
    this.speaking = false;
    this.deafUntil = 0;
    this.lastText = '';
    this.spans = [];  // [{start, end}] when Dixi was talking, to drop late-arriving echoes
    this.audio = null;
    this.seq = 0;
  }

  isBusy() { return this.speaking || Date.now() < this.deafUntil; }

  wasSpeaking(time) {
    return this.spans.some((s) => time >= s.start - 200 && time <= (s.end ?? Infinity) + 600);
  }

  async say(text) {
    this.stop();
    const seq = ++this.seq;
    this.lastText = text;
    const span = { start: Date.now(), end: null };
    this.spans = [...this.spans.slice(-4), span];
    this.speaking = true;
    const done = () => { if (seq !== this.seq) return; this.speaking = false; span.end = Date.now(); this.deafUntil = Date.now() + ECHO_TAIL_MS; this.audio = null; };
    const bytes = this.tts ? await this.tts(text).catch(() => null) : null;
    if (seq !== this.seq) return;  // stopped or replaced while the voice was being made
    if (bytes?.byteLength) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const a = new Audio(url);
      this.audio = a;
      const end = () => { URL.revokeObjectURL(url); done(); };
      a.onended = end; a.onerror = end;
      a.play().catch(end);
      return;
    }
    if (!this.synth) { done(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.onend = done; u.onerror = done;
    this.synth.speak(u);
  }

  /** Cancelled speech has no echo tail: listen again at once (barge-in). */
  stop() {
    this.seq++;
    this.audio?.pause(); this.audio = null;
    this.synth?.cancel();
    this.speaking = false; this.deafUntil = 0;
    const last = this.spans.at(-1); if (last && last.end == null) last.end = Date.now();
  }
}
