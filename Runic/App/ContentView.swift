

import SwiftUI
import WebKit



// MARK: - Gestures

struct ContentSwipeGesture: Gesture {
    var tabManager: TabManager
    var agent: BrowserAgent
    var body: some Gesture {
        DragGesture(minimumDistance: 60, coordinateSpace: .local)
            .onEnded { value in
                guard !agent.isRunning else { return }
                let h = value.translation.width
                guard abs(h) > abs(value.translation.height), abs(h) > 80
                else {
                    return
                }
                withAnimation(.snappy(duration: 0.25)) {
                    if h < 0 {
                        tabManager.switchToNextTab()
                    } else {
                        tabManager.switchToPreviousTab()
                    }
                }
            }
    }
}

// MARK: - Browser Content

struct MainBrowserView: View {
    var tabManager: TabManager
    var agent: BrowserAgent
    var voiceAgent: VoiceAgent
    @Binding var barText: String
    @Binding var showAgentSheet: Bool
    @Binding var showSettings: Bool
    @Binding var isBarFocused: Bool
    var onSubmit: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                ZStack {
                    if tabManager.tabs.isEmpty {
                        StartPageView()
                    } else {
                        BrowserWebView(
                            webView: tabManager.activeWebView ?? WKWebView(),
                            tabID: tabManager.activeTab?.id ?? UUID(),
                            tabManager: tabManager
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .gesture(
                            ContentSwipeGesture(
                                tabManager: tabManager,
                                agent: agent
                            )
                        )
                    }
                }
                .ignoresSafeArea()
            }
            .overlay(alignment: .bottom) {
                VoiceCaptionView(voice: voiceAgent, agent: agent)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }
            #if os(iOS)
                .toolbar {

                    //More menu
                    ToolbarItem(placement: .bottomBar) {
                        moreMenu
                    }

                    ToolbarSpacer(placement: .bottomBar)

                    //Back Button
                    ToolbarItem(placement: .bottomBar) {
                        backButton
                    }

                    ToolbarSpacer(placement: .bottomBar)

                    //Search bar
                    ToolbarItem(placement: .bottomBar) {
                        searchPill
                            .gesture(
                                DragGesture(
                                    minimumDistance: 30,
                                    coordinateSpace: .local
                                )
                                .onEnded { value in
                                    let h = value.translation.width
                                    if abs(h) > 50 {
                                        if h < 0 {
                                            withAnimation(
                                                .snappy(duration: 0.25)
                                            ) {
                                                tabManager.switchToNextTab()
                                            }
                                        } else {
                                            withAnimation(
                                                .snappy(duration: 0.25)
                                            ) {
                                                tabManager.switchToPreviousTab()
                                            }
                                        }
                                    }
                                }
                            )
                    }

                    ToolbarSpacer(placement: .bottomBar)

                    // Mic button
                    ToolbarItem(placement: .bottomBar) {
                        micButton
                    }

                    ToolbarSpacer(placement: .bottomBar)

                    //Send / Stop Button
                    ToolbarItem(placement: .bottomBar) {
                        sendButton
                    }
                }
            #else
                // macOS has no bottom toolbar placement, so the same controls sit in a bar under the content.
                .safeAreaInset(edge: .bottom) {
                    HStack(spacing: 14) {
                        moreMenu
                        backButton
                        searchPill
                            .padding(.vertical, 10)
                            .glassEffect(.regular, in: .capsule)
                        micButton
                        sendButton
                    }
                    .buttonStyle(.borderless)
                    .font(.system(size: 16, weight: .medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            #endif
        }
    }

    @ViewBuilder
    private var backButton: some View {
        if !agent.isRunning, tabManager.activeWebView?.canGoBack == true {
            Button {
                Task { await tabManager.goBack() }
            } label: {
                Image(systemName: "chevron.left")
            }
        }
    }

    private var micButton: some View {
        Button {
            Task {
                if voiceAgent.isListening {
                    voiceAgent.stop()
                } else {
                    do {
                        try await voiceAgent.start()
                    } catch {
                        voiceAgent.statusLine = error.localizedDescription
                    }
                }
            }
        } label: {
            Image(systemName: voiceAgent.isListening ? "mic.fill" : "mic")
                .foregroundStyle(voiceAgent.isListening ? .red : .primary)
        }
    }

    @ViewBuilder
    private var sendButton: some View {
        if agent.isRunning {
            Button {
                agent.stop()
            } label: {
                Image(systemName: "stop.fill")
                .background(
                    Color.red,
                    in: RoundedRectangle(cornerRadius: 8)
                )
            }
        } else {
            Button {
                isBarFocused = false
                onSubmit()
            } label: {
                Image(systemName: "arrow.up")
            }
        }
    }

    private var searchPill: some View {
        HStack(spacing: 10) {
            if tabManager.tabs.count > 1 && !agent.isRunning {
                Text("\(tabManager.activeTabIndex + 1)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(
                        .quaternary,
                        in: RoundedRectangle(cornerRadius: 4)
                    )
            }

            if tabManager.getCurrentURL().hasPrefix("https") && !agent.isRunning
            {
                Image(systemName: "lock.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(.green)
            }

            // Voice is always on and shown in the caption above, so the bar stays a normal text field.
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
                    tabManager.tabs.isEmpty
                        || tabManager.getDisplayURL().isEmpty
                        ? "Search or enter website name"
                        : tabManager.getDisplayURL(),
                    text: $barText,
                    axis: .vertical
                )
                //TODO: re-enable this and allow the view to grow taller to show the text content.
                .lineLimit(1...6)
                .textFieldStyle(.plain)
                .onSubmit {
                    isBarFocused = false
                    onSubmit()
                }
                //TODO: make this a struct and let the barText propagate to refresh the vew
                .font(.system(size: barText.isEmpty ? 16 : 16))
            }

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
    }

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
                    withAnimation(.snappy(duration: 0.25)) {
                        tabManager.switchToNextTab()
                    }
                } label: {
                    Label("Next Tab", systemImage: "chevron.right")
                }

