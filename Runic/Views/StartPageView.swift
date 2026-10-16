//
//  StartPageView.swift
//  Runic
//
//  Created by Zack Gozelski on 3/17/26.
//

import SwiftUI

// MARK: - StartPageView

/// First screen: tells a hands-free user what to say, since there's nothing to click.
struct StartPageView: View {
    @AppStorage(VoiceAgent.wakeWordDefaultsKey) private var requireWakeWord = true

    private var examples: [String] {
        let prefix = requireWakeWord ? "Runic, " : ""
        return [
            "\(prefix)open YouTube and search for lofi beats",
            "\(prefix)go to Amazon and search for noise cancelling headphones",
            "\(prefix)click the second one",
        ]
    }

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            VStack(spacing: 10) {
                Image(systemName: "waveform")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(.tint)
                Text("Just say what you want.")
                    .font(.largeTitle.weight(.semibold))
                Text(requireWakeWord ? "Start with \u{201C}Runic\u{201D}. No clicking needed." : "No clicking needed.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: 10) {
                ForEach(examples, id: \.self) { example in
                    Label("\u{201C}\(example)\u{201D}", systemImage: "quote.bubble")
                        .font(.body)
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                }
            }
            .frame(maxWidth: 520)
            .padding(.horizontal, 24)
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }
}
