# DIXI MASTER PROMPT: make it instant, reliable and trustworthy, then upgrade it

You are the orchestrator for Dixi, a voice-controlled assistant for the Mac.
Repo: ~/dixi. The Electron app is ~/dixi/electron (Node, `npm start`). Read ~/dixi/README.md.
Previous runs of this orchestrator already built a lot, ran many test cases, and set up lanes.
This prompt CONTINUES that work. It does not restart it.

## 0. THE GOAL (one paragraph, keep it in mind for every decision)
I say something and it just happens. First visible action in under 1 second after I stop talking.
A full simple command done in 2 seconds or less. It hears me every time. It never asks permission for ordinary actions.
I can trust that it really did the thing. The baseline comes first. Fancy features come only after the
baseline is measurably fast and reliable. Right now it is slow, it mishears me, it nags me, and I doubt it worked.

## 1. CONTINUE EXISTING WORK (do this first, 15 minutes max)
1. Read orchestrator/BOARD.md, LOG.md, BACKLOG.md, ARCHITECTURE.md, the lanes folder, docs/PLAN.md, docs/RESEARCH.md, docs/DIXI_AUDIT_PROMPT.md and docs/audit.
2. Write a "RESUME" entry in LOG.md with: what is done, what is open, what failed before and why. Treat passed test cases and completed lanes as DONE. Do not rerun passing cases except as a final regression check.
3. Keep using the lane structure and the multi-model setup that is already running. Route models like this:
   - Cheapest, fastest model: grep, log reading, file mapping, running benchmarks, summarizing output.
   - Strongest model: edits to the voice loop, STT/TTS pipeline, execute.js, anything where a wrong change breaks the app.
   - A separate fresh-context reviewer agent after each lane: re-run the tests, re-read the diff, try to break it. Authors never review their own work.
4. Handoffs between lanes are at most 10 lines in LOG.md. No lane re-reads another lane's whole files.

