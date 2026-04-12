//
//  StartPageView.swift
//  Runic
//
//  Created by Zack Gozelski on 3/17/26.
//


import SwiftUI
import WebKit



// MARK: - StartPageView

struct StartPageView: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 16) {
                Image(systemName: "globe")
                    .font(.system(size: 52, weight: .ultraLight))
                    .foregroundStyle(.quaternary)
                Text("Where to?")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }
}