                Button {
                    withAnimation(.snappy(duration: 0.25)) {
                        tabManager.switchToPreviousTab()
                    }
                } label: {
                    Label("Previous Tab", systemImage: "chevron.left")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
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

struct BrowserContentView: View {
    var tabManager: TabManager
    var agent: BrowserAgent

    var body: some View {
        BrowserWebView(
            webView: tabManager.activeWebView ?? WKWebView(),
            tabID: tabManager.activeTab?.id ?? UUID(),
            tabManager: tabManager
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .gesture(ContentSwipeGesture(tabManager: tabManager, agent: agent))
    }
}

// MARK: - AgentPopoverButton

struct AgentPanelView: View {
    var agent: BrowserAgent
    @Binding var isPresented: Bool
    @Binding var showSettings: Bool

    var body: some View {
        NavigationStack {
            AgentLogPanelView(agent: agent, showSettings: $showSettings)
                .navigationTitle("Agent")
                #if !os(macOS)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Done") {
                                isPresented = false
                            }
                        }
                    }
                #else
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") {
                                isPresented = false
                            }
                        }
                    }

                #endif  // !os(macOS)
        }
    }
}

// MARK: - ResultToastView

struct ResultToastView: View {
    let result: String
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Label("Result", systemImage: "checkmark.circle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.green)

                Spacer()

                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 20, height: 20)
                        .background(.quaternary.opacity(0.5), in: Circle())
                }
                .buttonStyle(.plain)
            }

            Text(result)
                .font(.system(size: 13))
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
        .padding(14)
        .frame(maxWidth: 400)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        .padding(.top, 60)
    }
}


// MARK: - ContentView

struct ContentView: View {
    @State private var tabManager = TabManager()
    @State private var agent = BrowserAgent()
    @State private var voiceAgent = VoiceAgent()
    @State private var barText = ""
    @State private var showAgentLog = false
    @State private var showAgentSheet = false
    @State private var showSettings = false
    @State private var hoveredTabID: UUID?
    @State private var isBarFocused: Bool = false
    @State private var showResultToast = false

    var body: some View {
        Group {
            mainContent
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showAgentSheet) {
            AgentPanelView(
                agent: agent,
                isPresented: $showAgentSheet,
                showSettings: $showSettings
            )
        }
        .onChange(of: tabManager.isBarVisible) {
            if !tabManager.isBarVisible {
                isBarFocused = false
            }
        }
        .onChange(of: agent.finalResult) { _, newValue in
            if newValue != nil {
                withAnimation(.snappy(duration: 0.3)) {
                    showResultToast = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
                    if showResultToast {
                        withAnimation {
                            showResultToast = false
                        }
                    }
                }
            }
        }
        .onAppear { loadState() }
        .task {
            // Hands-free: start listening as soon as the app opens.
            guard !Secrets.deepgramAPIKey.isEmpty else { return }
            do { try await voiceAgent.start() } catch { voiceAgent.statusLine = error.localizedDescription }
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        MainBrowserView(
            tabManager: tabManager,
            agent: agent,
            voiceAgent: voiceAgent,
            barText: $barText,
            showAgentSheet: $showAgentSheet,
            showSettings: $showSettings,
            isBarFocused: $isBarFocused,
            onSubmit: handleSubmit
        )
    }

    private func loadState() {
        agent.tabManager = tabManager
        voiceAgent.tabManager = tabManager
        voiceAgent.browserAgent = agent
    }

    // MARK: - Safe Area Helpers

    private var safeAreaTop: CGFloat {
        #if os(macOS)
            return 0
        #else
            let scenes = UIApplication.shared.connectedScenes
            let windowScene = scenes.first as? UIWindowScene
            return windowScene?.windows.first?.safeAreaInsets.top ?? 0
        #endif
    }

    private var topPadding: CGFloat {
        #if os(macOS)
            return 40
        #else
            return safeAreaTop + 8
        #endif
    }

    private var safeAreaBottom: CGFloat {
        #if os(macOS)
            return 0
        #else
            let scenes = UIApplication.shared.connectedScenes
            let windowScene = scenes.first as? UIWindowScene
            return windowScene?.windows.first?.safeAreaInsets.bottom ?? 0
        #endif
    }

    // MARK: - Actions

    private func looksLikeURL(_ text: String) -> Bool {
        if text.hasPrefix("http://") || text.hasPrefix("https://") {
            return true
        }
        let parts = text.split(separator: ".")
        return !text.contains(" ") && parts.count >= 2
            && parts.last!.count >= 2
    }

    private func handleSubmit() {
        let text = barText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard !agent.isRunning else { return }

        if tabManager.tabs.isEmpty {
            tabManager.createTab(url: "https://google.com")
        }

        if let url = directNavigationURL(for: text) {
            Task { await tabManager.navigate(to: url) }
            barText = ""
            isBarFocused = false
        } else if looksLikeURL(text) {
            Task { await tabManager.navigate(to: text) }
            //TODO: make the URL part of barText---allowing it to be edited and refreshed---and disable the input when in agent mode.
            barText = ""
            isBarFocused = false
        } else {
            barText = ""
            isBarFocused = false
            Task { await agent.start(task: text) }
        }
    }
}
