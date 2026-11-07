// Microphone → 16 kHz Int16 chunks via an AudioWorklet.
// The audio graph (context + worklet) is built once and kept suspended between sessions, so a ⌥Space only
// has to open the mic itself: the first word isn't spent waiting for the worklet to load. The mic (the
// MediaStream, what lights the orange dot) is still closed whenever no session is open.

// Inputs that make speech worse than the Mac's own mic: virtual/loopback/aggregate devices (they hear the
// Mac's output, or nothing) and Bluetooth headsets (8–16 kHz call quality, and opening them drops music to it).
const POOR = /virtual|aggregate|multi-output|blackhole|loopback|soundflower|zoom|teams|krisp|airpods|bluetooth|hands-?free/i;
const BUILT_IN = /macbook|built-in|internal/i;

/** The deviceId to open: the Mac's default input, unless that is a poor one and a built-in mic exists. */
export function pickInput(devices) {
  const ins = devices.filter((d) => d.kind === 'audioinput');
  const def = ins.find((d) => d.deviceId === 'default') ?? ins[0];
  if (!def || !POOR.test(def.label)) return { deviceId: def?.deviceId, label: def?.label ?? '' };
  const b = ins.find((d) => BUILT_IN.test(d.label) && !POOR.test(d.label));
  return b ? { deviceId: b.deviceId, label: b.label, skipped: def.label } : { deviceId: def.deviceId, label: def.label };
}

export class Mic {
  // processing: the browser's echo canceller / noise suppressor / gain control. Echo cancellation stays on
  // (Dixi's own voice comes out of the same Mac); the other two are measured in eval/capture.mjs.
  constructor({ processing = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, report = null } = {}) {
    this.processing = processing; this.report = report;
    this.ctx = null; this.node = null; this.stream = null; this.source = null; this.onChunk = null;
  }

  async graph() {
    if (this.ctx) return;
    const ctx = new AudioContext({ sampleRate: 16000 });   // Chromium resamples the device rate (48 kHz) to 16 kHz
    await ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(ctx, 'pcm16-chunker');
    this.node.port.onmessage = (e) => (e.data?.drained ? this.drained?.() : this.onChunk?.(e.data));
    this.ctx = ctx;
  }

  async start(onChunk) {
    const t0 = performance.now();
    this.stop();
    let pick = {};
    try { pick = pickInput(await navigator.mediaDevices.enumerateDevices()); } catch {}
    const audio = { channelCount: 1, ...this.processing, ...(pick.deviceId && pick.deviceId !== 'default' ? { deviceId: { exact: pick.deviceId } } : {}) };
    const [stream] = await Promise.all([navigator.mediaDevices.getUserMedia({ audio }), this.graph()]);
    this.stream = stream;
    // The device went away mid-session (AirPods disconnected, a USB mic unplugged): carry on with the Mac's
    // default input instead of going deaf. ponytail: a new default mid-session is picked up at the next ⌥Space.
    const track = stream.getAudioTracks()[0];
    track?.addEventListener('ended', () => { if (this.stream === stream) this.start(onChunk).catch(() => {}); });
    let first = true;
    this.onChunk = (buf) => {
      if (first) { first = false; this.report?.({ firstChunkMS: Math.round(performance.now() - t0) }); }
      onChunk(buf);
    };
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.node);
    await this.ctx.resume();
    this.startedAt = this.ctx.currentTime;
    const s = track?.getSettings?.() ?? {};
    this.report?.({ device: track?.label || pick.label, skipped: pick.skipped, nativeRate: s.sampleRate, ctxRate: this.ctx.sampleRate,
      resample: `${s.sampleRate ?? '?'} Hz → ${this.ctx.sampleRate} Hz (Chromium AudioContext) → AudioWorklet Int16`,
      echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGainControl, openMS: Math.round(performance.now() - t0) });
  }

  /** Sends the last part-frame (up to 80 ms: often the end of your last word) before the mic closes. */
  async drain() {
    if (!this.stream || !this.node) return;
    await new Promise((r) => { const t = setTimeout(r, 60); this.drained = () => { clearTimeout(t); r(); }; this.node.port.postMessage('drain'); });
    this.drained = null;
  }

  stop() {
    if (this.stream && this.ctx) {
      // Audio the worklet should have seen vs what it did: a gap means dropped frames.
      const heldMS = Math.round((this.ctx.currentTime - this.startedAt) * 1000);
      this.node.port.postMessage('reset');
      this.report?.({ heldMS });
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.ctx?.suspend().catch(() => {});
    this.stream = null; this.source = null; this.onChunk = null;
  }
}
