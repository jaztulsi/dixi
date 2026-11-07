# Hearing plan: the on-screen transcript should match what was said

Scope: ⌥Space, the MacBook Air's built-in mic, ordinary speech. Context, UI, agents, streaming and the website are frozen.
Paths are relative to `electron/src`.

## Path traced (mic → displayed text)
- **Mic:** `getUserMedia` (EC/NS/AGC on, default device) → `AudioContext({sampleRate:16000})`. Chromium resamples 48 kHz → 16 kHz.
- **Worklet:** `pcm16-chunker`, 80 ms Int16 frames → IPC `deepgram:audio` → main bridge.
- **Pre-roll:** up to 50 frames held while the socket opens (`renderer/core/voice.js:159-172`).
- **Provider:** `DIXI_STT` or ElevenLabs Scribe v2 (VAD commit, 0.9 s; `main/stt.js:47`). ElevenLabs is marked dead until 20:32 today, so **Deepgram Flux serves every turn now** (`main/main.js:59-74`).
- **Flux params** (`main/deepgram.js:14-16`): eot 0.7, **eager_eot 0.4**, eot_timeout 1500 ms, plus up to 50 keyterms.
- **Turn ending:** `voice.js` `endpoint()` (316-331) acts on EagerEndOfTurn once the words are still for `holdMS` 700 (117).
- **Filters before display:** STOP, PROTEST (70-71), another-language, `heardSelf`/`ownWords` echo strip (269/283), `chatter()` (379 → `core/everywhere-words.js:77-82`).
- **Display:** shown via `everywhere:transcript` (`main/everywhere.js:1607`) and the dashboard. The island hides text while listening.

## Snapping check (asked for)
`closeSpelling` / `skeleton` / `normName` / `soundsLike` run only on **app-name resolution** (`interpret.js:174-178`, `plan.js:54`) and on wake-word detection (`interpret.js:79-80`).
**They never rewrite the displayed transcript**, so they cannot make a correct transcript look wrong. They can make Dixi act on the wrong app; that is outside hearing scope.
The filters that *do* change what you see are below (suspect 1, suspect 5).

## Ranked suspects

| # | Suspect | Evidence | Experiment that proves it |
|---|---|---|---|
| 1 | **`chatter()` drops whole correct transcripts that contain fillers** | Verified offline: "Okay. So. Um, open my email.", "Yeah, so, uh, what time is it in Tokyo?" and "Um, right, cool, summarize this page." are all dropped. ≥60 % filler bits ⇒ drop, and the result depends on how the provider punctuated. | Run your recorded transcripts through `chatter()`. Count drops where the transcript is otherwise right. |
| 2 | **The turn is cut mid-sentence** | Eager EOT 0.4 + hold 700 ms acts before you finish. Flux docs: eager is *off unless set*. eot_timeout 1500 vs default 5000. Scribe VAD commits after 0.9 s of silence. During push-to-talk the key-up already marks the end. | Dump per session (`DIXI_DEBUG_AUDIO`): count `providerTurns` > 1 per ⌥Space hold. Compare the live text with the same WAV re-sent with eager off and the end set only by the hotkey (`ForceEndTurn`). |
| 3 | **Keyterm over-boost** | Up to 50 terms mixing app names, catalog sites and tab titles (`voice.js:250-254`, `app.js:113`). Docs: use the 20–50 *most important* terms and avoid broad ones; the limit is 500 tokens. | Re-run your WAVs through Flux with 1 keyterm (Dixi) vs today's 50. Compare WER. |
| 4 | **First word lost on a cold start** | Fake-mic harness, cold start: mic open 264–831 ms, first chunk 120–255 ms. Warm open 28–190 ms. The last frame (≤80 ms) was dropped at key-up (the end of the last word). | Dump: `firstWordCut` and `droppedMS` per session, and listen to the first 300 ms. A fix is drafted (graph kept warm, drain on stop); it passes unit tests and is **not verified live**. |
| 5 | **Echo/self filters strip your words** | `heardSelf`/`ownWords` remove words matching Dixi's last reply. PROTEST/STOP/another-language can swallow a turn. | Log each filter's before/after on your recordings. Count wrongful strips. |
| 6 | **Provider / mic quality** | Flux serves now. Device: MacBook Air Microphone, 48 kHz, input volume 94. A virtual device exists, and `pickInput` now skips it if it is the default. | Bake-off on the *same* WAVs (below). If raw is good and live is bad, it is capture or streaming. If both are bad, it is the provider or the mic. |

An offline A/B with `say`-generated audio was **inconclusive**: 10–25 % WER noise from whisper base.en. It is not used for decisions, and its invented corpus is deleted.

## Step 2 (after approval)
1. Start Dixi with `DIXI_DEBUG_AUDIO=1`. Each ⌥Space saves the exact audio sent to STT plus a line in `capture.log` (device, rate, levels, first-word cut, dropped ms, endpoint). Local only; WAVs are deleted after 7 days.
2. You read varied passages: news-style sentences, names, numbers, your own speech. Not commands. Then you correct each reference transcript.
3. Score WER per WAV:
   - live displayed text;
   - Flux re-stream (today's params, then eager off, then 1 keyterm);
   - Apple `SpeechTranscriber` (on-device; available here: macOS 26.6, en_US installed);
   - local whisper.cpp;
   - at most one cloud candidate (AssemblyAI U-Streaming $0.15/h or Scribe $0.39/h), **≤$1 total**.
4. Choose by WER on your recordings only. One change per iteration, with its measured delta. After 2 iterations with no gain, stop and report BLOCKED. Never claim "fixed" without your recordings showing it.

Sources: developers.deepgram.com (Flux eot/eager/keyterm), elevenlabs.io/docs (Scribe realtime commit strategy), assemblyai.com/pricing. Apple: local Swift check (docs not reachable).
