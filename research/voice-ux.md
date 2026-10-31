# Voice + UX repos

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.

---

I couldn't check Cortex-Treehacks: both the repo and the user AdityaYC return 404. The other nine repos are covered below. Nothing was cloned, written or run.

## (1) Summary

**Adopt**
1. **Spoken equals written, and status is only reported once it's true** (VoxStride). Every spoken line also appears as caption text, and muting never removes text. Show "Stopping…" first, then "Stopped" only after cancellation is confirmed. Use aria-live while Dixi has focus and its own TTS when it doesn't. Don't scroll the caption while someone is reading older lines.
2. **Tiered exact-phrase confirmation** (Accessible-AI-Agent). A purchase needs "confirm purchase"; a plain "yes" is refused with a reason. Saying "details" re-reads the action. Silence means no ("No answer, so I didn't do it"). Avoid echonav's substring check (`"yes" in text`).
3. **Speculation gate** (pipecat). While the user is still talking, run reversible steps right away and hold irreversible ones until the turn has definitely ended.
4. **Recover from false interruptions, and add an echo warm-up** (livekit). Barge-in needs at least 0.5 s of speech. If nothing follows within 2 s, resume talking. Ignore barge-in during the first ~3 s of TTS. Generate the LLM reply early, but not the TTS.
5. **Spoken recovery commands** (screen-voice-agent). "That wasn't me" erases the last turn and offers to undo. A hard-stop list ("stop", "wait", "I know") works between sentences. A list of echo hallucinations ("thank you", "bye") is checked only just after TTS. Dismissal phrases close the follow-up window.
6. **State shown in several ways** (backtalk, echonav). A listening chirp and a thinking loop that users can turn off by voice. Colour plus label plus symbol, and an overlay that never steals focus.
7. **Hold-or-tap mic** (Handy). Holding for 300 ms or more is push-to-talk; a tap locks the mic on. This is a fallback for weak voices the wake word misses. Parakeet 0.6B (3.99% English error) is the local STT candidate.
8. **Stream TTS sentence by sentence through one long-lived audio output stream** (backtalk). This fixes Dixi's unstreamed TTS.

**Skip**
- VoxStride's `danger-full-access` with approval set to "never".
- From screen-voice-agent: 10 s auto-approve, always-on cloud wake-word clips, audio copies left in /tmp, and plugins the agent writes and runs itself.
- backtalk's spoken "stop asking for permission" (TV audio could say it).
- Gating actions on model confidence (voice-os-agent).
- BrowserForBlind, which has no voice code.

## (2) Appendix

Issue counts are GitHub's open_issues_count, which includes PRs.

| Repo | License | Created | Last commit | Stars | Issues | Status | Top 3 lessons |
|---|---|---|---|---|---|---|---|
| sambuild04/screen-voice-agent | MIT | 2026-03-02 | 2026-10-22 | 40 | 1 | Active, one maintainer, v0.1.0 | "That wasn't me" undo; hard-stop and echo-phrase guards; never auto-approve on timeout |
| AryamanSharma14/echonav | NONE (pyproject claims MIT) | 2026-04-13 | 2026-09-30 | 0 | 0 | Stale | Colour + label + symbol per state; HUD that never takes focus and is hidden from screen capture; README overclaims |
| benk-007/voice-os-agent | MIT | 2026-10-15 | 2026-10-15 | 0 | 0 | One-off (course project) | Confidence doesn't mean correct; allow-lists, not the model, decide; dry-run by default |
| kellypiercelab/voxstride | MIT | 2026-08-11 | 2026-08-11 | 1 | 0 | Stale (one day of commits) | Every spoken line also written; status only after confirmation; screen reader vs own-TTS routing |
| Muhad01/BrowserForBlind | NONE (vendored browser-use is MIT) | 2026-10-25 | 2026-10-25 | 0 | 0 | One-off (final-year project) | No voice code; Frontend empty; nothing to take |
| Zatoichi420/Accessible-AI-Agent | AGPL-3.0 | 2026-10-19 | 2026-10-19 | 0 | 0 | New, early test version | Exact-phrase tiers; silence means no; sentence-streamed TTS with earcons |
| AdityaYC/Cortex-Treehacks | n/a | n/a | n/a | n/a | n/a | 404 | Not verifiable |
| pipecat-ai/pipecat | BSD-2-Clause | 2023-12-27 | 2026-10-29 | 16,910 | 475 | Active | Speculation gate; min-words turn start; Smart Turn v3.2 on CPU |
| livekit/agents | Apache-2.0 | 2023-10-19 | 2026-10-29 | 14,994 | 855 | Active | Resume after false interruption; AEC warm-up; early LLM, not early TTS |
| cjpais/Handy | MIT | 2025-02-13 | 2026-10-27 | 35,066 | 203 | Active | Hold-or-tap at 300 ms; Silero VAD at 0.3 with smoothing; benchmarked model catalog |

**Evidence** (all read via `gh api`, accessed 2026-10-29)

