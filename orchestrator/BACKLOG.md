# Backlog: frozen until the baseline gate passes

Bugs and ideas that agents report but must **not** work on yet. Once the gate passes (≥ 95% of the Mac suite, simple commands ≤ 2 s, two runs in a row), the orchestrator turns this list into one plan and hands it out.

## FIRST after the gate (the user's request, 22:05)

**Mini Dixi tab**
- A small always-on-top floating tab, shown on every Space and over full-screen apps.
- Hovering the cursor over it, or pressing ⌥Space, activates Dixi.
- Drag it anywhere; it snaps to the nearest corner, and the position is remembered.
- Probably a new `src/main/minitab.js` window plus a renderer page, with one hook to the existing ⌥Space arm in everywhere.js.
- The user chose to build it right after the baseline, not in parallel.

## Problems with the app today

| # | Item | From | Where |
|---|---|---|---|
| 1 | Idle CPU 6.1% (budget 2%), about 550 MB | dixi-cf | the renderer is steady at ~3.5% |
| 2 | Errors aren't saved to disk (traces only with DIXI_DEBUG) | dixi-cf | main.js trace:write |
| 3 | API keys sit in a plain .env, not the Keychain | dixi-cf | config.js |
| 4 | No packaging (.app/DMG), no signing or notarization (needs a Developer ID), no auto-update | dixi-cf | |
| 5 | No CI, no CHANGELOG, no privacy export/delete-all | dixi-cf | |
| 6 | Game mode key pump: keys stay held after SIGKILL (game mode is parked) | dixi-cf | input.js PUMP (parked/game-mode) |
| 7 | One spend ledger for every instance, tests included: tests eat the founder's cap, and two apps race on one file | dixi-cf | main.js:63 |
| 8 | Approvals wait forever when no one answers (moot on the new no-confirmation path) | dixi-cf | everywhere.js:296-307 |
| 10 | The wake word is matched on CLOUD transcripts: the mic streams to paid STT nonstop and drains ElevenLabs | dixi-aa | main.js:386, stt.js |
| 11 | TTS fetches a whole MP3 before playing: +0.5–1.5 s to first audio | dixi-aa | main.js:288-299 |
| 12 | run() is a ~60-branch order-dependent regex chain; new phrases break old ones | dixi-aa | everywhere.js:633-760 |
| 13 | spend.json doesn't count live-test calls (A1 $ figures come from API usage numbers) | dixi-aa | spend ledger |
| 14 | Phishing feed licences (OpenPhish may be non-commercial only): the user decides | agent-2 | safesite refresh |
| 15 | Archives: zip is checked for programs inside, tar/7z are not | agent-2 | files.js/safesite |
| 16 | A flaky unit test still fails about 1 run in 5 at integration (not reproduced in 3 reruns) | orchestrator | npm test |
| 17 | ~~"rename it" with no new name should ask for the name~~ DECIDED 18:25: no question; name it from the title or first line (Lane C), route a one-file chain to fileIntent (Lane A) | agent-2 + agent-3 | files.js, plan.js |
| 18 | NOISE keeps "and": "photos from Paris and Rome" needs "and" in the file name | agent-2 | files.js |
| 9 | Failures leave no record by default (traces only with DIXI_DEBUG) | dixi-cf | main.js:399-408 |
| 19 | Spend isn't counted on aborted planner streams | agent-3 | everywhere.js |
| 20 | Planned web steps are fire-and-forget; the queue doesn't wait for the browser | agent-3 | everywhere.js |
| 21 | An appended utterance gets no 'done' timing mark | agent-3 | everywhere.js |
| 22 | Speculative plan at the STT pause (voice.js) not built yet | agent-3 | voice.js |
| 23 | runPlan has no unit test (it's a closure inside setupEverywhere) | agent-3 | everywhere.js |
| 24 | Spotlight kMDItemTitle for some PDFs runs several lines together; cut the name at the first line break | agent-2 | files.js |
| 25 | "rename it to X and move it to Y" with no find step returns null (it acts on the last results); Lane A could route it as two steps | agent-3 | plan.js |
| 26 | ~~QA runner sleeps a flat 1.5 s after run() ends, padding every simple row~~ ASSIGNED to agent-1 after the current run: poll every 100 ms | agent-1 | qa/mac-run.js |
| 27 | Apple Music catalog Play plays the album from track 1, not the requested song (/song/ link or select the row first; needs a subscribed Mac to verify) | agent-2 | desktop.js |
| 28 | everywhere.js:935 says "Opening my calendar." with the raw words; say the app's resolved name (openApp resolves it since fd9daa2) | agent-3 | everywhere.js |

## Features already built but not wired (frozen)

- automate.js: schedules, file triggers, page monitor, workflows (dixi-holmes)
- clipboard history, region capture, drag-and-drop (dixi-holmes)
- study.js, day.js (dixi-aa, never written)
- Game mode, on `parked/game-mode` (dixi-aa)

## Ideas for the best Dixi

Asked each agent at 01:30. Ideas that are already lane tasks are marked *(in lane)*.

**dixi-cf**
1. One front door for browser and Mac *(in lane: A1–A3)*
2. Done means proven: read real state after each step *(in lane: C1 check())*
3. App skills from each app's own AppleScript dictionary (sdef), read at runtime, so any scriptable app works
4. Act while the user is still talking: start clause 1 at the first "then"/comma
5. Replay what worked (skills.js): a repeated multi-step command makes 0 model calls and takes ~1 s
6. Cassette tests: record LLM replies once, so reruns cost $0 and are deterministic
7. The Accessibility tree first, the screenshot last
8. Stop also puts things back: undo for volume, app state and created notes/events
9. Free on-device voice by default: $0 per turn and a faster first audio
10. Per-stage timing visible in the app *(in lane: B1)*

**dixi-aa**
1. One front door: plan() *(in lane: A1–A3)*
2. App-native AppleScript first, the screen agent last *(in lane: A1/C1)*
3. A step queue with spoken progress; a new turn appends *(in lane: A2)*
4. A plan cache: an utterance shape that worked replays with no AI
5. A local wake word (or press-to-talk) so no audio streams until "Dixi": STT cost near zero
6. Streaming TTS: the first sentence is spoken while the rest is planned
7. Verify each step in code *(in lane: C1)*
8. Per-step ms plus a nightly $0 replayed eval *(in lane: B1/Q3)*
9. Leaner screen agent: diff screenshots, AX-first, Haiku, a 30 s cap
10. Undo for every reversible action

**dixi-holmes**
1. Fastest route per step: instant > URL scheme > AppleScript > AX press > vision, with a check after each *(in lane)*
2. Accessibility first, screenshots as the fallback
3. Recipe cache: a script that worked for (app, intent) replays with no model
4. Checks are scripts, not screenshots *(in lane: C1)*
5. Act while the user speaks, per Mac clause
6. Stream everything: Groq tokens → first sentence spoken, plus an instant "On it."
7. On-device STT (Apple Speech) and a local wake word; cloud STT only for dictation
8. App name resolution with no model: installedApps() + bundle names *(in lane: C1)*
9. Real-command regression suite before every merge *(in lane: Q1/Q3)*
10. One kill key that releases everything, plus the undo log

Also from dixi-holmes: STT is fixed to English (stt.js:39); Groq isn't in any provider tier (providers.js MODES.hybrid).

- [Nov 5, user] Sign-in that "doesn't forget": browser tabs already persist (persist:dixi-tabs). Mac-wide: on a login page Dixi focuses the username field so macOS Passwords / Chrome AutoFill offers the saved login (Touch ID); Dixi never reads, types or sends the password. After Phase 4.
- DONE f348c1e: the island shows "Reconnecting…". (app.js wake toggle in the browser settings sheet: left, browser is last.)
