//
//  VoiceAgent.swift
//  Runic
//
//  Streams microphone audio to Deepgram for live transcription.
//  Uses incremental dispatch: actions fire as the user speaks,
//  not after they finish (the "better than Siri" pattern).
//
//  Flow:
//    1. Interim transcript → instant navigate to known sites via regex
//    2. Interim stable 300ms → LLM evaluates if partial command is actionable
//    3. Final transcript → LLM catches anything not yet dispatched
//

import Foundation
import AVFoundation
import WebKit
import os.log

private let logger = Logger(subsystem: "com.bisv26.agent", category: "VoiceAgent")

// MARK: - Intent Schema

struct IntentStep: Decodable, Sendable {
    let action: String
    let target: String
    let detail: String
}

// MARK: - Session Context (lightweight AIP pattern)
// Durable within a session. Each LLM call hydrates from this.

struct ActionRecord {
    let utterance: String      // what the user said
    let action: String         // what we did
    let target: String         // where
    let detail: String         // specifics
    let pageTitle: String      // what loaded
    let timestamp: Date
}

@MainActor
final class SessionContext {
    private(set) var history: [ActionRecord] = []
    private static let maxRecords = 20

    func record(utterance: String, action: String, target: String, detail: String, pageTitle: String) {
        let entry = ActionRecord(
            utterance: utterance, action: action, target: target,
            detail: detail, pageTitle: pageTitle, timestamp: Date()
        )
        history.append(entry)
        if history.count > Self.maxRecords {
            history.removeFirst(history.count - Self.maxRecords)
        }
    }

    /// Compact summary for LLM hydration — the "slice" each instance gets.
    func hydrate() -> String {
        guard !history.isEmpty else { return "No prior actions this session." }
        var lines: [String] = []
        for (i, r) in history.enumerated() {
            let page = r.pageTitle.isEmpty ? "" : " (page: \(r.pageTitle))"
            lines.append("[\(i+1)] User said: \"\(r.utterance)\" → \(r.action) \(r.target) \(r.detail)\(page)")
        }
        return lines.joined(separator: "\n")
    }

    func clear() { history.removeAll() }
}

private struct IntentResponse: Decodable {
    let steps: [IntentStep]
}

private struct StabilityCommand: Decodable {
    let complete: Bool
    let action: String?
    let target: String?
    let detail: String?
    let text: String?
}

private struct StabilityResponse: Decodable {
    let commands: [StabilityCommand]
}

// MARK: - Known Sites

private let siteMap: [String: String] = [
    "google": "https://www.google.com",
    "google maps": "https://www.google.com/maps",
    "youtube": "https://www.youtube.com",
    "gmail": "https://mail.google.com",
    "email": "https://mail.google.com",
    "mail": "https://mail.google.com",
    "calendar": "https://calendar.google.com",
    "drive": "https://drive.google.com",
    "docs": "https://docs.google.com",
    "sheets": "https://sheets.google.com",
    "slides": "https://slides.google.com",
    "spotify": "https://open.spotify.com",
    "twitter": "https://x.com",
    "x": "https://x.com",
    "reddit": "https://www.reddit.com",
    "github": "https://github.com",
    "amazon": "https://www.amazon.com",
    "wikipedia": "https://www.wikipedia.org",
    "netflix": "https://www.netflix.com",
    "linkedin": "https://www.linkedin.com",
    "facebook": "https://www.facebook.com",
    "facebook marketplace": "https://www.facebook.com/marketplace",
    "marketplace": "https://www.facebook.com/marketplace",
    "instagram": "https://www.instagram.com",
    "twitch": "https://www.twitch.tv",
    "slack": "https://slack.com",
    "notion": "https://www.notion.so",
    "chatgpt": "https://chat.openai.com",
    "craigslist": "https://www.craigslist.org",
    "ebay": "https://www.ebay.com",
    "tiktok": "https://www.tiktok.com",
]

private let navigatePattern = try! NSRegularExpression(
    pattern: #"(?:open|go to|navigate to|visit)\s+(.+)"#,
    options: .caseInsensitive
)

private func resolveURL(_ target: String) -> String? {
    // Strip trailing punctuation that Deepgram smart_format adds (periods, commas, etc.)
    let key = target.lowercased()
        .trimmingCharacters(in: .whitespaces)
        .trimmingCharacters(in: .punctuationCharacters)
    // Try exact match first (handles multi-word like "facebook marketplace")
    if let mapped = siteMap[key] { return mapped }
    if key.hasPrefix("http://") || key.hasPrefix("https://") { return key }
    if key.range(of: #"\.\w{2,}"#, options: .regularExpression) != nil {
        return "https://\(key)"
    }
    // Try matching longest prefix from siteMap (e.g. "facebook marketplace" before "facebook")
    let sortedKeys = siteMap.keys.sorted { $0.count > $1.count }
    for siteKey in sortedKeys where key.hasPrefix(siteKey) {
        return siteMap[siteKey]
    }
    return nil
}

/// "go to amazon" / "open youtube.com" → URL with no LLM call. nil for anything more than a bare site,
/// e.g. "go to amazon and search headphones" still goes to the agent.
func directNavigationURL(for command: String) -> String? {
    let ns = command as NSString
    guard let m = navigatePattern.firstMatch(in: command, range: NSRange(location: 0, length: ns.length)),
          m.range.location == 0 else { return nil }
    let target = ns.substring(with: m.range(at: 1)).lowercased()
        .trimmingCharacters(in: .whitespaces)
        .trimmingCharacters(in: .punctuationCharacters)
    if let url = siteMap[target] { return url }
    return target.contains(" ") ? nil : resolveURL(target)
}

