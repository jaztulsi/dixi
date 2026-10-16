//
//  VoiceCaptionView.swift
//  Runic
//
//  Live caption for hands-free use: what Runic hears (large, readable from a distance),
//  whether it's listening to you, and what it's doing about it.
//

import SwiftUI

struct VoiceCaptionView: View {
    var voice: VoiceAgent
    var agent: BrowserAgent
    @AppStorage(VoiceAgent.wakeWordDefaultsKey) private var requireWakeWord = true

    private var addressed: Bool { voice.isAwake || !requireWakeWord }

    private var stateLabel: String {
        if !voice.isListening { return "Voice off" }
        if voice.isAwake { return "Listening to you" }
        return requireWakeWord ? "Say \u{201C}Runic\u{201D} + a command" : "Listening"
    }

    /// What Runic is doing right now: the agent's step, or the last voice action.
    private var activity: String? {
        if agent.isRunning, !agent.currentStatusLine.isEmpty { return agent.currentStatusLine }
        return voice.statusLine.isEmpty ? nil : voice.statusLine
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: voice.isListening ? "waveform" : "mic.slash")
                    .symbolEffect(.variableColor.iterative, isActive: voice.isAwake)
                    .foregroundStyle(voice.isAwake ? Color.red : .secondary)
                Text(stateLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(voice.isAwake ? .primary : .secondary)
                Spacer(minLength: 0)
                if agent.isRunning {
                    ProgressView().controlSize(.small)
                }
            }

            if !voice.liveTranscript.isEmpty {
                Text(voice.liveTranscript)
                    .font(.title2.weight(.semibold))
                    // Speech not addressed to Runic is shown dimmed, so it's clear it will be ignored.
                    .foregroundStyle(addressed ? .primary : .tertiary)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let activity {
                Label(activity, systemImage: "arrow.turn.down.right")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: 640)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
        .animation(.snappy(duration: 0.2), value: voice.liveTranscript)
        .animation(.snappy(duration: 0.2), value: activity)
        .animation(.snappy(duration: 0.2), value: voice.isAwake)
        .allowsHitTesting(false)  // never block clicks on the page underneath
        .accessibilityElement(children: .combine)
    }
}