## 2. HARD RULES (this setup already burned my weekly token budget with little progress)
- Max 3 agents at once. Max 25 tool calls per lane attempt before a checkpoint in LOG.md.
- Never re-read a whole file. Use grep and line ranges. Log findings (5 lines max each) so nobody re-derives them.
- NEVER ask me questions mid-run. Decide, log the assumption in LOG.md under ASSUMPTIONS, keep going. Batch everything that needs me into NEEDS_USER.md and surface it only at the end.
- Do NOT run test:e2e, live, eval, demo or stt against paid APIs. They hit ElevenLabs, Groq and Deepgram for real, and providers.js shows test runs share one spend ledger, so they likely drained my ElevenLabs credits. Use eval/audio-cache and DIXI_FAKE_AUDIO.
- `npm test` (node --test test/unit/*.test.js) HUNG for me. Find the test that blocks (probably network or a live key). Fix or skip it. Get `npm test` under 30 seconds and make that a gate.
- Never run `npm audit fix --force` (it can break Electron). Never print .env values or commit them.
- Do not touch website/ or branding/. Do not modify ~/ref. Do not run OpenJarvis's installer.
- Git: work on branch fix/voice-speed. One small commit per fix, message includes the measured delta. Never force-push. Easy to revert.
- Every claim needs a number or a test. "Should be faster" is not a result.

## 3. WHAT I KNOW (from my own runs; verify each before building on it)
Machine: Apple M5 MacBook Air, macOS 26.6.
Logs from `npm start`:
  [stt] ElevenLabs: quota_exceeded; switching to the fallback
  [tts] 401 quota_exceeded (three in a row; 0 of 10,000 credits left)
  [everywhere] fetch failed
Code facts:
- main.js ~282-296 already pauses TTS for 10 minutes on quota errors and falls back to local `say` (localvoice.js). But three 401s still got through. Find out why (concurrent in-flight calls? a different code path? the pause only set after the first failure?).
- README says Deepgram Flux for STT and Groq for the LLM. The log shows ElevenLabs realtime STT tried first. Confirm which STT, TTS and LLM are actually used in browser mode and in Everywhere mode, and the time cost of each fallback.
- Timing instrumentation already exists: app.js trace(stage,{ms}), interpret.js returns ms, execute.js mark(), providers.js out.ms, llm.js call log. Build on it. Do not write a new tracing layer.
- providers.js supports Groq, Cerebras, Anthropic, Brave. Groq and Cerebras are the fast options.
- Design intent already in the README: deterministic code first, an on-device model second, the cloud LLM last. Commands run as each clause finishes. Verify it really works that way.
- Files: voice.js (589 lines), speaker.js, interpret.js, llm.js, execute.js (1,102 lines), main.js, everywhere.js (1,161 lines), overlay.js, providers.js, quick.js, brief.js, jobs.js, automate.js, tools.js, reader.js, input.js, capture.js, localvoice.js, hive.js.
- Previously reported command failures to keep as permanent regression tests (interpret.js is deterministic, so these are free to test):
    "search lo-fi beats on Apple Music" went to apple.com then searched YouTube.
    "buy a bagel from Safeway" ended up as a Google search.
    "couldn't find that on this page" errors.
  The app is NOT hard-coded to Amazon/YouTube; check it stays that way.

## 4. CONFIRMED SYMPTOMS (treat as facts)
- Slow at every stage: after I stop talking, while thinking, and in the action itself. Both browser mode and Everywhere mode. Current average: 6-7 seconds. Target: 2 seconds max.
- After Dixi speaks, it ignores me for a few seconds. Look at speaker.js isBusy / deafUntil / ECHO_TAIL_MS first.
- Hearing problems, all four: wrong words, nothing shows up, cut off mid-sentence, and sometimes needs "Dixi" repeated. Saying "Dixi" first does NOT improve hearing, so the wake-word gate is lower priority than the STT path.
- It asks "would you like me to click this button" as an ON-SCREEN card with a button (not spoken). Source is the approval flow in overlay.js and everywhere.js (YES_KEY, approvals).
- I doubt it actually does the work, so I never know if it succeeded.

## 5. STUCK PROTOCOL (read this when something fails)
You are STUCK when: the same failure happens twice, OR three attempts give no measurable gain, OR 25 tool calls pass with no diff.
When stuck, in order:
1. STOP that lane. Write BLOCKED in LOG.md: what you tried, exact error or numbers, your best hypothesis.
2. Try ONE different class of approach, never the same one again. Classes: (a) simplify to the smallest reproduction; (b) bypass the component and measure around it; (c) put the change behind a flag and ship the safe path; (d) revert to the last good commit and re-measure; (e) read the library or Electron docs for that exact API.
3. Still stuck: park it in BACKLOG.md with the evidence, add it to NEEDS_USER.md only if it truly needs me, and move to the next lane. Do not loop.
Things that are never a reason to stop and ask me: a failing unit test, a missing small dependency, a style choice, an ambiguous spec. Decide and log it.
Things that DO go into NEEDS_USER.md: API keys or credit top-ups, macOS permissions (Microphone, Accessibility, Screen Recording, Input Monitoring), anything that needs my actual voice or a hardware check.
Special cases:
- Missing Xcode or Swift toolchain: check `xcode-select -p`. If absent, prefer pure-Node or JXA (osascript -l JavaScript) solutions.
- A hotkey fails to register: log which app owns it (Raycast and Alfred commonly use Option+Space), fall back to a configurable alternative, never fail silently.
- A needed paid service is down: the fallback path must work with NO network keys at all. Test that explicitly.

## 6. WORK ORDER (each phase needs measured proof before the next starts)

### Phase 0: Baseline (no fixes yet)
With DIXI_FAKE_AUDIO and cached audio, run a scripted command set (browser mode and Everywhere mode, at least 20 commands incl. the regression phrases). Produce a table in LOG.md of p50 and p95 for each stage:
  hotkey -> mic open -> first STT partial -> STT final -> interpret -> LLM first token -> execute -> result visible -> reply spoken
Also record which STT, TTS and LLM provider served each request and which fallbacks fired. Add `npm run bench` so this is repeatable without paid APIs. This is the single source of truth for before/after.

### Phase 1: Fallback hardening (likely the biggest win)
Any paid-service failure must degrade instantly and silently.
- A dead or out-of-credit service is marked dead in one place and shared by STT, TTS, search and LLM, so it costs zero further round trips (including in-flight requests and retries). Re-check no more than every 10 minutes, in the background.
- TTS: drops to local voice immediately, and speaks far less (see Phase 2). STT: drops to the next-fastest working option, chosen at app start by a quick health check rather than discovered per request.
- Find and fix `[everywhere] fetch failed` (which call, which timeout, why no fallback).
- Add timeouts everywhere (connect + total) so no call can hang the loop. Budget per stage, logged.
- Pre-warm connections at app start and when the hotkey is pressed: TLS to Groq/Cerebras, the STT socket, the audio pipeline. Use HTTP keep-alive agents.
- Surface real state in the UI (small indicator): which provider is live, when running degraded. No error toasts for quota problems.
Exit: with ElevenLabs credits at 0 and also with all network keys removed, a command still completes with no user-visible error and no added latency.

### Phase 2: Hearing and voice loop
- Audit capture end to end: device selection and device-change events, `systemPreferences.getMediaAccessStatus('microphone')`, sample rate (16 kHz mono PCM), AudioWorklet (not ScriptProcessor or MediaRecorder), echoCancellation and noiseSuppression constraints, start/stop races, and clipped first words (the audio pipeline stays warm; the mic opens on the hotkey and the first ~200 ms must not be lost).
- STT stream robustness: reconnect with backoff, buffer and replay audio across a dropped socket, keepalive, endpointing and silence timeouts tuned so I am not cut off mid-sentence, show the partial transcript live. Log confidence and drops.
- Deaf window: remove or sharply shorten ECHO_TAIL_MS. Implement barge-in: if I speak while Dixi talks, Dixi stops within about 150 ms and listens. Use echo cancellation instead of deafening the mic.
- Speak less: say nothing when the screen already shows the result. Use short pre-rendered earcons or cached 1-3 word phrases ("Done", "Opening YouTube") instead of generating speech for every action. Spoken replies for answers stay under about 2 sentences.
- Wake word: keep it only for always-listening mode. A session started by Option+Space never needs "Dixi".
- Use eval/audio-cache and eval/stt-wake.js plus score.js to report STT accuracy before and after. Hardware-only tests go into NEEDS_USER.md as a checklist with the exact phrases I should say.
Exit: after Dixi speaks, I can talk immediately; no clipped first words in the cached-audio eval; STT drop and reconnect test passes.

### Phase 3: Latency (target p50 first visible action <= 1 s after I stop; full simple command <= 2 s p50, <= 3 s p95)
Take the top 3 contributors from the Phase 0 table, one at a time. Candidate tactics, in the order I expect payoff:
1. Speculative execution: act on finished clauses while STT is still streaming (partly there). If Deepgram Flux exposes early or eager end-of-turn events, use them to start parsing and the LLM before the final transcript, and cancel cleanly when the final differs.
2. Deterministic first: grow the code-level and on-device parsers so most commands never touch an LLM. Promote every LLM answer that is stable into a deterministic rule or cache entry (the learning loop already exists; verify it works and measure the hit rate).
3. LLM routing: a small, fast model on Groq or Cerebras for intent, short fixed prompts, no long history, prompt caching where supported, streaming, and tool-call parsing on the first tokens. Escalate to a bigger model only on low confidence. Never block the voice loop on a slow model.
4. Replace fixed sleeps and polling in execute.js (150 ms polls, 2.5-6 s deadlines, settle waits) with event-based waits (MutationObserver, navigation and load events). Verify each action's effect instead of waiting a fixed time.
5. Everywhere mode: reader.js, input.js and capture.js use accessibility-tree walks with 1.2-1.5 s time caps. Cache the tree, read only the focused window, and skip screenshots and vision-model calls unless the deterministic path fails. On-device OCR first.
6. Parallelize: open the tab or app while the command is still being parsed, prefetch obvious targets, run independent steps at the same time (commands must still apply in the order I said them).
7. Startup: lazy-load heavy modules, keep the renderer warm, no work on the hotkey path that can happen earlier.
Exit: bench shows the targets. If a target cannot be met, report the measured floor and which stage owns it.

### Phase 4: Activation and NO confirmations
- Hotkey: Option+Space toggles dictation: press once to start, press again to finish and send. Esc cancels. Keep the existing Option+Shift+Space (act on selection). Make keys configurable. Use Electron globalShortcut; handle registration failure visibly (see stuck rules).
- fn key (hold or tap as an optional setting): Electron cannot capture fn. Time-box 30 minutes to a small native key listener (CGEventTap through a tiny helper or an existing npm package) that needs Input Monitoring permission. If it is not clean, skip it and log why.
- Remove the on-screen approval card and every spoken "would you like..." for ordinary actions. Dixi acts directly. The safety net is: the existing undo log, plus a visible "what I just did" line with one-tap Undo (and voice "undo"). If something is truly ambiguous, ask ONE short question, and pick the likeliest default after 3 seconds.
- Verify trust: after every action, check that the state really changed (page, app, selection, file). Show success or failure explicitly. No silent failures. A failed verify triggers one automatic retry with the next-best method, then a clear failure line.
Exit: a 20-command run in each mode with zero confirmation cards; every action has a verified result line.

### Phase 5: UI (reuse and extend renderer/everywhere/overlay.js; do not build a second window system)
- One frameless, transparent, always-on-top overlay: alwaysOnTop level 'screen-saver', visible on all spaces including over fullscreen apps, focusable:false, shown with showInactive() so it NEVER steals focus (Dixi acts on other apps and reads their selection). Mouse-transparent except over the pill (forwarded mouse events).
- Notch detection at runtime. Prefer a reliable check, for example `osascript -l JavaScript` reading NSScreen safeAreaInsets.top for the screen the window is on (> 0 means a notch), with display bounds vs workArea as a fallback. Re-check when displays change.
- Notch Macs: a black island that grows out of the notch, top-center, flush to the top edge, rounded bottom corners, wider than the notch when expanded. It reads as an extension of the hardware.
- No notch (or external display): the same states in a small rounded pill at top-center. It appears on hotkey or button click and hides about 1.5 s after the result.
- States (one small state machine, shared by browser mode and Everywhere mode):
    idle: invisible or tiny dot
    listening: live waveform + partial transcript (one line)
    thinking: subtle shimmer, under 200 ms to appear
    acting: one line of step text ("Opening YouTube", "Searching LinkedIn")
    done: checkmark + one-line result + Undo
    error: one short line in red, no dialogs
    working-in-background: small spinner chip for jobs (research, brief)
- A "card" slot below the island for richer results (research report, brief, lists). It collapses automatically.
- Animations 200 ms or less, light and dark mode, respects reduced motion, text never wider than the island, no jank on 60 Hz.
- Show which provider is live and a tiny "degraded" marker when on fallbacks.
Exit: screenshots (use capture.js or Electron capturePage) of every state, on notch and non-notch layouts, saved in docs/ui/.

### Phase 6: Features (only after Phases 0-5 pass)
a) Voice OS-style actions: "open Kai", "find this person on LinkedIn", "find this on [site]", acting on the current selection or clipboard or front window. Deterministic fast paths first (open app or URL; site-search URL templates such as LinkedIn people search), then the LLM. Audit what Everywhere mode already covers. Add context awareness: selection, front app, page URL and title.
b) Deep research: a voice-triggered background job (jobs.js exists). Pipeline: plan 3-6 sub-questions (small model) -> parallel Brave searches -> fetch and extract top pages -> per-source notes (fast model) -> synthesized report with source links (stronger model). The island shows progress and the voice says a 2-sentence result; the full report opens in a card and is saved as markdown (e.g. ~/Documents/Dixi Research/). Tiers: quick answer (<= 10 s) and deep (<= 2 min, background). Cost cap per job through the existing spend ledger. Never block the voice loop.
c) Morning brief: brief.js already exists (225 lines). Read it, make it work by voice ("good morning") and on a schedule (automate.js). Use only sources available locally and keep each source optional (date, weather, calendar, mail via ingest.js if present, top news via Brave). Spoken part under 20 seconds; full brief in a card.
d) Product research (max 3 web searches TOTAL): identify "Voice OS" (the voice agent product) and "Hedwig" (my dictation may have garbled the name; "Hermes Agent" appears in OpenJarvis's skills-import list and is one candidate). Borrow FUNCTIONALITY only, never their design. If not clearly identified within 3 searches, log it and move on.
e) OpenJarvis (github.com/open-jarvis/OpenJarvis, Stanford Hazy Research and Scaling Intelligence; already cloned at ~/ref/OpenJarvis). Read source only, time-box about 30 minutes, skim these: model/engine routing between local and cloud, how it picks a model for the hardware, its latency/energy/cost evals, local-model setup. Take ideas for a local-first fast path on the M5: a small local model for intent routing (Ollama or MLX), on-device STT through a small native helper if it measurably beats the cloud path, and local trace data feeding the existing learning loop. Do not add heavy dependencies unless the bench shows a clear win. Mirror its idea of treating latency and cost as first-class metrics.
f) Backlog (do NOT start): MCP tool plug-ins, in-game voice control, anything not listed here.

## 7. TESTING AND VERIFICATION
- Free tests: unit tests, interpret.js regression cases, bench with cached or fake audio. Run on every change.
- Live verification on my Mac (real mic, real services) is allowed only after Phase 1, at most once per phase, with a spend cap of $0.50 per run enforced by the spend ledger, and all of it logged. Anything needing my voice goes to NEEDS_USER.md as a checklist (exact phrase, expected result).
- The reviewer agent re-runs unit tests and bench, reads the diff, and tries to break the change (disconnect network, kill the STT socket, remove keys, rapid hotkey presses, two apps focused).
- Regression gate: a change may not worsen p50 or p95 of any stage in the bench without a written reason. Passing 100-case suite results from earlier runs may not regress.

## 8. LANES AND FILE OWNERSHIP (avoid merge fights)
- Lane A, Voice/audio: voice.js, speaker.js, audio capture, STT code, localvoice.js
- Lane B, Providers/fallbacks: providers.js, main.js (service routing), spend ledger, health checks
- Lane C, Interpret/execute/latency: interpret.js, llm.js, execute.js, quick.js, reader.js, input.js
- Lane D, UI/hotkeys: overlay.js, app.js, everywhere.js (UI and approval parts), hotkey registration
- Shared files (main.js, everywhere.js): one agent edits at a time. Announce in BOARD.md, commit small, release the claim.
- Max 3 lanes run at once. Phase order above decides priority.

## 9. REPORTING
- After each phase: append to LOG.md: what changed, before/after numbers from bench, assumptions made, open risks. Update BOARD.md.
- Final DONE section: the full before/after latency table (p50 and p95 per stage), list of fixes with commit hashes, which hypotheses were confirmed or killed (wake-word gate, deaf tail, approval card, fixed sleeps, fallback delays), UI screenshots, how to run `npm run bench`, ASSUMPTIONS, and NEEDS_USER.md (keys, credits, permissions, hardware checks).
- Do not end with "should work." End with numbers and what remains unverified.