# dixi-ear

Dixi's ears: the Fn key, the mic and on-device speech-to-text, in one small native helper. Electron runs it
(`src/main/ear.js`), restarts it if it dies, and reads one JSON object per line from its stdout.

Build (macOS 26, Xcode 26): `cd electron && npm run build:ear` → `native/dixi-ear/.build/release/dixi-ear`.
Dixi uses it automatically once built; `DIXI_VOICE_PATH=cloud` keeps the old ⌥Space + cloud speech path.

## Protocol

helper → Dixi
| line | when |
|---|---|
| `{ev:'ready', stt:'dictation'\|'speech'\|'none', mic, input, accessibility, key, warm}` | started |
| `{ev:'key', type:'fn_down'\|'fn_up'\|'space'\|'esc'\|'other_key'\|'ctrl', t, ctrl?}` | key kinds only, never which key |
| `{ev:'mic', ms}` | talk key → first audio buffer |
| `{ev:'level', v}` | 0…1, ~20 Hz while recording |
| `{ev:'partial', text}` | the words so far |
| `{ev:'final', text, ms}` | once per stop; `ms` = stop → final |
| `{ev:'context', app, bundle, pid, title?, role?, editable?, selection?}` | at talk-key down; `selection` is a length |
| `{ev:'pasted', ok}` · `{ev:'hearing', state:'downloading'}` · `{ev:'keys', ok}` · `{ev:'error', where, message, fatal}` | |

Dixi → helper: `{cmd:'stop'}` finish and send the final · `{cmd:'cancel'}` drop it · `{cmd:'paste', text}` ·
`{cmd:'vocab', words}` (≤ 100; biases recognition) · `{cmd:'quit'}`. EOF on stdin ends the helper.

The helper starts recording on its own the moment the talk key goes down; Dixi's gesture machine
(`ptt.js fnGestures`) decides whether that becomes a command, a hands-free session, dictation or nothing.

## How it works
- **Keys:** a `CGEventTap` (session, head-insert, default tap). Fn is read only from `flagsChanged` keycode 63:
  macOS also sets the Fn flag on arrows, F-keys, Home/End and Forward Delete. Space is swallowed only while the
  talk key is down. With `--key ctrlopt` (or `both`), Control+Option is the talk key for keyboards without Fn.
- **Mic:** `AVAudioEngine`, prepared at launch and started on key-down (no orange dot at idle). `--warm-mic`
  keeps it running with a 0.5 s ring buffer: no first-word loss on slow mics, but the orange dot stays on.
- **Speech:** macOS 26 `SpeechAnalyzer` + `DictationTranscriber` (short-form, punctuation, volatile results), with
  your app names and commands as `AnalysisContext` contextual strings. Every buffer is converted to the analyzer's
  `bestAvailableAudioFormat`. The next analyzer is prepared right after each session, so key-down only feeds it.
  Older macOS: `SFSpeechRecognizer` with `requiresOnDeviceRecognition`. Nothing is sent over the network.
- **Paste** (dictation, Fn+Control): clipboard saved (every type), text marked transient, ⌘V, clipboard put back
  after 1 s unless you copied something new.
- **Context:** front app, window title, focused field role/editability and selected-text length, read off the
  main thread with a 250 ms Accessibility timeout.

## Permissions (granted to the app that starts Dixi: Dixi/Electron, or Terminal in development)
Input Monitoring + Accessibility (key tap, paste), Microphone. System Settings → Keyboard → "Press 🌐 key to" →
**Do Nothing**, so macOS doesn't also open emoji or dictation on Fn.

## Not verified yet
Written against Apple's macOS 26 SDK documentation, but **not yet compiled or run**: this code was written on a
Linux machine. Expect one round of compile fixes on the Mac.
