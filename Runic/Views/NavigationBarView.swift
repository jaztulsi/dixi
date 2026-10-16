//
//  NavigationBarView.swift
//  Runic
//
//  Navigation components for the browser
//

import SwiftUI
import WebKit


// MARK: - BottomSearchBarContent

struct BottomSearchBarContent: View {
    var tabManager: TabManager
    var agent: BrowserAgent
    @Binding var barText: String
    @Binding var showAgentSheet: Bool
    @Binding var showSettings: Bool
    @Binding var isBarFocused: Bool
    var onSubmit: () -> Void
    var onSwipeLeft: () -> Void
    var onSwipeRight: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            // Back button
            if !agent.isRunning, tabManager.activeWebView?.canGoBack == true {
                Button {
                    Task { await tabManager.goBack() }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
            }

            // Safari-style search pill
            searchPill
                .gesture(
                    DragGesture(minimumDistance: 30, coordinateSpace: .local)
                        .onEnded { value in
                            let h = value.translation.width
                            if abs(h) > 50 {
                                if h < 0 {
                                    onSwipeLeft()
                                } else {
                                    onSwipeRight()
                                }
                            }
                        }
                )

            // Stop button when running
            if agent.isRunning {
                Button {
                    agent.stop()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(Color.red, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            } else {
                // Send button
                Button {
                    barText = ""
                    isBarFocused = false
                    onSubmit()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
            }
            
            // More menu
            moreMenu
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
    
    // MARK: - Search Pill
    private var searchPill: some View {
        HStack(spacing: 10) {
            // Tab count indicator
            if tabManager.tabs.count > 1 && !agent.isRunning {
                Text("\(tabManager.activeTabIndex + 1)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))
            }
            
            // Lock icon
            if tabManager.getCurrentURL().hasPrefix("https") && !agent.isRunning {
                Image(systemName: "lock.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(.green)
            }
            
            // Content
            if agent.isRunning {
                ProgressView()
                    .controlSize(.mini)
                
                Text(agent.currentStatusLine)
                    .font(.system(size: 15))
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onTapGesture { showAgentSheet = true }
            } else {
                TextField(
                    tabManager.tabs.isEmpty || tabManager.getDisplayURL().isEmpty
                        ? "Search or enter website name"
                        : tabManager.getDisplayURL(),
                    text: $barText,
                    axis: .vertical
                )
                .lineLimit(1...6)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
                .onChange(of: isBarFocused) { _, newValue in
                    // Track focus changes
                }
            }
            
            // Close button when keyboard is active
            if isBarFocused {
                Button {
                    barText = ""
                    isBarFocused = false
                    hideKeyboard()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, minHeight: 50, maxHeight: 50)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 28))
    }
    
    // MARK: - More Menu
    private var moreMenu: some View {
        Menu {
            Button {
                showAgentSheet = true
            } label: {
                Label("AI Agent", systemImage: "brain")
            }
            
            Button {
                showSettings = true
            } label: {
                Label("Settings", systemImage: "gearshape")
            }
            
            Divider()
            
            Button {
                tabManager.createTab(url: "about:blank")
            } label: {
                Label("New Tab", systemImage: "plus")
            }
            
            Button {
                let url = tabManager.getCurrentURL()
                if !url.isEmpty {
                    #if os(macOS)
                    NSWorkspace.shared.open(URL(string: url)!)
                    #endif
                }
            } label: {
                Label("Open in Safari", systemImage: "safari")
            }
            
            Divider()
            
            if tabManager.tabs.count > 1 {
                Button {
                    onSwipeLeft()
                } label: {
                    Label("Next Tab", systemImage: "chevron.right")
                }
                
                Button {
                    onSwipeRight()
                } label: {
                    Label("Previous Tab", systemImage: "chevron.left")
                }
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 28, height: 28)
        }
        .menuStyle(.borderlessButton)
    }
    
    private func hideKeyboard() {
        #if os(macOS)
        NSApp.keyWindow?.makeFirstResponder(nil)
        #endif
    }
}
