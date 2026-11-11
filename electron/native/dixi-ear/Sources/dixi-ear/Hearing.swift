import AVFoundation
import Speech

/// Speech to text, on this Mac. One utterance per talk-key session: begin() → feed(buffer)… → finish() or cancel().
/// Partials go out as {ev:'partial'}; the whole utterance once as {ev:'final', text, ms}.
protocol Hearing: AnyObject {
  var name: String { get }
  func setVocabulary(_ words: [String])
  func begin()
  func feed(_ buf: AVAudioPCMBuffer)
  func finish()
  func cancel()
}

/// Joins finalized pieces and the current guess into the text so far.
struct Transcript {
  var done = "", guess = ""
  var text: String { (done + (guess.isEmpty ? "" : (done.isEmpty || done.hasSuffix(" ") || guess.hasPrefix(" ") ? "" : " ") + guess)).trimmingCharacters(in: .whitespacesAndNewlines) }
  mutating func final(_ s: String) {
    if !s.isEmpty { done += (done.isEmpty || done.hasSuffix(" ") || s.hasPrefix(" ") ? "" : " ") + s }
    guess = ""
  }
}

// MARK: - macOS 26: SpeechAnalyzer + DictationTranscriber (vocabulary biasing works with this module)

@available(macOS 26, *)
final class AnalyzerHearing: Hearing {
  let name = "dictation"
  private let locale: Locale
  private var words: [String] = ["Dixi"]

  /// One analyzer, ready before Fn goes down (made right after the previous session ends).
  private final class Session {
    let transcriber: DictationTranscriber
    let analyzer: SpeechAnalyzer
    let format: AVAudioFormat
    let input: AsyncStream<AnalyzerInput>.Continuation
    var converter: AVAudioConverter?
    var results: Task<Void, Never>?
    var transcript = Transcript()
    init(transcriber: DictationTranscriber, analyzer: SpeechAnalyzer, format: AVAudioFormat, input: AsyncStream<AnalyzerInput>.Continuation) {
      self.transcriber = transcriber; self.analyzer = analyzer; self.format = format; self.input = input
    }
  }

  private let lock = NSLock()
  private var ready: Session?          // prepared, waiting for a talk key
  private var active: Session?         // this utterance
  private var recording = false
  private var backlog: [AVAudioPCMBuffer] = []   // audio heard before the analyzer was ready (first run)
  private var preparing = false

  init(locale: Locale) { self.locale = locale }

  /// Downloads the on-device model once (the OS manages it), then prepares the first session.
  func setUp() async -> Bool {
    let probe = DictationTranscriber(locale: locale, preset: .shortDictation)
    let status = await AssetInventory.status(forModules: [probe])
    if status == .unsupported { return false }
    if status != .installed {
      Out.emit(["ev": "hearing", "state": "downloading"])
      do {
        if let req = try await AssetInventory.assetInstallationRequest(supporting: [probe]) { try await req.downloadAndInstall() }
      } catch { Out.error("hearing", "The speech model didn't download: \(error.localizedDescription)"); return false }
    }
    await prepareNext()
    return ready != nil
  }

  func setVocabulary(_ list: [String]) {
    lock.lock(); words = Array(list.prefix(100)); let s = ready; lock.unlock()
    guard let s else { return }
    Task { try? await s.analyzer.setContext(self.context()) }
  }

  private func context() -> AnalysisContext {
    let c = AnalysisContext()
    lock.lock(); c.contextualStrings[.general] = words; lock.unlock()
    return c
  }

