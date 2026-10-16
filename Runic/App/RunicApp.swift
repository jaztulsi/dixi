import SwiftUI

@main
struct RunicApp: App {
    var body: some Scene {
        #if os(macOS)
        // One window, not a WindowGroup: each runic:// link from the website would otherwise open
        // another window, each with its own always-on mic stream (seen: 4 in one test).
        Window("Runic", id: "main") {
            ContentView()
        }
        .defaultSize(width: 1400, height: 900)
        .windowStyle(.automatic)
        .windowToolbarStyle(.unifiedCompact)
        #else
        WindowGroup {
            ContentView()
        }
        .defaultSize(width: 1400, height: 900)
        #endif
    }
}
