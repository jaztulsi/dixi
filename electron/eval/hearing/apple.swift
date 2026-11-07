// Apple's on-device SpeechTranscriber (macOS 26) on WAV files: prints "<file>\t<transcript>" per file.
// swift eval/hearing/apple.swift a.wav b.wav …
import AVFoundation
import Speech

@main struct Apple {
  static func main() async {
    let locale = Locale(identifier: "en-US")
    for file in CommandLine.arguments.dropFirst() {
      do {
        let t = SpeechTranscriber(locale: locale, preset: .transcription)
        if let req = try await AssetInventory.assetInstallationRequest(supporting: [t]) { try await req.downloadAndInstall() }
        let analyzer = SpeechAnalyzer(modules: [t])
        let audio = try AVAudioFile(forReading: URL(fileURLWithPath: file))
        async let text: String = t.results.reduce("") { $0 + String($1.text.characters) }
        try await analyzer.start(inputAudioFile: audio, finishAfterFile: true)
        print("\(file)\t\(try await text.trimmingCharacters(in: .whitespaces))")
      } catch { print("\(file)\tERROR \(error)") }
    }
  }
}
