// swift-tools-version: 6.0
// dixi-ear: the Fn key, the mic and on-device speech for Dixi, as one small helper that Electron runs.
// Build: `npm run build:ear` (from electron/), i.e. `swift build -c release` here. Needs Xcode 26 (macOS 26 SDK) for
// SpeechAnalyzer; on an older macOS it falls back to on-device SFSpeechRecognizer at run time.
import PackageDescription

let package = Package(
  name: "dixi-ear",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "dixi-ear",
      path: "Sources/dixi-ear",
      exclude: ["Info.plist"],
      linkerSettings: [
        // A bare binary with no embedded Info.plist never gets a microphone prompt (TCC needs the usage strings).
        .unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", "Sources/dixi-ear/Info.plist"]),
      ]
    ),
  ],
  swiftLanguageModes: [.v5]
)