**VoxStride**
- README.md:10-12: every spoken event has matching text.
- README.md:35: there is no voice input yet.
- README.md:43-44: "Interrupt requested" comes first, "Interrupted" only after confirmation; mute keeps the transcript.
- README.md:87: the seven states. README.md:91,94: its own voice takes priority over JAWS; the cursor position is kept.
- src/VoxStride.Desktop/AccessibilityPolicy.cs:16-34: routes speech to the screen reader or SAPI depending on focus; follows new text only if the reader is already at the end.
- Narrator.cs:91-96: calls JAWS StopSpeech while its own voice is talking.
- AgentRuntime.cs:7,65: `:danger-full-access` and `approvalPolicy="never"`.
- AgentRuntime.cs:340-344: if an approval is requested, the turn fails.
- AgentRuntime.cs:418-419: the system prompt gives standing permission to install software.
- AgentRuntime.cs:423: treats page and file text as untrusted (good).

**screen-voice-agent**
- src/hooks/useRealtime.ts:107-116: hard-stop phrases. :461-480: echo phrases. :676-696: follow-up window and dismissal phrases.
- useRealtime.ts:975-992: server VAD at threshold 0.6, 400 ms padding, 700 ms silence, with interrupt_response on.
- useRealtime.ts:1298-1362: "that wasn't me". :1365-1372: mic is muted while TTS plays.
- src/components/ToolApprovalCard.tsx:57-62,98-112: tools auto-approve after 10 s.
- src/hooks/useWakeWord.ts:49-53 and electron/handlers/wake-word.ts:13-18,33: 3 s mic clips go to gpt-4o-mini-transcribe, and a debug copy stays at a fixed /tmp path.
- src/lib/sounds.ts:22-34: wake/sleep tones. src/components/StatusBar.tsx:18-29: the four states.
- SECURITY.md: lists running plugins the agent wrote itself as in scope.

**echonav**
- listener.py:36,50: push-to-talk beeps at 880/440 Hz.
- stt.py:29,33-38,60: local faster-whisper with an RMS energy gate; its "confidence" is actually Whisper's language_probability.
- tts.py:8: uses pyttsx3, although README:67 says Edge-TTS.
- overlay.py:26-43,109-118: seven states, each with colour, message and symbol.
- agent.py:243-256: confirmation times out after 15 s and cancels.
- main.py:77: the substring "yes" check.
- laya_engine.py:108-112,158-159: falls back to a keyword heuristic when the model isn't available.

**voice-os-agent**
- README.md:53-63: guardrails (allow-lists, path sandbox, URL check, no shell).
- README.md:100: mean confidence was 0.967 on wrong parses vs 0.995 on correct ones.
- README.md:112: model weights "upload pending". README.md:137: Dockerfile untested.
- asr/listener.py:3,34: speech recognition goes to Google's cloud.

**Accessible-AI-Agent**
- backtalk/main.py:102-108: silence means no, after 75 s.
- main.py:233-330: the spoken permission gate.
- main.py:348-358: spoken phrases that turn the gate off.
- backtalk/safety.py:156-163: exact-phrase tiers.
- README.md:156-162: never types passwords and never pays.
- backtalk/signals.py:18-22: states written to a file. signals.py:229-235: why the listening earcon exists.
- backtalk/mouth.py:18-36: sentence-chunked TTS on one stream.
- backtalk/ears.py:18-26: speech-to-text and voice detection.
- SETUP.md:8-9 is written for an AI agent ("You, an AI assistant, will follow this file… Execute it.") and installs Homebrew. I didn't follow it.

**pipecat**
- src/pipecat/turns/speculation_gate.py:46-60.
- user_start/min_words_user_turn_start_strategy.py:30.
- user_mute/function_call_user_mute_strategy.py.
- audio/turn/smart_turn/data/smart-turn-v3.2-cpu.onnx.

**livekit**
- livekit-agents/livekit/agents/voice/turn.py:190-198: interruption defaults (0.5 s minimum, resume on, 2.0 s, backchannel window (1,1)).
- turn.py:201-230: early generation (TTS off, 10 s max, 3 retries).
- agent_session.py:435: user marked away after 15 s.
- agent_session.py:530-543: transcription timeout; AEC warm-up of 3.0 s.

**Handy**
- src-tauri/src/settings.rs:404-411,576-582: hold-or-toggle at 300 ms; always-on mic is off by default.
- managers/audio.rs:21,336: Silero VAD v6.2 at threshold 0.3.
- audio_toolkit/vad/smoothed.rs: onset, pre-roll and hangover smoothing.
- catalog/catalog.json: parakeet-unified-en-0.6b has 3.99% English error.

## (3) Confidence

Confidence is **high** for the metadata and for patterns quoted from code, **medium** for how anything behaves at runtime because nothing was run, and **low** for Cortex.

What I could not verify:
- **Cortex-Treehacks:** not found. stripathy1999/Cortex-AI ("Treehacks Project") might be it, but I haven't confirmed or reviewed it.
- **Latency claims:** screen-voice-agent's "under 500 ms" and echonav's "sub-50 ms" are untested.
- **echonav's `laya` package:** I don't know if it exists or installs.
- **screen-voice-agent's useRealtime.ts** (127 KB): only sampled, not read in full.
- **Handy's default model:** it's empty in the code, so it's chosen at setup.
- **Line numbers:** the main.py ones in Accessible-AI-Agent are ±3.
- **BrowserForBlind:** I confirmed there are no voice-related files by filename search only.