// MARK: - Voice Agent

@Observable
@MainActor
final class VoiceAgent {
    var isListening = false
    var liveTranscript = ""
    var finalTranscript = ""
    var statusLine = ""
    /// True while the current speech is addressed to Runic (wake word heard, or a follow-up).
    var isAwake = false
    private var isStarting = false

    // --- Wake word ---
    /// The mic is always on, so only speech that starts with "Runic" (or comes within a few seconds of
    /// the last command, for follow-ups like "click the second one") is acted on. Settings can turn it off.
    static let wakeWordDefaultsKey = "requireWakeWord"
    private var requireWakeWord: Bool { UserDefaults.standard.object(forKey: Self.wakeWordDefaultsKey) as? Bool ?? true }
    private static let followUpSeconds: TimeInterval = 8
    private var awakeUntil = Date.distantPast
    /// Only a wake word or a real action renews the follow-up window; otherwise a conversation in the
    /// room (seen in testing) keeps Runic awake forever.
    private var actedThisUtterance = false
    // Deepgram also hears "Runek"/"Runik"; the `keywords` boost below makes "Runic" most likely.
    private static let wakePattern = #"\b(?:runic|runek|runik|runick|ronic|rune ic)\b[\s,.!?]*"#

    var deepgramKey: String = Secrets.deepgramAPIKey
    var llmKey: String = LLMService().apiKey
    var llmBaseURL: String = LLMService.groqBaseURL

    weak var tabManager: TabManager?
    weak var browserAgent: BrowserAgent?

    private let audioEngine = AVAudioEngine()
    private var targetFormat: AVAudioFormat?

    private var dgTask: URLSessionWebSocketTask?
    private var dgSession: URLSession?

    // --- Session context (persists across utterances, cleared on session end) ---
    let session = SessionContext()
    private var currentUtterance = ""

    // --- Incremental dispatch state (reset per utterance) ---
    private var dispatchedFingerprints: Set<String> = []
    private var handledInterimParts: Set<String> = []
    private var lastInterimText = ""
    private var stabilityTimer: DispatchWorkItem?
    private var lastNavigatedSite: String?
    private var intentTask: Task<Void, Never>?

    private static let stabilityMS = 300
    private static let utteranceResetMS = 2000
    private var silenceTimer: DispatchWorkItem?

    // MARK: - Public

    func start() async throws {
        // isListening only flips after the mic-permission await, so without isStarting a second
        // caller in that gap (seen on launch via runic://) would open a second Deepgram stream.
        guard !isListening, !isStarting else { return }
        isStarting = true
        defer { isStarting = false }
        guard !deepgramKey.isEmpty else {
            throw VoiceAgentError.missingDeepgramKey
        }
        guard !llmKey.isEmpty else {
            throw VoiceAgentError.missingLLMKey
        }

        resetDispatchState()

        logger.info("VoiceAgent: requesting mic permission...")
        try await requestMicrophonePermission()
        logger.info("VoiceAgent: configuring audio session...")
        try configureAudioSession()
        logger.info("VoiceAgent: opening Deepgram...")
        try openDeepgram()
        logger.info("VoiceAgent: starting audio engine...")
        try startAudioEngine()

        isListening = true
        statusLine = ""
        logger.info("VoiceAgent started successfully")
    }

    func stop() {
        isListening = false
        statusLine = ""
        logger.info("VoiceAgent stopping")

        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.reset()
        targetFormat = nil

        if let dgTask {
            let closeMsg = #"{"type":"CloseStream"}"#
            dgTask.send(.string(closeMsg)) { _ in }
            dgTask.cancel(with: .goingAway, reason: nil)
        }
        dgTask = nil
        dgSession?.invalidateAndCancel()
        dgSession = nil

        // Don't cancel intentTask — let in-flight LLM calls + dispatches finish.
        // Just detach so we don't hold a reference.
        intentTask = nil

        cancelStabilityTimer()
        cancelSilenceTimer()
        quietTimer?.cancel()
        // Keep dispatchedFingerprints/handledInterimParts alive until next start
        lastInterimText = ""
        liveTranscript = ""
        finalTranscript = ""
    }

    private func resetDispatchState() {
        cancelStabilityTimer()
        cancelSilenceTimer()
        dispatchedFingerprints.removeAll()
        handledInterimParts.removeAll()
        lastInterimText = ""
        currentUtterance = ""
        pendingFinal = ""
        // NOTE: lastNavigatedSite and session persist across utterances
    }

    // MARK: - Microphone

