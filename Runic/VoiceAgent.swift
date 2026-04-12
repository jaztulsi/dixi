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

// MARK: - Voice Agent

@Observable
@MainActor
final class VoiceAgent {
    var isListening = false
    var liveTranscript = ""
    var finalTranscript = ""
    var statusLine = ""

    var deepgramKey: String = Secrets.deepgramAPIKey
    var openAIKey: String = OpenAIService().apiKey
    var openAIBaseURL: String = "https://api.openai.com/v1"

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
    private static let silenceAutoStopMS = 2000
    private var silenceTimer: DispatchWorkItem?

    // MARK: - Public

    func start() async throws {
        guard !isListening else { return }
        guard !deepgramKey.isEmpty else {
            throw VoiceAgentError.missingDeepgramKey
        }
        guard !openAIKey.isEmpty else {
            throw VoiceAgentError.missingOpenAIKey
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
        statusLine = "Listening..."
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
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
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
            .init(name: "endpointing", value: "300"),
            .init(name: "utterance_end_ms", value: "1500"),
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
                    logger.error("Deepgram receive error: \(err.localizedDescription)")
                    self.statusLine = "Connection lost"
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
        // Process any pending transcript, then auto-stop after a short delay.
        if eventType == "UtteranceEnd" {
            logger.info("[deepgram] UtteranceEnd — arming auto-stop")
            armSilenceTimer()
            return
        }

        guard eventType == "Results",
              let channel = json["channel"] as? [String: Any],
              let alts = channel["alternatives"] as? [[String: Any]],
              let transcript = alts.first?["transcript"] as? String,
              !transcript.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        let isFinal = (json["is_final"] as? Bool) ?? false
        liveTranscript = transcript

        // User is still speaking — cancel any pending auto-stop
        cancelSilenceTimer()

        if isFinal {
            cancelStabilityTimer()
            finalTranscript += transcript + " "
            currentUtterance = transcript
            handleFinalTranscript(transcript)
        } else {
            handleInterimTranscript(transcript)
        }
    }

    // MARK: - Incremental Dispatch: Interim

    private func handleInterimTranscript(_ text: String) {
        // 1. Instant navigate to known sites
        tryInstantNavigate(text)

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
        for part in splitOnConjunctions(text) {
            let trimmed = part.trimmingCharacters(in: .whitespaces)
            let range = NSRange(trimmed.startIndex..., in: trimmed)
            guard let match = navigatePattern.firstMatch(in: trimmed, range: range),
                  let targetRange = Range(match.range(at: 1), in: trimmed) else { continue }

            let target = String(trimmed[targetRange]).trimmingCharacters(in: .whitespaces)
            guard let url = resolveURL(target) else { continue }

            let fingerprint = "navigate:\(url)"
            guard !dispatchedFingerprints.contains(fingerprint) else { continue }

            dispatchedFingerprints.insert(fingerprint)
            handledInterimParts.insert(trimmed.lowercased())
            // Set context IMMEDIATELY so follow-up parts know where we are
            lastNavigatedSite = url
            logger.info("[dispatch] Instant navigate → \(url)")
            statusLine = "Opening \(target)..."

            let step = IntentStep(action: "open", target: url, detail: target)
            Task { await self.dispatch(step) }
        }
    }

    /// Called when interim text hasn't changed for 300ms.
    /// Asks LLM whether the partial transcript contains complete, executable commands.
    private func onInterimStable(_ text: String) async {
        let unhandled = splitOnConjunctions(text)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !handledInterimParts.contains($0.lowercased()) }

        guard !unhandled.isEmpty else { return }
        let textToEvaluate = unhandled.joined(separator: " and ")

        logger.info("[dispatch] Stable (\(Self.stabilityMS)ms), asking LLM: \"\(textToEvaluate)\"")

        let context = buildContext()

        let body: [String: Any] = [
            "model": "gpt-4o-mini",
            "messages": [
                ["role": "system", "content": Self.stabilitySystemPrompt],
                ["role": "user", "content": "\(context)\n\nTranscript: \"\(textToEvaluate)\""],
            ],
            "response_format": ["type": "json_object"],
            "max_tokens": 500,
            "temperature": 0,
        ]

        guard let url = URL(string: "\(openAIBaseURL)/chat/completions") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(openAIKey)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? -1
                let body = String(data: data, encoding: .utf8) ?? "(no body)"
                logger.error("[dispatch] Stable LLM API \(code): \(body)")
                return
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let choices = json["choices"] as? [[String: Any]],
                  let message = choices.first?["message"] as? [String: Any],
                  let content = message["content"] as? String,
                  let parsed = try? JSONDecoder().decode(StabilityResponse.self, from: Data(content.utf8))
            else { return }

            for cmd in parsed.commands {
                guard cmd.complete else {
                    logger.info("[dispatch] LLM says incomplete: \"\(cmd.text ?? "")\"")
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
                handledInterimParts.insert(textToEvaluate.lowercased())
                logger.info("[dispatch] Stable LLM: \(step.action) → \(step.target) \"\(step.detail)\"")
                await dispatch(step)
            }
        } catch {
            logger.error("[dispatch] Stable LLM error: \(error.localizedDescription)")
        }
    }

    // MARK: - Incremental Dispatch: Final

