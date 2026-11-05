# Lane A diagnosis: hearing + voice loop (base ea2c661; paths under electron/src; STT = Scribe v2 RT, Flux fallback; mic+socket open the whole time voice is on: voice.js:141-145, main.js:388)
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