    private func requestMicrophonePermission() async throws {
        let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            AVAudioApplication.requestRecordPermission { cont.resume(returning: $0) }
        }
        guard granted else { throw VoiceAgentError.microphoneDenied }
    }

    private func configureAudioSession() throws {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        #endif
        // macOS has no audio session; AVAudioEngine uses the default input directly.
    }

    private func startAudioEngine() throws {
        let input = audioEngine.inputNode
        input.removeTap(onBus: 0)

        guard let target = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16_000,
            channels: 1,
            interleaved: true
        ) else {
            throw VoiceAgentError.audioFormatFailed
        }
        self.targetFormat = target

        let tgt = target
        let ws = dgTask!

        // Pass nil for format — lets the system use the hardware's native format,
        // avoiding mismatch crashes on simulator (24kHz) vs device (48kHz).
        // Build the converter lazily on first buffer when we know the actual format.
        var conv: AVAudioConverter?

        input.installTap(onBus: 0, bufferSize: 4096, format: nil) { buffer, _ in
            // Lazy-init converter from whatever format the hardware actually provides
            if conv == nil {
                conv = AVAudioConverter(from: buffer.format, to: tgt)
            }
            guard let converter = conv else { return }

            let ratio = tgt.sampleRate / buffer.format.sampleRate
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
            guard let outBuf = AVAudioPCMBuffer(pcmFormat: tgt, frameCapacity: capacity) else { return }

            var consumed = false
            var error: NSError?
            converter.convert(to: outBuf, error: &error) { _, outStatus in
                if consumed {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                consumed = true
                outStatus.pointee = .haveData
                return buffer
            }

            if error != nil { return }
            guard let channelData = outBuf.int16ChannelData else { return }
            let frameCount = Int(outBuf.frameLength)
            let byteCount = frameCount * MemoryLayout<Int16>.size
            let data = Data(bytes: channelData[0], count: byteCount)

            ws.send(.data(data)) { _ in }
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    // MARK: - Deepgram WebSocket

    private func openDeepgram() throws {
        var comps = URLComponents(string: "wss://api.deepgram.com/v1/listen")!
        comps.queryItems = [
            .init(name: "model", value: "nova-2"),
            .init(name: "language", value: "en"),
            .init(name: "smart_format", value: "true"),
            .init(name: "encoding", value: "linear16"),
            .init(name: "sample_rate", value: "16000"),
            .init(name: "channels", value: "1"),
            .init(name: "interim_results", value: "true"),
            .init(name: "endpointing", value: "500"),  // ms of silence before "speech_final"; lower = snappier, higher = fewer split phrases
            .init(name: "utterance_end_ms", value: "1500"),
            .init(name: "keywords", value: "Runic:3"),  // wake word; unboosted it often comes back as "Runek"
        ]
        guard let url = comps.url else { throw VoiceAgentError.badDeepgramURL }

        var request = URLRequest(url: url)
        request.setValue("Token \(deepgramKey)", forHTTPHeaderField: "Authorization")

        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: request)
        self.dgSession = session
        self.dgTask = task
        task.resume()
        receiveDeepgramLoop()
    }

    private func receiveDeepgramLoop() {
        guard let dgTask else { return }
        dgTask.receive { [weak self] result in
            guard let self else { return }
            Task { @MainActor in
                switch result {
                case .failure(let err):
                    logger.error("Deepgram receive error: \(err.localizedDescription, privacy: .public)")
                    // stop() also lands here, with isListening already false. Otherwise the drop was
                    // unexpected: reconnect, since a hands-free user can't tap the mic to restart.
                    guard self.isListening else { return }
                    self.statusLine = "Reconnecting..."
                    self.stop()
                    try? await Task.sleep(for: .seconds(1))
                    try? await self.start()
                case .success(let msg):
                    self.handleDeepgramMessage(msg)
                    if self.isListening { self.receiveDeepgramLoop() }
                }
            }
        }
    }

    private func handleDeepgramMessage(_ msg: URLSessionWebSocketTask.Message) {
        let data: Data
        switch msg {
        case .string(let s): data = Data(s.utf8)
        case .data(let d): data = d
        @unknown default: return
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        let eventType = json["type"] as? String

        // UtteranceEnd = Deepgram detected extended silence after speech.
        // Process any pending transcript, then reset for the next command after a short delay.
        if eventType == "UtteranceEnd" {
            logger.info("[deepgram] UtteranceEnd — arming reset")
            flushPendingFinal()
            armSilenceTimer()
            return
        }

        guard eventType == "Results",
              let channel = json["channel"] as? [String: Any],
              let alts = channel["alternatives"] as? [[String: Any]],
              let transcript = alts.first?["transcript"] as? String,
              !transcript.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        let isFinal = (json["is_final"] as? Bool) ?? false
        let heard = pendingFinal + transcript
        liveTranscript = heard

        // User is still speaking — cancel any pending reset
        cancelSilenceTimer()

        if isFinal {
            // is_final only locks in a chunk of audio; the user may still be mid-sentence
            // ("add bean" | "burrito to cart"). Act once they actually stopped.
            pendingFinal += transcript + " "
            if (json["speech_final"] as? Bool) == true || (json["from_finalize"] as? Bool) == true {
                flushPendingFinal()
                return
            }
        } else if let command = commandText(heard) {
            handleInterimTranscript(command)
        }
        armQuietTimer()
    }

    private var pendingFinal = ""

    /// Deepgram's own end-of-speech signals (speech_final, UtteranceEnd) can lag by seconds in a
    /// noisy room; a test showed a 5s wait. If no new words arrive for this long, finish up ourselves.
    // Deepgram can go ~1.1s between updates mid-sentence (measured), so shorter cuts phrases in half.
    private static let quietMS = 1200  // lower = snappier, higher = fewer mid-sentence cut-offs
    private var quietTimer: DispatchWorkItem?

    private func armQuietTimer() {
        quietTimer?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self, self.isListening else { return }
                // Ask Deepgram to finalize audio it's still holding; its reply (from_finalize) flushes it.
                self.dgTask?.send(.string(#"{"type":"Finalize"}"#)) { _ in }
                self.flushPendingFinal()
            }
        }
        quietTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(Self.quietMS), execute: work)
    }

    private func flushPendingFinal() {
        let text = pendingFinal.trimmingCharacters(in: .whitespaces)
        pendingFinal = ""
        guard !text.isEmpty else { return }
        cancelStabilityTimer()
        armSilenceTimer()
        guard let command = commandText(text) else {
            logger.info("[voice] Ignored (no wake word): \(text, privacy: .public)")
            return
        }
        finalTranscript += command + " "
        currentUtterance = command
        handleFinalTranscript(command)
    }

    /// The part of `text` meant for Runic, or nil if it wasn't addressed to Runic.
    private func commandText(_ text: String) -> String? {
        guard requireWakeWord else { return text }
        if let r = text.range(of: Self.wakePattern, options: [.regularExpression, .caseInsensitive]) {
            isAwake = true
            actedThisUtterance = true
            let rest = String(text[r.upperBound...])
            return rest.trimmingCharacters(in: .whitespaces).isEmpty ? nil : rest
        }
        guard isAwake || Date() < awakeUntil else { return nil }
        isAwake = true
        return text
    }

    // MARK: - Incremental Dispatch: Interim

    private func handleInterimTranscript(_ text: String) {
        // 1. Instant navigate to known sites, instant search on known sites
        tryInstantNavigate(text)
        tryInstantSearch(text, isFinal: false)

        // 2. Arm stability timer — if text stays unchanged for 300ms, ask LLM
        if text != lastInterimText {
            lastInterimText = text
            cancelStabilityTimer()

            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                Task { @MainActor in
                    await self.onInterimStable(text)
                }
            }
            stabilityTimer = work
            DispatchQueue.main.asyncAfter(
                deadline: .now() + .milliseconds(Self.stabilityMS),
                execute: work
            )
        }
    }

    /// Regex-based instant navigate for known sites. Fires on interim results
    /// so navigation starts before the user finishes speaking.
    /// Sets lastNavigatedSite immediately so follow-up commands have context.
    private func tryInstantNavigate(_ text: String) {
        for part in Self.splitOnConjunctions(text) {
            let trimmed = part.trimmingCharacters(in: .whitespaces)
            let range = NSRange(trimmed.startIndex..., in: trimmed)
            guard let match = navigatePattern.firstMatch(in: trimmed, range: range),
                  let targetRange = Range(match.range(at: 1), in: trimmed) else { continue }

            let target = String(trimmed[targetRange]).trimmingCharacters(in: .whitespaces)
            guard let url = resolveURL(target) else { continue }

            let fingerprint = "navigate:\(url)"
            guard !dispatchedFingerprints.contains(fingerprint) else { continue }

            dispatchedFingerprints.insert(fingerprint)
            handledInterimParts.insert(Self.clauseKey(trimmed))
            // Set context IMMEDIATELY so follow-up parts know where we are
            lastNavigatedSite = url
            logger.info("[dispatch] Instant navigate → \(url, privacy: .public)")
            statusLine = "Opening \(target)..."

            let step = IntentStep(action: "open", target: url, detail: target)
            Task { await self.dispatch(step) }
        }
    }

    /// Called when interim text hasn't changed for a moment. Acts early only on clauses the user has
    /// already moved past ("open amazon AND ..."): those are finished. The last clause may still be
    /// mid-phrase ("add bean..." → "bean burrito"), so it waits for the final transcript.
    private func onInterimStable(_ text: String) async {
        let unhandled = Self.splitOnConjunctions(text).dropLast()
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !isAlreadyHandled($0) }

        guard !unhandled.isEmpty else { return }
        let textToEvaluate = unhandled.joined(separator: " and ")

        logger.info("[dispatch] Stable (\(Self.stabilityMS, privacy: .public)ms), asking LLM: \"\(textToEvaluate, privacy: .public)\"")

        guard let content = await askVoiceLLM(system: Self.stabilitySystemPrompt, transcript: textToEvaluate, timeout: 10) else { return }
        guard let parsed = try? JSONDecoder().decode(StabilityResponse.self, from: Data(content.utf8)) else {
            logger.error("[dispatch] Stable: unreadable LLM reply: \(content, privacy: .public)")
            return
        }

        // Mark each evaluated clause handled so the final pass (which checks clause by clause) skips it.
        for part in unhandled { handledInterimParts.insert(Self.clauseKey(part)) }

        for cmd in parsed.commands {
            guard cmd.complete else {
                logger.info("[dispatch] LLM says incomplete: \"\(cmd.text ?? "", privacy: .public)\"")
                continue
            }
            guard let action = cmd.action else { continue }

            let step = IntentStep(
                action: action,
                target: cmd.target ?? "",
                detail: cmd.detail ?? ""
            )
            let fp = stepFingerprint(step)
            guard !dispatchedFingerprints.contains(fp) else { continue }

            dispatchedFingerprints.insert(fp)
            logger.info("[dispatch] Stable LLM: \(step.action, privacy: .public) → \(step.target, privacy: .public) \"\(step.detail, privacy: .public)\"")
            await dispatch(step)
        }
    }

    /// "search for lofi beats" on a site with a known search URL → load that URL with no LLM call.
    /// On interim text it only takes clauses that are clearly finished: followed by "and/then", or
    /// ending in the period Deepgram adds once it thinks the sentence is over. Measured: that period
    /// shows up ~1-2s before any end-of-speech signal. If the user keeps going, the final pass simply
    /// searches again with the full phrase.
    private func tryInstantSearch(_ text: String, isFinal: Bool) {
        let clauses = Self.splitOnConjunctions(text).map { $0.trimmingCharacters(in: .whitespaces) }
        for (i, clause) in clauses.enumerated() {
            let finished = isFinal || i < clauses.count - 1 || clause.last.map { ".?!".contains($0) } == true
            guard finished, !isAlreadyHandled(clause), let (platform, query) = parseSearch(clause) else { continue }
            handledInterimParts.insert(Self.clauseKey(clause))
            let step = IntentStep(action: "search", target: platform, detail: query)
            let fp = stepFingerprint(step)
            guard !dispatchedFingerprints.contains(fp) else { continue }
            dispatchedFingerprints.insert(fp)
            logger.info("[dispatch] Instant search (\(platform, privacy: .public)): \(query, privacy: .public)")
            Task { await self.dispatch(step) }
        }
    }

    private static let searchPattern = try! NSRegularExpression(
        pattern: #"^(?:(?:can|could|would) you |please )?(?:search(?: for)?|look up)\s+(.+?)(?:\s+on\s+([a-z ]+?))?[\s.?!]*$"#,
        options: .caseInsensitive
    )

    /// (platform, query) for a plain search command on a site with a known search URL, else nil
    /// (anything fancier, or an unknown site, goes to the LLM / browser agent).
    private func parseSearch(_ clause: String) -> (String, String)? {
        let ns = clause as NSString
        guard let m = Self.searchPattern.firstMatch(in: clause, range: NSRange(location: 0, length: ns.length)) else { return nil }
        let query = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces.union(.punctuationCharacters))
        let named = m.range(at: 2).location == NSNotFound ? nil : ns.substring(with: m.range(at: 2)).lowercased()
        let platform = named ?? Self.platform(for: currentSiteURL())
        guard !query.isEmpty, Self.isPlainQuery(query), let platform, hasSearchURLPattern(platform) else { return nil }
        return (platform, query)
    }

    /// A query that still contains another command ("lofi beats n, play the first video") means the
    /// clause split missed something. Skip the instant path and let the LLM split it into steps.
    static func isPlainQuery(_ query: String) -> Bool {
        query.range(of: #"(?i)\b(?:play|click|open|go to|go back|add|scroll|select|watch|tap|buy)\b"#, options: .regularExpression) == nil
    }

    /// The site the user is on. Mid-navigation the tab still reports the old page, so trust the
    /// site we just sent it to.
    private func currentSiteURL() -> String {
        guard let tabManager else { return lastNavigatedSite ?? "" }
        return tabManager.activeWebView?.isLoading == true
            ? (lastNavigatedSite ?? tabManager.getCurrentURL())
            : tabManager.getCurrentURL()
    }

    static func clauseKey(_ clause: String) -> String {
        clause.lowercased().trimmingCharacters(in: .whitespaces.union(.punctuationCharacters))
    }

    /// True if this clause was already acted on, either as text or as an instant navigate to the
    /// same site (otherwise "open youtube" would be dispatched twice and reload the page).
    private func isAlreadyHandled(_ part: String) -> Bool {
        if handledInterimParts.contains(Self.clauseKey(part)) { return true }
        let range = NSRange(part.startIndex..., in: part)
        guard let match = navigatePattern.firstMatch(in: part, range: range),
              let targetRange = Range(match.range(at: 1), in: part),
              let url = resolveURL(String(part[targetRange])) else { return false }
        return dispatchedFingerprints.contains("navigate:\(url)")
    }

    // MARK: - Incremental Dispatch: Final

    /// Processes the final transcript, skipping any parts already dispatched
    /// by instant navigate or the stability timer.
    private func handleFinalTranscript(_ transcript: String) {
        tryInstantSearch(transcript, isFinal: true)
        let parts = Self.splitOnConjunctions(transcript)
        let unhandled = parts
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !isAlreadyHandled($0) }

        if unhandled.isEmpty {
            logger.info("[dispatch] Final: all parts already handled")
            return
        }

        let unhandledText = unhandled.joined(separator: " and ")
        logger.info("[dispatch] Final LLM: \"\(unhandledText, privacy: .public)\"")

        intentTask = Task { [weak self] in
            await self?.detectFinalIntent(unhandledText)
        }
    }

    private func detectFinalIntent(_ text: String) async {
        guard let content = await askVoiceLLM(system: Self.intentSystemPrompt, transcript: text, timeout: 30) else { return }
        guard let parsed = try? JSONDecoder().decode(IntentResponse.self, from: Data(content.utf8)) else {
            logger.error("[dispatch] Final: unreadable LLM reply: \(content, privacy: .public)")
            return
        }
        if parsed.steps.isEmpty { logger.info("[dispatch] Final: LLM found no action in \"\(text, privacy: .public)\"") }

        for step in parsed.steps {
            let fp = stepFingerprint(step)
            guard !dispatchedFingerprints.contains(fp) else {
                logger.info("[dispatch] Final dedup: skipping \(fp, privacy: .public)")
                continue
            }
            dispatchedFingerprints.insert(fp)
            logger.info("[dispatch] Final: \(step.action, privacy: .public) → \(step.target, privacy: .public)")
            await dispatch(step)
        }
    }

    /// One JSON-mode call to the voice model. On a rate limit it falls back to the other Groq models
    /// (each has its own free-tier budget) instead of silently dropping the command.
    private func askVoiceLLM(system: String, transcript: String, timeout: TimeInterval) async -> String? {
        guard let url = URL(string: "\(llmBaseURL)/chat/completions") else { return nil }
        let models = [Secrets.voiceModel] + ["openai/gpt-oss-120b", Secrets.agentModel].filter { $0 != Secrets.voiceModel }
        for model in models {
            var body: [String: Any] = [
                "model": model,
                "messages": [
                    ["role": "system", "content": system],
                    ["role": "user", "content": "\(buildContext())\n\nTranscript: \"\(transcript)\""],
                ],
                "response_format": ["type": "json_object"],
                "max_tokens": 500,
                "temperature": 0,
            ]
            if let effort = LLMService.reasoningEffort(for: model) { body["reasoning_effort"] = effort }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.addValue("Bearer \(llmKey)", forHTTPHeaderField: "Authorization")
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = timeout
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  let code = (response as? HTTPURLResponse)?.statusCode else { return nil }
            if code == 429 { logger.warning("[voice] \(model, privacy: .public) rate limited, trying next"); continue }
            guard code == 200 else {
                logger.error("[voice] LLM API \(code, privacy: .public): \(String(data: data, encoding: .utf8) ?? "", privacy: .public)")
                return nil
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let choices = json["choices"] as? [[String: Any]],
                  let message = choices.first?["message"] as? [String: Any] else { return nil }
            return message["content"] as? String
        }
        statusLine = "Groq rate limit: try again in a few seconds"
        return nil
    }

    // MARK: - Dispatch

    private func dispatch(_ step: IntentStep) async {
        guard let tabManager else {
            logger.error("[dispatch] tabManager is nil — cannot dispatch")
            return
        }
        statusLine = Self.friendlyStatus(step)
        actedThisUtterance = true
        logger.info("Dispatch \(step.action, privacy: .public) → \(step.target, privacy: .public) (\(step.detail, privacy: .public))")

        // Ensure a tab exists before navigating
        if tabManager.tabs.isEmpty {
            tabManager.createTab(url: "about:blank")
        }

        switch step.action {
        case "open":
            lastNavigatedSite = step.target
            await tabManager.navigate(to: step.target)

        case "search":
            // Sites with a known search URL get that URL loaded directly: instant, no AI agent, no
            // tokens. The agent (find the search box, type, confirm) costs 1-2s and is only for the rest.
            let targetLower = step.target.lowercased()
            let isCurrentSite = targetLower == "current site" || targetLower == "current page"
            let platform = isCurrentSite ? Self.platform(for: currentSiteURL()) : targetLower

            if let platform, hasSearchURLPattern(platform) {
                let url = searchURL(platform: platform, query: step.detail)
                logger.info("[dispatch] Direct search URL → \(url, privacy: .public)")
                lastNavigatedSite = url
                await tabManager.navigate(to: url)
            } else {
                // Search on the current page via browser agent.
                // Wait for any pending navigation to finish first.
                await tabManager.waitUntilLoaded()
                let task = "Find the search bar or search input on this page and search for: \(step.detail). Show the results and stop. Do NOT click into any result."
                logger.info("[dispatch] On-page search via agent: \(task, privacy: .public)")
                await browserAgent?.enqueue(task: task)
            }

        case "type", "click", "scroll", "send", "create":
            // Wait for page to be loaded before interacting
            await tabManager.waitUntilLoaded()
            let task = "\(step.action) \(step.detail) in \(step.target)".trimmingCharacters(in: .whitespaces)
            await browserAgent?.enqueue(task: task)

        default:
            logger.warning("Unknown action: \(step.action, privacy: .public)")
        }

        // Write back to session context — the "AIP write" step.
        // The next utterance's LLM call will see this in its hydrated context.
        let pageTitle = tabManager.activeTab?.title ?? ""
        session.record(
            utterance: currentUtterance.isEmpty ? liveTranscript : currentUtterance,
            action: step.action,
            target: step.target,
            detail: step.detail,
            pageTitle: pageTitle
        )
    }

    static func friendlyStatus(_ step: IntentStep) -> String {
        let what = step.detail.isEmpty ? step.target : step.detail
        switch step.action {
        case "open": return "Opening \(step.detail.isEmpty ? (URL(string: step.target)?.host ?? step.target) : step.detail)"
        case "search": return "Searching for \"\(step.detail)\""
        case "click": return "Clicking \(what)"
        case "type": return "Typing \"\(step.detail)\""
        case "scroll": return "Scrolling \(step.detail)"
        case "go_back": return "Going back"
        default: return "\(step.action.capitalized) \(what)"
        }
    }

    // MARK: - Helpers

    private func cancelStabilityTimer() {
        stabilityTimer?.cancel()
        stabilityTimer = nil
    }

    private func armSilenceTimer() {
        cancelSilenceTimer()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                guard self.isListening else { return }
                // Hands-free: the mic stays open. Just start fresh so the next sentence is a new command.
                logger.info("[voice] Utterance done after \(Self.utteranceResetMS, privacy: .public)ms silence, ready for next")
                self.resetDispatchState()
                self.liveTranscript = ""
                self.finalTranscript = ""
                self.statusLine = ""
                if self.actedThisUtterance { self.awakeUntil = Date().addingTimeInterval(Self.followUpSeconds) }
                self.actedThisUtterance = false
                self.isAwake = false
            }
        }
        silenceTimer = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + .milliseconds(Self.utteranceResetMS),
            execute: work
        )
    }

    private func cancelSilenceTimer() {
        silenceTimer?.cancel()
        silenceTimer = nil
    }

    /// Build the context "slice" for LLM hydration — current site + session history.
    /// This is the lightweight AIP pattern: each LLM call gets a compact view
    /// of everything that happened so far, so follow-ups and corrections work.
    private func buildContext() -> String {
        var parts: [String] = []

        // Current location
        if let site = lastNavigatedSite {
            parts.append("Current site: \(site)")
            // Also include the page title if available
            if let title = tabManager?.activeTab?.title, !title.isEmpty {
                parts.append("Page title: \(title)")
            }
        } else {
            parts.append("The user has not navigated anywhere yet.")
        }

        // Session history — the "hydrated slice"
        let history = session.hydrate()
        if history != "No prior actions this session." {
            parts.append("Session history (previous commands and results):\n\(history)")
        }

        // Instruction for on-site search
        if lastNavigatedSite != nil {
            parts.append("If the user asks to find/search/look for something, they mean ON THE CURRENT SITE, not Google.")
            parts.append("If the user corrects a previous action (e.g. \"no not that\", \"I want X not Y\"), use the session history to understand what they're referring to and issue a corrected action.")
        }

        return parts.joined(separator: "\n")
    }

    /// Splits speech into clauses on "and" / "then" / "also" (and a lone "n", which is how Deepgram
    /// writes a fast "and": "lofi beats n, play the first video"). Tolerates the punctuation Deepgram adds
    /// ("lofi beats and, like, play the first video" used to stay one clause and became the YouTube
    /// search query) and drops filler words first.
    static func splitOnConjunctions(_ text: String) -> [String] {
        text.replacingOccurrences(of: fillerPattern, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"(?i)[\s,;]+(?:and then|and|then|also|n)\b[\s,;]*"#, with: "\u{1F}", options: .regularExpression)
            .components(separatedBy: "\u{1F}")
            .map { $0.trimmingCharacters(in: .whitespaces.union(CharacterSet(charactersIn: ","))) }
            .filter { !$0.isEmpty }
    }

    /// "um", "uh", and "like," / "you know," used as filler (with the comma, so "songs like this" stays).
    private static let fillerPattern = #"(?i)\b(?:um+|uh+|erm)\b[,.]?|(?<=[\s,])like,|\byou know,"#

    private func stepFingerprint(_ step: IntentStep) -> String {
        switch step.action {
        case "open", "navigate":
            let url = resolveURL(step.target) ?? step.target
            return "navigate:\(url)"
        case "go_back":
            return "go_back"
        default:
            let key = (step.detail.isEmpty ? step.target : step.detail).lowercased()
            return "\(step.action):\(key)"
        }
    }

    /// Sites where we have a direct search URL pattern.
    /// For anything else, use the browser agent to search on-page.
    private static let knownSearchSites: Set<String> = [
        "youtube", "gmail", "twitter", "x", "reddit",
        "github", "amazon", "wikipedia", "google maps", "google",
        "facebook marketplace", "ebay",
    ]

    /// Which known search platform a URL belongs to ("https://www.youtube.com/watch?v=…" → "youtube").
    /// Matches on the host, so "netflix.com" doesn't count as "x.com".
    static func platform(for url: String) -> String? {
        let full = url.contains("://") ? url : "https://\(url)"
        guard let comps = URL(string: full), let host = comps.host?.lowercased() else { return nil }
        let path = comps.path.lowercased()
        func on(_ domain: String) -> Bool { host == domain || host.hasSuffix("." + domain) }
        if on("google.com") && path.hasPrefix("/maps") { return "google maps" }
        if on("facebook.com") && path.hasPrefix("/marketplace") { return "facebook marketplace" }
        if on("mail.google.com") { return "gmail" }
        let sites = [("youtube.com", "youtube"), ("amazon.com", "amazon"), ("reddit.com", "reddit"),
                     ("github.com", "github"), ("x.com", "x"), ("twitter.com", "x"),
                     ("wikipedia.org", "wikipedia"), ("ebay.com", "ebay"), ("google.com", "google")]
        return sites.first { on($0.0) }?.1
    }

    private func hasSearchURLPattern(_ platform: String) -> Bool {
        Self.knownSearchSites.contains(platform.lowercased())
    }

    private func searchURL(platform: String, query: String) -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        switch platform.lowercased() {
        case "youtube": return "https://www.youtube.com/results?search_query=\(q)"
        case "gmail": return "https://mail.google.com/mail/u/0/#search/\(q)"
        case "twitter", "x": return "https://x.com/search?q=\(q)"
        case "reddit": return "https://www.reddit.com/search/?q=\(q)"
        case "github": return "https://github.com/search?q=\(q)"
        case "amazon": return "https://www.amazon.com/s?k=\(q)"
        case "wikipedia": return "https://en.wikipedia.org/wiki/Special:Search?search=\(q)"
        case "google maps": return "https://www.google.com/maps/search/\(q)"
        case "facebook marketplace": return "https://www.facebook.com/marketplace/search/?query=\(q)"
        case "ebay": return "https://www.ebay.com/sch/i.html?_nkw=\(q)"
        default: return "https://www.google.com/search?q=\(q)"
        }
    }

    // MARK: - LLM Prompts

    private static let stabilitySystemPrompt = """
    You are a voice command parser for a browser automation assistant. You receive a partial \
    transcript of someone speaking a command to control a web browser.

    You also receive SESSION HISTORY — a log of what the user previously said and what actions \
    were taken. Use this to understand corrections, follow-ups, and references like "not that", \
    "the other one", "go back", etc.

    Your job: determine if the text contains one or more COMPLETE, executable browser commands. \
    A command is complete if you have enough information to act on it right now.

    IMPORTANT rules:
    - If a phrase seems mid-sentence or cut off, it is INCOMPLETE.
    - The mic is always on: conversation or commentary that isn't a request to the browser is INCOMPLETE.
    - If a phrase is clearly a full command, it is COMPLETE.
    - Split multi-command sentences on "and" / "then" and evaluate each part independently.
    - Ignore filler words like "can you", "please", "um", "uh".
    - CRITICAL: If the user is currently on a website and asks to "find" or "search" something, \
    the search target is THE CURRENT SITE, not Google.
    - CORRECTIONS: If the user says "no", "not that", "I want X not Y", look at the session \
    history to understand what they're correcting. Generate a new action that fixes it. \
    Example: history shows "searched for cat videos → YouTube Shorts result", user says \
    "no I want a video not a short" → search with detail="cute cat videos -shorts" or \
    click to filter by "Videos" tab.

    Return JSON:
    {
      "commands": [
        {"complete": true, "action": "...", "target": "...", "detail": "..."},
        {"complete": false, "text": "the actual incomplete phrase"}
      ]
    }

    Actions: "open" (target=URL), "search" (target=site name or "current site", detail=query), \
    "click" (target=element description), "type" (target=field, detail=text), "scroll" \
    (detail="up"/"down"), "go_back"

    Common URL mappings: google→google.com, youtube→youtube.com, gmail→mail.google.com, \
    reddit→reddit.com, github→github.com, amazon→amazon.com, \
    facebook marketplace→facebook.com/marketplace

    Only return valid JSON. No explanation.
    """

    private static let intentSystemPrompt = """
    You are an intent classifier for a voice-controlled browser assistant. You receive \
    transcribed speech and identify actionable browser commands.

    You also receive SESSION HISTORY — a log of what the user previously said and what \
    actions were taken. Use this to understand:
    - Corrections: "no not that", "I want X not Y" → look at what was done before and fix it
    - Follow-ups: "click on the first one", "scroll down" → act on the current page
    - References: "that video", "the other one" → resolve from history

    Return JSON: {"steps": [{"action": "...", "target": "...", "detail": "..."}, ...]}

    Supported actions:
    - "open" — open a website. target = full URL, detail = label
    - "search" — search on a site or the web. target = site name or "current site", \
    detail = search query
    - "type" — type text into a field. target = field description, detail = text to type
    - "click" — click a UI element. target = element description, detail = context
    - "scroll" — scroll the page. target = "page", detail = "up" or "down"
    - "go_back" — navigate back. target = "browser", detail = ""

    CRITICAL RULES:
    1. If the user is currently on a website and asks to find/search/look for something, \
    search ON THE CURRENT SITE (target="current site"), NOT Google.
    2. If the user corrects a previous action, generate the corrective action. \
    Example: user searched YouTube, got Shorts. Says "no I want a regular video not a short" \
    → click on "Videos" filter tab, or search with modified query.
    3. Never return empty steps for corrections — always generate the corrective action.
    4. The microphone is always on, so you also hear conversation. Only act on speech clearly \
    directed at the browser as a request (open, search, play, click, add, buy, scroll, go back, \
    type...). Commentary, talking to someone else, complaints, numbers or fragments \
    ("five six seven seconds", "it ended up working") → {"steps": []}.

    Common URL mappings:
    - google → https://www.google.com
    - youtube → https://www.youtube.com
    - gmail/email → https://mail.google.com
    - reddit → https://www.reddit.com
    - github → https://github.com
    - amazon → https://www.amazon.com
    - facebook marketplace → https://www.facebook.com/marketplace

    If the text contains no browser commands, return: {"steps": []}
    Only return valid JSON. No explanation. Only return actions the user actually asked for.
    """
}

// MARK: - Errors

enum VoiceAgentError: LocalizedError {
    case missingDeepgramKey
    case missingLLMKey
    case microphoneDenied
    case audioFormatFailed
    case badDeepgramURL

    var errorDescription: String? {
        switch self {
        case .missingDeepgramKey: return "DEEPGRAM_API_KEY is not set"
        case .missingLLMKey: return "GROQ_API_KEY is not set in .env"
        case .microphoneDenied: return "Microphone permission denied"
        case .audioFormatFailed: return "Failed to create 16 kHz PCM format"
        case .badDeepgramURL: return "Invalid Deepgram URL"
        }
    }
}