    /// Processes the final transcript, skipping any parts already dispatched
    /// by instant navigate or the stability timer.
    private func handleFinalTranscript(_ transcript: String) {
        let parts = splitOnConjunctions(transcript)
        let unhandled = parts
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { part in
                guard !part.isEmpty else { return false }
                if handledInterimParts.contains(part.lowercased()) { return false }
                // Check if it's a navigate we already dispatched
                let range = NSRange(part.startIndex..., in: part)
                if let match = navigatePattern.firstMatch(in: part, range: range),
                   let targetRange = Range(match.range(at: 1), in: part) {
                    let target = String(part[targetRange]).trimmingCharacters(in: .whitespaces)
                    if let url = resolveURL(target),
                       dispatchedFingerprints.contains("navigate:\(url)") {
                        return false
                    }
                }
                return true
            }

        if unhandled.isEmpty {
            logger.info("[dispatch] Final: all parts already handled")
            return
        }

        let unhandledText = unhandled.joined(separator: " and ")
        logger.info("[dispatch] Final LLM: \"\(unhandledText)\"")

        intentTask = Task { [weak self] in
            await self?.detectFinalIntent(unhandledText)
        }
    }

    private func detectFinalIntent(_ text: String) async {
        let context = buildContext()

        let body: [String: Any] = [
            "model": "gpt-4o-mini",
            "messages": [
                ["role": "system", "content": Self.intentSystemPrompt],
                ["role": "user", "content": "\(context)\n\nTranscript: \"\(text)\""],
            ],
            "response_format": ["type": "json_object"],
            "max_tokens": 500,
            "temperature": 0,
        ]

        guard let url = URL(string: "\(openAIBaseURL)/chat/completions") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(openAIKey)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? -1
                let body = String(data: data, encoding: .utf8) ?? "(no body)"
                logger.error("Intent API \(code): \(body)")
                return
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let choices = json["choices"] as? [[String: Any]],
                  let message = choices.first?["message"] as? [String: Any],
                  let content = message["content"] as? String,
                  let parsed = try? JSONDecoder().decode(IntentResponse.self, from: Data(content.utf8))
            else { return }

            for step in parsed.steps {
                let fp = stepFingerprint(step)
                guard !dispatchedFingerprints.contains(fp) else {
                    logger.info("[dispatch] Final dedup: skipping \(fp)")
                    continue
                }
                dispatchedFingerprints.insert(fp)
                logger.info("[dispatch] Final: \(step.action) → \(step.target)")
                await dispatch(step)
            }
        } catch {
            logger.error("Intent error: \(error.localizedDescription)")
        }
    }

    // MARK: - Dispatch

    private func dispatch(_ step: IntentStep) async {
        guard let tabManager else {
            logger.error("[dispatch] tabManager is nil — cannot dispatch")
            return
        }
        statusLine = "\(step.action): \(step.detail.isEmpty ? step.target : step.detail)"
        logger.info("Dispatch \(step.action) → \(step.target) (\(step.detail))")

        // Ensure a tab exists before navigating
        if tabManager.tabs.isEmpty {
            tabManager.createTab(url: "about:blank")
        }

        switch step.action {
        case "open":
            lastNavigatedSite = step.target
            await tabManager.navigate(to: step.target)

        case "search":
            // Determine if we should search on the current page vs. navigating to a search URL.
            let currentURL = tabManager.getCurrentURL().lowercased()
            let targetLower = step.target.lowercased()
            let isCurrentSite = targetLower == "current site" || targetLower == "current page"
            let alreadyOnSite = isCurrentSite
                || lastNavigatedSite.map { $0.lowercased().contains(targetLower) } ?? false
                || currentURL.contains(targetLower)

            if alreadyOnSite || !hasSearchURLPattern(step.target) {
                // Search on the current page via browser agent.
                // Wait for any pending navigation to finish first.
                await tabManager.waitUntilLoaded()
                let task = "Find the search bar or search input on this page and search for: \(step.detail). Show the results and stop. Do NOT click into any result."
                logger.info("[dispatch] On-page search via agent: \(task)")
                await browserAgent?.start(task: task)
            } else {
                let url = searchURL(platform: step.target, query: step.detail)
                lastNavigatedSite = url
                await tabManager.navigate(to: url)
            }

        case "type", "click", "scroll", "send", "create":
            // Wait for page to be loaded before interacting
            await tabManager.waitUntilLoaded()
            let task = "\(step.action) \(step.detail) in \(step.target)".trimmingCharacters(in: .whitespaces)
            await browserAgent?.start(task: task)

        default:
            logger.warning("Unknown action: \(step.action)")
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
                logger.info("[voice] Auto-stopping after \(Self.silenceAutoStopMS)ms silence")
                self.stop()
            }
        }
        silenceTimer = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + .milliseconds(Self.silenceAutoStopMS),
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

    private func splitOnConjunctions(_ text: String) -> [String] {
        // Case-insensitive split on "and", "then", "also"
        let pattern = #"(?i)\s+(?:and|then|also)\s+"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return [text]
        }
        let nsText = text as NSString
        var parts: [String] = []
        var lastEnd = 0
        let matches = regex.matches(in: text, range: NSRange(location: 0, length: nsText.length))
        for match in matches {
            let partRange = NSRange(location: lastEnd, length: match.range.location - lastEnd)
            parts.append(nsText.substring(with: partRange))
            lastEnd = match.range.location + match.range.length
        }
        parts.append(nsText.substring(from: lastEnd))
        return parts.filter { !$0.isEmpty }
    }

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
    case missingOpenAIKey
    case microphoneDenied
    case audioFormatFailed
    case badDeepgramURL

    var errorDescription: String? {
        switch self {
        case .missingDeepgramKey: return "DEEPGRAM_API_KEY is not set"
        case .missingOpenAIKey: return "OpenAI API key is not set"
        case .microphoneDenied: return "Microphone permission denied"
        case .audioFormatFailed: return "Failed to create 16 kHz PCM format"
        case .badDeepgramURL: return "Invalid Deepgram URL"
        }
    }
}
