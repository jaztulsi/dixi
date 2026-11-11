// dixi-ear: Dixi's Fn key, mic and on-device speech. Spawned by Electron (src/main/ear.js); JSON lines on
// stdin/stdout (protocol in README.md). Arguments: --key fn|ctrlopt|both  --warm-mic  --locale en-US
import AppKit
import AVFoundation
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let args = CommandLine.arguments
func arg(_ name: String) -> String? { args.firstIndex(of: name).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }

let keys = Keys.shared
keys.trigger = Keys.Trigger(rawValue: arg("--key") ?? "fn") ?? .fn
let mic = Mic.shared
mic.warm = args.contains("--warm-mic")
let locale = Locale(identifier: arg("--locale") ?? Locale.current.identifier)

var hearing: Hearing? = nil
var recording = false
var capTimer: DispatchWorkItem?

func endSession() { recording = false; capTimer?.cancel(); capTimer = nil; mic.stop() }

// The talk key went down: the mic starts first (no round trip to Dixi), then what's in front is read.
keys.onDown = {
  if recording { return }   // hands-free is on: this press is Dixi's "send", which Dixi will ask for
  recording = true
  hearing?.begin()
  mic.start()
  Context.snapshot()
  let cap = DispatchWorkItem { if recording { hearing?.finish(); endSession() } }   // never left open (5.5 min)
  capTimer = cap
  DispatchQueue.main.asyncAfter(deadline: .now() + 330, execute: cap)
}
keys.recording = { recording }
mic.onBuffer = { buf in hearing?.feed(buf) }

In.start { m in
  switch m["cmd"] as? String {
  case "stop":   if recording { hearing?.finish(); endSession() } else { Out.emit(["ev": "final", "text": "", "ms": 0, "why": "not recording"]) }
  case "cancel": if recording { hearing?.cancel(); endSession() }
  case "paste":  if let t = m["text"] as? String, !t.isEmpty { Paste.text(t) }
  case "vocab":  if let w = m["words"] as? [String] { hearing?.setVocabulary(w) }
  case "quit":   exit(0)
  default: break
  }
}

// Permissions: ask for the mic once (key access is asked for by Keys.start).
func perms() -> [String: Any] {
  ["mic": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized, "input": CGPreflightListenEventAccess(), "accessibility": AXIsProcessTrusted()]
}
if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined { AVCaptureDevice.requestAccess(for: .audio) { _ in } }

mic.prepare()
keys.start()

Task {
  if #available(macOS 26, *) {
    let a = AnalyzerHearing(locale: locale)
    if await a.setUp() { hearing = a }
  }
  if hearing == nil { hearing = SFHearing(locale: locale) }
  var ready = perms()
  ready["ev"] = "ready"
  ready["stt"] = hearing?.name ?? "none"
  ready["key"] = keys.trigger.rawValue
  ready["warm"] = mic.warm
  Out.emit(ready)
  if hearing == nil { Out.error("hearing", "No on-device speech recognition on this Mac.", fatal: true) }
}

CFRunLoopRun()