  private func prepareNext() async {
    lock.lock(); if preparing || ready != nil { lock.unlock(); return }; preparing = true; lock.unlock()
    defer { lock.lock(); preparing = false; lock.unlock() }
    let t = DictationTranscriber(locale: locale, contentHints: [.shortForm], transcriptionOptions: [.punctuation],
                                 reportingOptions: [.volatileResults, .frequentFinalization], attributeOptions: [])
    guard let fmt = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [t]) else { Out.error("hearing", "No audio format for the speech model."); return }
    let a = SpeechAnalyzer(modules: [t], options: SpeechAnalyzer.Options(priority: .userInitiated, modelRetention: .processLifetime))
    do {
      try await a.setContext(context())
      try await a.prepareToAnalyze(in: fmt)
    } catch { Out.error("hearing", "Couldn't prepare the speech model: \(error.localizedDescription)"); return }
    let (stream, cont) = AsyncStream.makeStream(of: AnalyzerInput.self)
    let s = Session(transcriber: t, analyzer: a, format: fmt, input: cont)
    s.results = Task {
      do {
        for try await r in t.results {
          let piece = String(r.text.characters)
          if r.isFinal { s.transcript.final(piece) } else { s.transcript.guess = piece }
          Out.emit(["ev": "partial", "text": s.transcript.text])
        }
      } catch { Out.error("hearing", "Speech stopped: \(error.localizedDescription)") }
    }
    do { try await a.start(inputSequence: stream) } catch { Out.error("hearing", "Couldn't start the speech model: \(error.localizedDescription)"); return }
    lock.lock()
    if recording && active == nil {   // the talk key went down while this was getting ready: it takes the waiting audio
      active = s
      let old = backlog; backlog = []
      lock.unlock()
      for b in old { push(b, into: s) }
    } else {
      ready = s
      lock.unlock()
    }
  }

  func begin() {
    lock.lock()
    recording = true; backlog = []
    active = ready; ready = nil
    lock.unlock()
    if active == nil { Task { await prepareNext() } }
  }

  func feed(_ buf: AVAudioPCMBuffer) {
    lock.lock()
    guard recording else { lock.unlock(); return }
    guard let s = active else {
      if backlog.count < 600, let copy = buf.copy() as? AVAudioPCMBuffer { backlog.append(copy) }   // ≤ ~12 s
      lock.unlock(); return
    }
    lock.unlock()
    push(buf, into: s)
  }

  /// The analyzer does no conversion itself: every buffer must be in its own format, or no text comes back.
  private func push(_ buf: AVAudioPCMBuffer, into s: Session) {
    if s.converter == nil || s.converter?.inputFormat != buf.format { s.converter = AVAudioConverter(from: buf.format, to: s.format) }
    guard let conv = s.converter else { return }
    let cap = AVAudioFrameCount(Double(buf.frameLength) * s.format.sampleRate / buf.format.sampleRate) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: s.format, frameCapacity: cap) else { return }
    var fed = false
    var err: NSError?
    conv.convert(to: out, error: &err) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true; status.pointee = .haveData; return buf
    }
    if err == nil && out.frameLength > 0 { s.input.yield(AnalyzerInput(buffer: out)) }
  }

  func finish() {
    let t0 = Out.nowMs()
    lock.lock(); recording = false; let s = active; active = nil; backlog = []; lock.unlock()
    guard let s else { Out.emit(["ev": "final", "text": "", "ms": 0, "why": "not ready"]); Task { await prepareNext() }; return }
    Task {
      s.input.finish()   // finalizeAndFinishThroughEndOfInput waits for the input to end
      do { try await s.analyzer.finalizeAndFinishThroughEndOfInput() } catch { Out.error("hearing", "finish: \(error.localizedDescription)") }
      _ = await s.results?.value
      Out.emit(["ev": "final", "text": s.transcript.text, "ms": Int(Out.nowMs() - t0)])
      await self.prepareNext()
    }
  }

  func cancel() {
    lock.lock(); recording = false; let s = active; active = nil; backlog = []; lock.unlock()
    Task {
      if let s { s.input.finish(); await s.analyzer.cancelAndFinishNow(); s.results?.cancel() }
      await self.prepareNext()
    }
  }
}

// MARK: - Fallback: SFSpeechRecognizer, on-device only

final class SFHearing: Hearing {
  let name = "speech"
  private let recognizer: SFSpeechRecognizer
  private var words: [String] = ["Dixi"]
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var transcript = ""
  private var finishing: (t0: Double, sent: Bool)?
  private let lock = NSLock()

  init?(locale: Locale) {
    guard let r = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US")), r.supportsOnDeviceRecognition else { return nil }
    recognizer = r
    if SFSpeechRecognizer.authorizationStatus() == .notDetermined { SFSpeechRecognizer.requestAuthorization { _ in } }
  }

  func setVocabulary(_ list: [String]) { lock.lock(); words = Array(list.prefix(100)); lock.unlock() }

  func begin() {
    let req = SFSpeechAudioBufferRecognitionRequest()
    req.requiresOnDeviceRecognition = true   // never the network
    req.shouldReportPartialResults = true
    req.addsPunctuation = true
    lock.lock(); req.contextualStrings = words; request = req; transcript = ""; finishing = nil; lock.unlock()
    task = recognizer.recognitionTask(with: req) { [weak self] result, error in
      guard let self else { return }
      if let r = result {
        self.lock.lock(); self.transcript = r.bestTranscription.formattedString; self.lock.unlock()
        Out.emit(["ev": "partial", "text": r.bestTranscription.formattedString])
        if r.isFinal { self.sendFinal() }
      } else if error != nil { self.sendFinal() }
    }
  }

  func feed(_ buf: AVAudioPCMBuffer) { lock.lock(); let r = request; lock.unlock(); r?.append(buf) }

  private func sendFinal() {
    lock.lock()
    guard let f = finishing, !f.sent else { lock.unlock(); return }
    finishing = (f.t0, true)
    let text = transcript
    lock.unlock()
    Out.emit(["ev": "final", "text": text, "ms": Int(Out.nowMs() - f.t0)])
  }

  func finish() {
    lock.lock(); finishing = (Out.nowMs(), false); let r = request; request = nil; lock.unlock()
    r?.endAudio()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.sendFinal(); self.task?.cancel(); self.task = nil }   // never wait longer for the last word
  }

  func cancel() {
    lock.lock(); finishing = (0, true); let r = request; request = nil; lock.unlock()
    r?.endAudio(); task?.cancel(); task = nil
  }
}
