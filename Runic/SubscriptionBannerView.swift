//
//  SubscriptionBannerView.swift
//  Runic
//
//  Created by Zack Gozelski on 3/17/26.
//


import SwiftUI
import WebKit

// MARK: - SubscriptionBannerView

struct SubscriptionBannerView: View {
    @Binding var showSettings: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "star.fill")
                .foregroundStyle(.yellow)

            VStack(alignment: .leading, spacing: 2) {
                Text("Runic Pro Available")
                    .font(.subheadline.weight(.semibold))
                Text("Unlock unlimited interactions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("Learn More") {
                showSettings = true
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 24))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }
}
