import AVFoundation

/// The mic. Prepared at launch (no capture device open, so no orange dot at idle) and started the instant the talk
/// key goes down. Each buffer goes to `onBuffer` (speech) and a 0…1 level goes out ~20 times a second.
/// `warm` keeps the engine running between sessions with a short ring buffer, so the first word is never lost even
/// on a slow mic; it shows the orange dot all the time, so it is off unless you turn it on.
final class Mic {
  static let shared = Mic()
  var onBuffer: (AVAudioPCMBuffer) -> Void = { _ in }
  var warm = false

  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var live = false               // buffers go to speech
  private var startedAt: Double = 0, firstSent = false
  private var lastLevel: Double = 0
  private var ring: [AVAudioPCMBuffer] = [], ringFrames: AVAudioFrameCount = 0
  private var observer: NSObjectProtocol?
  private(set) var format: AVAudioFormat?

  func prepare() {
    installTap()
    engine.prepare()
    observer = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
      // AirPods connected, the default input changed, the sample rate changed: rebuild with the new format.
      guard let self else { return }
      let wasLive = self.isLive
      self.engine.stop()
      self.engine.inputNode.removeTap(onBus: 0)
      self.installTap()
      self.engine.prepare()
      if wasLive || self.warm { try? self.engine.start() }
      Out.emit(["ev": "mic", "change": true, "rate": self.format?.sampleRate ?? 0])
    }
    if warm { try? engine.start() }
  }

  private func installTap() {
    let input = engine.inputNode
    let fmt = input.outputFormat(forBus: 0)
    format = fmt
    guard fmt.sampleRate > 0, fmt.channelCount > 0 else { Out.error("mic", "No input device."); return }
    input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buf, _ in self?.got(buf) }
  }

  var isLive: Bool { lock.lock(); defer { lock.unlock() }; return live }

  /// Talk key down. Returns at once; the engine starts on a background queue so the key tap never waits.
  func start() {
    lock.lock()
    live = true; firstSent = false; startedAt = Out.nowMs()
    let backlog = ring; ring = []; ringFrames = 0
    lock.unlock()
    for b in backlog { onBuffer(b) }   // warm mic: the half second before the key went down
    DispatchQueue.global(qos: .userInteractive).async {
      if !self.engine.isRunning {
        do { try self.engine.start() } catch { Out.error("mic", "Couldn't start the mic: \(error.localizedDescription)") }
      }
    }
  }

  func stop() {
    lock.lock(); live = false; lock.unlock()
    if !warm { DispatchQueue.global(qos: .userInitiated).async { self.engine.stop() } }   // the orange dot goes off
  }

  private func got(_ buf: AVAudioPCMBuffer) {
    lock.lock()
    let on = live
    var first = false
    if on && !firstSent { firstSent = true; first = true }
    let t0 = startedAt
    if !on && warm, let copy = buf.copy() as? AVAudioPCMBuffer {   // keep ~0.5 s for the next session
      ring.append(copy); ringFrames += copy.frameLength
      while let head = ring.first, ringFrames - head.frameLength > AVAudioFrameCount(buf.format.sampleRate / 2) { ringFrames -= head.frameLength; ring.removeFirst() }
    }
    lock.unlock()
    guard on else { return }
    if first { Out.emit(["ev": "mic", "ms": Int(Out.nowMs() - t0)]) }   // talk key → first audio
    onBuffer(buf)
    let now = Out.nowMs()
    if now - lastLevel >= 50, let ch = buf.floatChannelData?[0], buf.frameLength > 0 {
      lastLevel = now
      var sum: Float = 0
      for i in 0..<Int(buf.frameLength) { sum += ch[i] * ch[i] }
      let rms = sqrt(sum / Float(buf.frameLength))
      let db = 20 * log10(max(rms, 1e-6))
      Out.emit(["ev": "level", "v": Double(min(1, max(0, (db + 55) / 45)))])
    }
  }
}
