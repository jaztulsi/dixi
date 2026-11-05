# DIAGNOSIS: every reported symptom (Nov 5)

Each entry gives the evidence (file:line), the root cause, the fix and how it will be verified. There are three parts, one per owning lane.

| Symptom | Part | Owner |
|---|---|---|
| Deaf after Dixi speaks; wrong words; nothing shows up; cut off mid-sentence; "Dixi" repeated; slow after I stop talking | A | dixiagent3 |
| Fallback/quota failures and the three 401s; which providers really serve; "[everywhere] fetch failed"; slow thinking; npm test hang | B | dixiagent1 |
| Dashboard buttons dead; gray bar; clipped mascot (hypotheses for Lane D) | B | Lane D |
| Random clicks / Gemini paste; approval card nagging; "did it really work"; slow action stage | C | dixiagent2 |

## Part A

**1 Deaf after Dixi speaks.** E: speaker.js:5,20,34 isBusy() for ECHO_TAIL_MS 1200 ms after audio ends; voice.js:225-235 while busy, 1-word turns and any turn during a confirm are dropped; voice.js:196-201,239 heardSelf drops 2+ word turns ≥75% LCS of Dixi's last 20 s.
C: Scribe commits only after 0.9 s silence (stt.js:39), so speech starting <0.9 s after Dixi joins the echo turn → dropped, or prefixed by Dixi's words so wakeEnd (voice.js:21-35, start/after punctuation only) misses "Dixi".
F: ECHO_TAIL_MS ≈250 ms, rely on echoCancellation (already on, mic.js:9); cut the LCS-matched echo prefix instead of dropping the turn; heardSelf only for turns born while busy.
V: unit (fake speaker, scripted turns): command 300 ms after speech end runs; echo-prefixed turn → user's words only; echo-only turn still ignored.
**2 Wrong words.** E: keyterms = 50 generic names + "Hey Dixi" (voice.js:176-180), >20 chars silently dropped (stt.js:41); no post-snap before interpret(); no WER baseline (eval/audio-cache absent here; score.js, stt-wake.js exist).
C (hypothesis until measured): echo prefixes (#1), always-open mic hears room/TV, diluted keyterms, no snapping.
F (A3): render cache via eval/audio.js, WER per provider/condition via score.js; keyterms only where documented; snap with closeSpelling/skeleton/normName.
V: before/after WER table; 3 known-bad phrases as unit regressions.
**3 Nothing shows up.** E: mic opens only after socket open (voice.js:141-145); audio before OPEN discarded (stt.js:67, deepgram.js:43); on a drop (quota_exceeded stt.js:53-58) handleClosed stops mic, sleeps 500 ms, reopens (voice.js:154-160); #1 filters return before liveTranscript is set (voice.js:248).
C: silent drops: no audio buffer, no "reconnecting"/"ignored" state on screen.
F: ~2 s ring buffer of frames in main, replayed after reconnect; mic stays open across reconnect; partial transcript + reconnecting state always shown.
V: fake-socket test (stt.test.js pattern): close mid-utterance → frames replayed in order, transcript arrives.
**4 Cut off mid-sentence.** E: vad_silence_threshold_secs 0.9 (stt.js:17,39) ends a turn on any 0.9 s pause; Everywhere runs on the first EndOfTurn, no carry (voice.js:277); browser carries only if incomplete() matches (voice.js:354-361); #3 reconnect gap.
C: endpointing = pure silence VAD; Everywhere has no grace.
F: provider EOT + grace (total pause ≥700 ms; an Update during grace cancels); Everywhere uses the same carry; PTT: second ⌥Space ends the turn, silence only at the 60 s safety.
V: scripted test: 600 ms mid-sentence pause → one command; fake-audio test with pauses.
**5 Needs "Dixi" repeated.** E: requireWakeWord defaults true (app.js:38); addressed() (voice.js:204-217) stays open 10 s only after a bare "Dixi"; each later command needs it again; matched on cloud text, turn start only.
C: per-turn gate that fails on echo prefixes/merged turns (#1) and fillers without a comma.
F (A1): ⌥Space session needs no wake word; wake word → experimental setting, default OFF (code kept); strip leading Dixi/Dixie/Dixy.
V: unit: session turn without "Dixi" runs; "Dixie, open…" stripped; default off.
**6 Slow after I stop talking.** E: Scribe has no eager EOT (committed_transcript only, stt.js:5,53) → 0.9 s silence + commit RTT; +550 ms settleMS (voice.js:103,370); questions + Everywhere wait for final (voice.js:277,370); Flux EagerEndOfTurn 0.4 (deepgram.js:13-14) only on fallback.
C: ~1.1-1.3 s endpoint floor before any work; Everywhere never speculates. F: PTT key press = end of turn (0 ms); speculate at first pause in Everywhere (specMS 250 exists); Phase 3 #1 Flux eager EOT. V: Lane B bench speech_end→first action p50 before/after.

## Part B


Format: symptom | evidence | root cause | fix | verify. "ms" figures are code-level budgets; real timings come from the Phase 0 bench.

1. **TTS 401s get past the 10-min pause.** Evidence: main.js:280-300, speaker.js:26-35. Three causes:
   (a) The pause is set only after a failed response returns. speaker.say never aborts or serializes the earlier fetch, so N overlapping says mean N in-flight requests, and all N fail.
   (b) The pause only fires when the body matches /quota|credit|payment|limit/. A plain 401 (bad or revoked key) never pauses.
   (c) `ttsPausedUntil` lives in memory and resets on every app start.
   Fix: a shared dead-service registry (mark on the first 401/402/429, check before every call including retries, persist it, background recheck at most every 10 min) and abort the previous TTS fetch on each new say. Verify: a unit test where a fake fetch returns 401 on 3 concurrent says gives exactly 1 network call.
2. **STT choice.** Evidence: main.js:56-60 picks ElevenLabs Scribe whenever its key exists. It learns OUT_OF_CREDIT per session (stt.js:54-58), then closes, and the renderer reopens on Deepgram Flux. Cost: 1 wasted WS handshake plus a reconnect on every launch. Fix: a startup health check (the registry plus one cheap probe) picks the STT once. Verify: stt test with a 402 server, where the second open goes straight to Deepgram (0 EL connects).
3. **Who serves what.** In browser mode:
   - STT = Scribe, falling back to Deepgram;
   - TTS = ElevenLabs Turbo, falling back to `say` (localvoice.js; the 8 s timeout is the worst case);
   - LLM = hybrid tiers (providers.js:39-57): plan = Sonnet 5.5, fast/agent = Cerebras, answer = Cerebras then Haiku 5.5.

   Everywhere mode uses the same STT/TTS, but its LLM calls go through a raw `claude()` (everywhere.js:342-352). That path has no Cerebras/Groq fallback, no retry, and only a 60 s total timeout. The web answer at main.js:311 also bypasses chat(). Fallback cost in ms: to be measured per request in the Phase 0 bench (provider and fallback columns).
4. **"[everywhere] fetch failed".** Evidence: everywhere.js:347, a raw fetch with no retry or connect timeout; the catch at :1017-1020 shows err.message as "Something went wrong". Root cause: undici throws a TypeError on a stale keep-alive socket (prewarm opens one up to 20 s earlier) or on any network blip. chat() would retry status 0 three times (providers.js:230), but this path skips chat(). Fix: route Everywhere and main.js:311 through one fetch wrapper (connect 3 s + total timeout, retry status 0/5xx, registry). Verify: unit test where a fake fetch throws TypeError once and the call then succeeds with 1 retry.
5. **Slow "thinking".** Hypothesis: the plan tier is Sonnet 5.5 on a cold TLS connection. Everywhere adds a desktopCapturer screenshot (everywhere.js:321) before the first token. Fix: keep-alive prewarm of the actual tier host, not only Anthropic, plus Cerebras for the first token where the tier allows it. Verify: bench p50/p95 for interpret → LLM first token.
6. **npm test hang.** Evidence: providers.test.js:4 fake-fetches prewarm, but every test that imports config.js loads /Users/jaz/dixi/.env, so real keys reach discoverModels (5 s timeout) and the other live paths. Fix: tests set DIXI_NO_DOTENV=1 (config skips .env) plus a global fetch and WebSocket guard that throws on any non-127.0.0.1 host. Verify: `npm test` < 30 s with .env present and with Wi-Fi off.
7. **Dashboard buttons dead.** The stub-store hypothesis is not confirmed: grep stub|fake|memory in dashboard*.js = 0 hits. Handlers are wired at dashboard.js:165/180/192, under CSP `script-src 'self'` (no inline handlers needed), sandboxed preload/dashboard.cjs. Remaining suspect: channel names in preload/dashboard.cjs vs the ipcMain handlers in main/dashboard.js. Fix: a test that diffs the exposed channels against the registered handlers. This is Lane D's UI; I'll hand the diff over.
8. **Gray bar.** The overlay pill backdrop is a live screen capture (everywhere.js:321, overlay.css:26-32). Without Screen Recording permission, or with an empty thumbnail, only `--tint` shows, which reads as a flat gray bar. The tray uses an empty image plus a text title (everywhere.js:1387, :1226). Fix: fall back to a solid material when sources are empty, and give the tray a template icon. Lane D renders; I supply the IPC "degraded" field.
9. **Clipped mascot.** overlay.css:52 sets `.buddy .mascot` to bottom:-3px at 38×46, while `html,body{overflow:hidden}` (overlay.css:15) trims the 3 px and any pose taller than 46 px. Fix: bottom 0, or make room in the window height. This is Lane D's; flagged only.

## Part C

## 1. Random clicks, "paste into Gemini" fails
- Evidence: everywhere.js:557-568 left_click clicks the model's screenshot point and only checks "not Dixi" and risk words, not "inside the front window" or "expected role or label there". :596-605 type pastes (⌘V) without checking the focus is editable or reading the field back. input.js listControls never marks the focused control (AXFocused appears only at :169, :223), so the model hunts for a box it is already in. enableAX (input.js:251, everywhere.js:329) never checks the tree came back.
- Cause: acts blind on coordinates, focus unknown, no after-check.
- Fix (A2): input.js focusField ladder: focused editable → AX role+label → enableAX + reread → learned per-site keys → front-window OCR. Click only on a verified frame in the front window; paste, then check AXValue; 2 tries, then "Couldn't find the X input".
- Verify: fake-jxa fixtures: already focused → 0 clicks; not focused → AX press; no tree → enableAX + retry; web view; paste check fails → one retry → the failure line.
## 2. The "would you like me to click…" card (YES_KEY) is still reachable
- Evidence: approve() (everywhere.js:388-411, plus overlay.js:133) is still called at :444 (every profile use), :642 (pressNamed on a risky or money label, with no userAsked check, unlike yes() at :521), :1049 (clear log), :1380 (Claude Code bridge), and every step in careful mode (:521, :529).
- Cause: the no-ask rule (userAsked, :65) covers only the agent's yes().
- Fix (Phase 4): :642 goes through userAsked (press only if the user's words named it, else one refusal line). :444 uses the profile without asking and shows the masked line. Keep careful mode (the user's opt-in), :1049 and :1380.
- Verify: a unit test where ordinary commands never call approve(); count the approve( call sites before and after.
## 3. "I doubt it did the work": ok means "the call returned", not "the state changed"
- Evidence: doStep open (everywhere.js:756) is ok once `open -a` exits. desktop (:758) is ok when `r.ok !== false`, but desktop.js:146 out() never sets ok, so "no results showed up" counts as ok. A screen step (:807) is ok unless it refused (the A4 item). type (:605) never reads back. A script is checked only if the planner gave s.check (:796).
- Fix (Phase 4): each step returns { ok, line, undo } from a real after-check: open → app in front (mac.js WAIT_JXA); desktop → out() carries ok; type → AXValue has the text; screen → the clause's front app, URL or field. On a fail, one retry by the next method, then a clear line. Undo via undo.js.
- Verify: per-step-kind unit tests with fakes that assert ok:false when the after-check fails; QA rows.
## 4. The slow action stage
- Evidence, fixed waits: the agent waits 280 + 350 ms after every click (everywhere.js:515-516, :551) and 200 ms after typing (:605). renderer/core/execute.js sleeps 250 (:188), 900 race (:272), 250/400 (:297, :300), 600 (:323), 120 (:329), 400 (:708), 200/300 (:979, :1005, :1012); polls 150 (:985) and 200 (:1037) with 3-6 s deadlines (:1031); searchLanded up to 8 s (:352).
- Evidence, AX walks: every walk is a full, uncached tree read: findControls 1200 ms cap, listControls 1500 ms (2500 in QA), reader.js:58 1500 ms.
- Cause: fixed times instead of waiting on the result; a full AX walk per step.
- Fix (Phase 3, items 4-5): wait on the same condition that is verified (50 ms ticks or page events). Cache the AX tree per (pid, focused window) with a short TTL and read only the focused window. No screenshot when the deterministic path verified.
- Verify: Lane B bench per stage, before and after; fake-clock tests that each wait returns as soon as its condition holds.

