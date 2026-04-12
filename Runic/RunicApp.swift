
import SwiftUI

@main
struct RunicApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .defaultSize(width: 1400, height: 900)
        #if os(macOS)
        .windowStyle(.automatic)
        .windowToolbarStyle(.unifiedCompact)
        #endif
    }
}
