//
//  Speaker.swift
//  Runic
//
//  Spoken replies (answers, "So you want me to…?") with on-device TTS. While Runic talks, and for
//  a moment after, VoiceAgent ignores the mic: otherwise Runic hears itself and acts on it.
//

import AVFoundation

final class Speaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = Speaker()

    private let synth = AVSpeechSynthesizer()
    private var speaking = false
    private var deafUntil = Date.distantPast

    /// Deepgram delivers words ~1s late, so the mic stays deaf a bit past the end of speech.
    private static let echoTail: TimeInterval = 1.5

    var isBusy: Bool { speaking || Date() < deafUntil }

    /// When Runic was talking. Deepgram can deliver Runic's own words seconds later, after
    /// isBusy is false again, so transcripts are also checked against when their audio was spoken.
    private var spans: [(start: Date, end: Date?)] = []

    func wasSpeaking(at time: Date) -> Bool {
        spans.contains { time >= $0.start.addingTimeInterval(-0.2) && time <= ($0.end ?? .distantFuture).addingTimeInterval(0.6) }
    }

    override init() {
        super.init()
        synth.delegate = self
    }

    func say(_ text: String) {
        synth.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.05
        speaking = true
        spans = Array(spans.suffix(4)) + [(Date(), nil)]
        synth.speak(utterance)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }

    private func finished() {
        speaking = false
        deafUntil = Date().addingTimeInterval(Self.echoTail)
        if let last = spans.indices.last, spans[last].end == nil { spans[last].end = Date() }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
        Task { @MainActor in self.finished() }
    }
}
