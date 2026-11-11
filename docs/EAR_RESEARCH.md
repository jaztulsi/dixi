# Ear research (Nov 11): what the Fn helper and the router are built on

Sources were checked against Apple's documentation (macOS 26.0 names; developer.apple.com now also shows macOS 27
beta APIs such as `AnalyzerInputConverter` — not used) and working open-source code. "Unverified" = no primary source.

## Keys (native/dixi-ear Keys.swift)
- CGEventTap `.cgSessionEventTap` + `.headInsertEventTap` + `.defaultTap` (needed to swallow Space); re-enable on
  `tapDisabledByTimeout/UserInput` and re-seed Fn from `NSEvent.modifierFlags` (FreeFlow `GlobalShortcutBackend.swift`).
- Fn only from `flagsChanged` keycode 63 + `.maskSecondaryFn`: macOS sets the Fn flag on arrows, F-keys, Home/End,
  Forward Delete (FreeFlow source comment). Wispr Flow cancels when a Fn system shortcut is used (docs.wisprflow.ai).
- Permissions: `CGPreflightListenEventAccess`/`CGRequestListenEventAccess`; a default tap + posting ⌘V need
  Accessibility (forum consensus; not formally documented). A child process's grants follow the responsible
  (parent) process (Apple DTS, forums 805245). A bare binary needs an embedded Info.plist for a mic prompt.
- Globe key: users set "Press 🌐 key to: Do Nothing" (`AppleFnUsageType` 0); swallowing Fn breaks it (FreeFlow #303).
- Wispr Flow defaults: hold Fn; Fn+Space or double-tap (0.5 s) hands-free; Esc cancels; Ctrl+Opt on keyboards without Fn.

## Mic (Mic.swift)
- `AVAudioEngine.prepare()` at launch; `start()` on key-down. Others measured a cold start of 240–270 ms on built-in
  mics and 650–700 ms on USB (macparakeet research notes, Handy #1283), so ≤ 50 ms needs a warm mic (orange dot):
  `--warm-mic` opt-in with a 0.5 s ring buffer. Rebuild on `AVAudioEngineConfigurationChange` (AirPods).

## Speech (Hearing.swift)
- `SpeechAnalyzer` + `DictationTranscriber(locale:contentHints:transcriptionOptions:reportingOptions:attributeOptions:)`;
  `AnalysisContext.contextualStrings[.general]` (≤ 100 short phrases) is documented for DictationTranscriber only.
- The analyzer does no conversion: convert every buffer to `bestAvailableAudioFormat(compatibleWith:)`.
- `finalizeAndFinishThroughEndOfInput()` waits for the input stream to finish: call `continuation.finish()` first.
- SpeechAnalyzer needs no Speech Recognition authorization (mic only); SFSpeechRecognizer does.
- Accuracy (secondary): LibriSpeech clean WER 2.12% vs Whisper Small 3.74% (Inscribe, M2 Pro). Time to first
  result: unpublished.

## Paste, context
- FreeFlow: snapshot every pasteboard type, mark transient/concealed, ⌘V via CGEvent, restore after 1.0 s only if
  `changeCount` is unchanged. Context via `AXUIElementCreateApplication(pid)`; Electron apps need
  `AXManualAccessibility` (Electron docs). Browser URL: AppleScript (done in Electron, `input.browserTab`).

## Foundation Models — not used
3B on-device model, 4096-token window; Apple DTS: a command-line tool without UI is rate-limited. Dropped in favor of
the fast cloud planner (user's choice: Cerebras).

## Agent pattern (docs/agent-research/cowork.md, muse.md, opendots.md; code.claude.com/docs/en/computer-use)
- Tool ladder, most precise first: connector/rule → shell → script → browser → screen. Implemented as rules →
  `open` links → `shell` steps (shell.js allowlist) → AppleScript/JXA → Dixi's browser → screen agent.
- Every step ends with a check (front app, page host, script check, exit code); one retry on the next rung.
- Ask only before send / spend / delete (existing heldBack / allowSend / allowSpend / allowDelete).

## Key sources
developer.apple.com/documentation/speech/speechanalyzer · …/dictationtranscriber · …/analysiscontext ·
developer.apple.com/videos/play/wwdc2025/277 · github.com/zachlatta/freeflow · github.com/finnvoor/yap ·
docs.wisprflow.ai (hands-free; tap vs hold) · developer.apple.com/forums/thread/805245, 787737 ·
macos-defaults.com/keyboard/applefnusagetype.html · code.claude.com/docs/en/computer-use
