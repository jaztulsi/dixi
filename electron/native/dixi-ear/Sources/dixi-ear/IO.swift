import Foundation

/// One JSON object per line on stdout. Writes are serialized; nothing else may print to stdout.
enum Out {
  private static let queue = DispatchQueue(label: "dixi.ear.out")
  static func emit(_ obj: [String: Any]) {
    queue.async {
      guard JSONSerialization.isValidJSONObject(obj), var data = try? JSONSerialization.data(withJSONObject: obj) else { return }
      data.append(0x0A)
      FileHandle.standardOutput.write(data)
    }
  }
  static func error(_ whereAt: String, _ message: String, fatal: Bool = false) {
    emit(["ev": "error", "where": whereAt, "message": message, "fatal": fatal])
  }
  /// Milliseconds on the same clock as CGEvent timestamps (since boot).
  static func nowMs() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e6 }
}

/// Commands from Dixi, one JSON object per line on stdin. EOF (Dixi quit or crashed) ends the helper.
enum In {
  static func start(_ handle: @escaping ([String: Any]) -> Void) {
    let t = Thread {
      while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
        DispatchQueue.main.async { handle(obj) }
      }
      exit(0)
    }
    t.name = "dixi.ear.stdin"
    t.start()
  }
}
