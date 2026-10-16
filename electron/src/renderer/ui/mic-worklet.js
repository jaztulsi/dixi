// Turns mic audio (already resampled to 16 kHz by the AudioContext) into 100 ms Int16 chunks,
// the format Deepgram expects (linear16, 16 kHz, mono).
class PCM16Chunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(1600);
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.length === this.buffer.length) {
        this.port.postMessage(this.buffer.buffer.slice(0));
        this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm16-chunker', PCM16Chunker);
