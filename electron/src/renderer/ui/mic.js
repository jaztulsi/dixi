// Microphone → 16 kHz Int16 chunks via an AudioWorklet.

export class Mic {
  constructor() { this.ctx = null; this.stream = null; }

  async start(onChunk) {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    const source = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, 'pcm16-chunker');
    node.port.onmessage = (e) => onChunk(e.data);
    source.connect(node);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
  }
}
