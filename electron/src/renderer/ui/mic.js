// Microphone → 16 kHz Int16 chunks via an AudioWorklet.

export class Mic {
  constructor() { this.ctx = null; this.stream = null; }

  async start(onChunk) {
    this.stop();
    const stream = this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    // The device went away mid-session (AirPods disconnected, a USB mic unplugged): carry on with the Mac's
    // default input instead of going deaf. ponytail: a new default mid-session is picked up at the next ⌥Space.
    stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (this.stream === stream) this.start(onChunk).catch(() => {}); });
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
