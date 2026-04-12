//
//  BottomInputBarView.swift
//  Runic
//
//  Created by Zack Gozelski on 3/14/26.
//
import SwiftUI
import WebKit

// MARK: - BottomInputBarView

struct BottomInputBarView: View {
    var tabManager: TabManager
    var agent: BrowserAgent
    @Binding var barText: String
    @Binding var showAgentLog: Bool
    var isBarFocused: FocusState<Bool>.Binding
    var safeAreaBottom: CGFloat
    var onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            // Floating back button
            if !agent.isRunning, tabManager.activeWebView?.canGoBack == true {
                Button {
                    Task { await tabManager.goBack() }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: .circle)
                .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
            }

            // Main input bar
            HStack(spacing: 8) {
                if agent.isRunning {
                    // Agent status mode
                    ProgressView()
                        .controlSize(.mini)

                    Text(agent.currentStatusLine)
                        .font(.system(size: 13))
                        .lineLimit(1)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .onTapGesture { showAgentLog = true }
                } else {
                    // Normal input mode
                    if tabManager.getCurrentURL().hasPrefix("https") {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)
                    }

                    TextField(
                        tabManager.tabs.isEmpty
                            ? "Search, URL, or ask AI..."
                            : (tabManager.getDisplayURL().isEmpty
                                ? "Search or ask AI..."
                                : tabManager.getDisplayURL()),
                        text: $barText,
                        axis: .vertical
                    )
                    .lineLimit(1...6)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .focused(isBarFocused)
                    .onSubmit { onSubmit() }
                    .onChange(of: barText) {
                        if barText.contains("\n") {
                            barText = barText.replacingOccurrences(
                                of: "\n",
                                with: ""
                            )
                            onSubmit()
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .frame(maxWidth: 680, minHeight: 1)
            .glassEffect(.regular.interactive(), in: .capsule)
            .shadow(color: .black.opacity(0.1), radius: 8, y: 3)

            // Floating send / stop button
            if agent.isRunning {
                Button {
                    agent.stop()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Color.red, in: Circle())
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: .circle)
                .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, safeAreaBottom + 10)
        .gesture(swipeGesture)
    }

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 40, coordinateSpace: .local)
            .onEnded { value in
                guard !agent.isRunning else { return }
                let h = value.translation.width
                guard abs(h) > abs(value.translation.height), abs(h) > 50 else {
                    return
                }
                withAnimation(.snappy(duration: 0.25)) {
                    if h < 0 {
                        tabManager.switchToNextTab()
                    } else {
                        tabManager.switchToPreviousTab()
                    }
                    barText = ""
                }
            }
    }
}
