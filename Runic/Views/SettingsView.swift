//
//  SettingsView.swift
//  Runic
//
//  Settings: shows whether the API keys from .env were loaded, plus About.
//

import SwiftUI

struct SettingsView: View {
    @AppStorage(VoiceAgent.wakeWordDefaultsKey) private var requireWakeWord = true

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Require \u{201C}Runic\u{201D} wake word", isOn: $requireWakeWord)
                } header: {
                    Text("Voice")
                } footer: {
                    Text("The microphone is always on. With the wake word, Runic only acts on speech that starts with \u{201C}Runic\u{201D} (plus follow-ups for a few seconds after), so TV and conversations are ignored.")
                }

                Section {
                    keyRow("Groq (AI)", isSet: !Secrets.groqAPIKey.isEmpty)
                    keyRow("Deepgram (voice)", isSet: !Secrets.deepgramAPIKey.isEmpty)
                } header: {
                    Text("API keys")
                } footer: {
                    Text("Keys come from the .env file in the project folder. Edit it and rebuild to change them.")
                }

                Section {
                    LabeledContent("Agent model", value: Secrets.agentModel)
                    LabeledContent("Voice model", value: Secrets.voiceModel)
                }

                Section {
                    NavigationLink("About") {
                        AboutView()
                    }
                }
            }
            .navigationTitle("Settings")
            .formStyle(.grouped)
        }
    }

    private func keyRow(_ name: String, isSet: Bool) -> some View {
        LabeledContent(name) {
            Label(isSet ? "Set" : "Missing", systemImage: isSet ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(isSet ? .green : .red)
        }
    }
}

private struct AboutView: View {
    var body: some View {
        Form {
            Section {
                Text("Runic")
                    .font(.title)
                    .fontWeight(.semibold)

                Text("A hands-free, voice-controlled browser. Say what you want and Runic does it while you're still talking.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                LabeledContent("Version", value: "1.0.0")
            }
        }
        .navigationTitle("About")
    }
}

#Preview {
    SettingsView()
}
