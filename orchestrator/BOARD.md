# Dixi Orchestrator Board

The single source of truth for every Dixi agent. The orchestrator (session **dixi-23**) edits it. Agents read it and report to dixi-23 by SendMessage. Only the orchestrator talks to the user.

- Full message history: [LOG.md](LOG.md)
- How the app works today: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. The one goal

Dixi controls anything on the Mac by voice, correctly and fast.
- One command can hold several tasks, done in the order spoken.
- Simple commands finish **≤ 2 s after the last word**.
- **Any task said on the Mac** has to work, including ones nobody tested. Where no script or URL route exists, Dixi navigates the Mac UI itself.
- **Done when**, two runs in a row:
  - ≥ 95% of the ≥ 50-command known suite passes;
  - ≥ 90% of dixi-cf's **hidden set** passes (20 commands no other agent sees, ≥ 6 needing screen navigation);
  - simple commands take ≤ 2 s.

Frozen until then: new features, game mode, memory, dashboards, refactors for their own sake, production checklist.

**Rules from the user**
- Only the Electron app and its backend. Never `website/`.
- No confirmation-before-risky-actions prompts: Dixi acts directly. Refusals stay: Dixi never types passwords, cards or codes, and Guardian scam blocks stay.
- No hard-coded sites, apps or phrases.
- Small commits. Never read `.env` values. No push, no merge to main: the orchestrator merges.

**Strict scope (from the user)**
- Only your lane's numbered tasks, in order.
- No side fixes and no files you don't own.
- New bugs and ideas go in your report under "BACKLOG:" and wait in [BACKLOG.md](BACKLOG.md) until the gate passes.
- Off-lane commits get reverted.

**Budget (from the user: credits are very limited)**
- **ElevenLabs:** zero calls without the orchestrator's OK. Test copies run with `ELEVENLABS_API_KEY=' '` and `DEEPGRAM_API_KEY=' '`, and commands go in as text through `everywhere.run`.
- **Anthropic:** unit tests make no network calls; Haiku only. Sonnet or Opus only on request.
- **Live tests:** stop each command at 30 s.
- **Batches:** anything over ~$0.50 needs the orchestrator's OK. Put the cost (from spend.json) in every report.

---

## 2. Baseline (Step 1): measured 22:08 by dixi-cf on the old code (0fff895), $0.12

| Command | Kind | Result | Time | What happened |
|---|---|---|---|---|
| search lo-fi beats on Apple Music | simple | ❌ | 16.2 s | screen agent via Spotlight; ended in the wrong app |
| buy a bagel from Safeway | simple | ❌ | 4.0 s | nothing happened (no steps, no speech) |
| play the first video (≈ "couldn't find that on this page") | simple | ❌ | 3.9 s | nothing happened |
| Go to my school calendar and add my test on Friday | multi | ❌ | 35.7 s | screen agent; no event created |
| …then text my mom I'll be late | multi | ⛔ blocked | — | waiting for the Dixi Test contact |
| Open Apple Music, search lo-fi beats, and play it | multi | ❌ | 2.8 s | files.js took it as a file search: "I didn't find anything like that." |
| Find the PDF I downloaded yesterday, rename it, and move it to Documents | multi | ❌ | 2.3 s | the file search missed a PDF that exists |
| Turn the volume down, open my notes, and start a new note | multi | ❌ | 31.0 s (hard stop) | screen agent; **typed into a Claude terminal in Cursor** (safety) |
| open Calculator | simple | ✅ | 0.45 s | |
| quit Calculator | simple | ❌ | 26.7 s | waited on a confirmation prompt |
| set the volume to 30 percent | simple | ✅ | 0.55 s | |
| open my Downloads folder | simple | ❌ | 5.8 s | opened the wrong folder (…/qa/) |
| open youtube.com | simple | ✅ | 0.01 s | |
| **Suite** | | **3/12 = 25%** | avg **10.8 s**, slowest **35.7 s** | simple p50 **3.9 s**, p90 **26.7 s** |

Failures routed: rows 1, 2, 3, 4, 8 and the safety issue → Lane A (A1–A4); rows 6, 7, 12 and the quit prompt → Lane C (C2f).

## 3. Agents and lanes (Nov 5 · master prompt + Addendum A; integration branch = `fix/voice-speed`, `orch/integration` kept equal)

Orchestrator = **dixi-orchestrator** (this session, pid 41391). The optimizer-autopsy project has its OWN `orchestrator`, `agent 1sub` and `precompact-*` sessions: never message them. The global settings no longer attach its folders (they moved to its own `.claude/settings.local.json`).

| Agent | Master lane | Worktree / branch | Files owned | Order | Reviews |
|---|---|---|---|---|---|
| **dixiagent1** | **B: providers/fallbacks + bench + gate** | `/Users/jaz/dixi-lane-b-speed` `lane/b-speed` (code) · `/Users/jaz/dixi-lane-qa` `lane/qa` (qa/) | providers.js, config.js, stt.js/deepgram.js provider choice, main.js service routing (claim), spend ledger, eval/bench, test harness, qa/ | DIAG(B) → npm-test gate → Phase 0 bench → Phase 1 | A, C |
| **dixiagent3** | **A: voice/audio + A1 + A3** | `/Users/jaz/dixi-lane-a-plan` `lane/a-plan` | voice.js, speaker.js, audio capture/worklet, STT stream code, localvoice.js, plan.js, interpret.js, hotkey registration (claim main.js) | DIAG(A) → A1 push-to-talk → Phase 2 (deaf tail, barge-in, endpointing) → A3 | B |
| **dixiagent2** | **C: interpret/execute/latency + A2 + Phase 4** | `/Users/jaz/dixi-lane-c-exec` `lane/c-exec` | execute.js, input.js, reader.js, mac.js, quick.js, llm.js, capture.js, everywhere.js approval parts (claim) | DIAG(C) → A2 click ladder → Phase 4 no-cards + verify → Phase 3 sleeps/AX cache | — |
| **dixiagent1** (after bench + dead-STT skip) | **D: UI — ⌥Space notch island first** (Phase 5 + A4–A8, ui-ref/1.png 2.png, the website's Dixi animation, a mild marble hint) | new `lane/d-ui` | overlay.js, app.js, dashboard/, ui/, styles.css, tokens.css | after its lane's Phase 0–4 items | — |
| (last) | **W: website declutter** (A10) | new `lane/w-site` | website/ only | after D | — |

Max 3 lane agents. One short-lived `haiku` helper per agent is allowed for big grep, log or bench summaries. Shared files (main.js, everywhere.js): announce a claim to dixi-orchestrator, commit small, release.
Hidden set: kept outside the repo (orchestrator-only).

### Task lists, per lane

Each agent splits its own lane into subtasks and may use subagents, but only on its own files.

**Lane A (dixi-aa)**
- A0: game mode → branch `parked/game-mode`, removed from the tree. The non-game work (false-wake fix, G1 wiring, ⌥⇧Space) committed to `feat/where-dixi-is-going`.
- A1: `plan.js`: a code splitter (`;`, "then", "and then", "after that"), then the instant path for each clause, then **one** claude-haiku-5-5 planner call returning ordered steps. Unit table: ≥ 25 utterances, ≥ 10 compound.
- A2: wire it into `everywhere.js run()`.
  - A queue: a new turn within ~5 s appends; only stop or a protest aborts.
  - Computer steps get only their own clause, Haiku first, and no screenshot is taken before routing.
  - No confirmation prompts.
- A3: `plan()` becomes the single front door, whichever window is focused. `web` steps go back to `voice.handleText`.
- A4: a reliable screen-navigation fallback (`computer` step).
  - Clause-only context, Accessibility first, screenshots minimized.
  - Haiku first; Sonnet only after two failed turns.
  - Caps: 30 s and 12 turns per clause.
  - Before any type/key action, code checks that the frontmost app is the target; never a terminal or IDE unless it is named.
  - Done when ≥ 90% of the hidden no-route tasks finish within 30 s.

**Lane C (dixi-holmes)**
- **CS (top priority, from the user)**: an unsafe-site guardrail.
  - `safesite.js` `unsafe(url)` uses a generated public malware/phishing list, plus the Guardian look-alike checks, plus IP/punycode/scheme rules.
  - It is called from mac.js openTarget, desktop.js site, the main.js tab navigation and fetches, and plan.js (by dixi-aa).
  - Executable downloads are cancelled.
- C0: make `ingest.test.js:34` deterministic.
- C1: `mac.js`: `installedApps`, `openTarget`, `runScript` (execFile, blocks destructive shell), `check`.
- C2: prove the direct routes, timed: Music search + play, Messages send (to the user's own number only), a Calendar event, a new note, the PDF find/rename/move. The recipes go in `orchestrator/lanes/c-recipes.md`.
- C2f (from the baseline):
  - fileIntent hijacks "search …";
  - "my Downloads folder" opens the wrong folder;
  - the "downloaded yesterday" date filter misses files;
  - desktop.js quit/wifi confirmations are removed.
- C3: hold_key kill/crash blocker: release keys on kill and on before-quit.

**Lane B (split 21:55: B1+B5 → dixi-holmes, B2 → dixi-cf, B3/B4 on hold)**
- B1: per-stage timing log (`timing.js`, `mark(runId, stage)`).
- B2: claude-haiku-5-5 vs Groq: planner latency table, p50/p90.
- B3: STT end-of-turn delay.
- B4: TTS first audio ≤ 300 ms.
- B5: Anthropic connection pre-warm and keep-alive.

**Test gate (dixi-cf)**
- Q1: `qa/mac-suite.js`: ≥ 50 commands, ≥ 15 multi-task. Checks real state via osascript. Driven through `everywhere.run` on a second muted Dixi.
- Q2: baseline numbers (first).
- Q3: rerun after every merge and report the delta.
- Q4: the **hidden set**, 20 commands kept outside the repo and shared only with the orchestrator. Unseen apps and phrasings, ≥ 7 multi-task, ≥ 6 with no scripting route.

---

## 4. Contracts between lanes

```js
// src/main/plan.js (Lane A)
plan(text, ctx, deps) → { steps: Step[], source: 'code' | 'model', ms }
Step = { do: 'instant'|'open'|'script'|'web'|'computer'|'answer',
         clause, app?, url?, lang?: 'applescript'|'jxa', code?, check?, say? }

// src/main/mac.js (Lane C)
installedApps() → Promise<string[]>
openTarget({ app?, url? }) → Result
runScript({ lang, code, timeoutMs = 8000 }) → Result
check({ lang, code }) → Promise<boolean>
Result = { ok, out?, error?, ms }

// src/main/timing.js (Lane B)
mark(runId, stage)   // stages: heard, stt_final, routed, planned, first_action, done, first_audio
```

---

## 5. Merge process

`orch/integration` was created at 0fff895 (01:32), the feat branch after A0. Integration worktree: `/Users/jaz/dixi-integration`.

| Time | Merge | Result |
|---|---|---|
| 00:12 | lane/c-exec (C0 2cda48b, C1 c4cdae2) → a181a35 | npm test 324/324 ✅. No behavior change yet (mac.js not wired), so no suite rerun. |

- Lanes commit on their own branch.
- The orchestrator merges into `orch/integration` one lane at a time, after `npm test` is green.
- dixi-cf then reruns the suite. Worse results → reverted.
- `main` only once the gate passes.

---

## 6. Decision log

| Time | Decision | Why (one sentence) |
|---|---|---|
| 01:22 | The root cause is agreed: no clause split on the Mac path, so whole-sentence fast paths miss and everything falls to the Sonnet screenshot agent. OPEN_APP also swallows "and …". | All three reports and my own read of the code agree (everywhere.js:113, :346, :635; voice.js:280). |
| 01:23 | Code split first, then ONE claude-haiku-5-5 planner call, then direct routes (AppleScript/JXA/URL), with the screen agent as a last resort per clause. | A regex split alone can't handle "search lo-fi in Music" or "add a test to my calendar"; a model writing scripts is general (no hard-coding) and takes ~1 call instead of 5+ screenshot turns. |
| 01:23 | Planner model: claude-haiku-5-5. Groq stays the measured comparison (B2). | The user asked for a small fast Claude model; it changes only if the numbers miss the 2 s budget. |
| 01:23 | A new turn within ~5 s appends to the run instead of aborting it. | Today a pause mid-command kills step one (everywhere.js:638). |
| 01:23 | Confirmation prompts removed on the planner path; password/card/code refusal and the Guardian blocks stay. | The user's explicit rule; refusals are not prompts. |
| 01:23 | Game mode is parked on a branch, not deleted. | The user froze it, and a standing rule says don't delete Dixi code. |
| 01:24 | Text-message tests go only to a "Dixi Test" contact or the user's own number. | Never message real people during tests. |
| 00:12 | The unsafe-site guardrail is one shared `unsafe(url)` check fed by a generated public malware/phishing list; every open path calls it; executable downloads are blocked. Tests use only big well-known sites. | The user's request; one shared function covers every caller, and a generated list avoids hard-coding sites. |
| 00:12 | Lane A: 10 more Haiku calls approved, with thinking disabled and max_tokens about 400. | The first 10 calls were 1.2–6.8 s with 4/10 broken, because hidden thinking ate the output. |
| 00:06 | The screen agent must check in code that the frontmost app is the clause's target before any type/key action; never type into a terminal or IDE unless it is named (part of A4). | In the baseline it typed into a Claude terminal. |
| 00:06 | files.js gets fixes for hijacked commands, home folders and the date filter, and desktop.js loses its quit/wifi confirmations (C2f, Lane C). | 4 of 9 baseline failures trace to these. |
| 22:05 | Mini Dixi tab (always-on floating tab, hover or ⌥Space, drag to a corner) is first in the backlog after the gate. | The user chose this over building it in parallel. |
| 22:00 | A hidden test set (Q4) and a first-class screen-navigation fallback (A4) are added; the gate requires ≥ 90% on the hidden set. | The user's bar is ANY task, and a known list alone invites tuning to the test. |
| 21:55 | Lane B split: B1 timing + B5 pre-warm → dixi-holmes after C1; B2 latency table → dixi-cf; B3/B4 on hold. | dixi-22 never confirmed; the B tasks are small and sit next to holmes' providers/ask.js work and cf's measuring. |

---

## 7. Blockers / needs the user

- [ ] A **"Dixi Test" contact** (your own number): **the user will create it** (22:05). Message rows are unblocked once it exists.
- [ ] macOS permissions to be listed by Lane C: Automation for Music, Messages, Calendar, Notes, System Events.
- [x] dixi-22 never confirmed: Lane B reassigned 21:55.
- [ ] **The user's running Dixi streams the mic to ElevenLabs STT nonstop** (the wake word is matched on cloud transcripts, main.js:386 / stt.js). That is probably what's draining the ElevenLabs quota. **The user decided (22:05): mic off when idle.**

---

## 8. Reports to the user

| Time | Pass rate | Avg / slowest | Agents | Needs you |
|---|---|---|---|---|
| 01:26 | not measured yet | | Lanes A, C and the test gate assigned; B offered to dixi-22 | "Dixi Test" contact |
| 01:33 | not measured yet | | A0 done; A1, C0 and Q2 running | Dixi Test contact; ElevenLabs drain (mic streams to cloud STT) |
| 00:06 | **3/12 = 25%** (baseline) | 10.8 s / 35.7 s | baseline done; A1, C1, Q1 in progress, all uncommitted | the Dixi Test contact |
| 21:55 | not measured yet | | ~20 h gap (Mac asleep?), no commits since 01:28; all three busy again; Lane B split | the same two |
| 00:14 | All agents compact at 50% of context (env override plus a direct instruction) | The user asked; it keeps long-running lane sessions from losing their task state at a full window |
| 00:21 | Approved Lane C's one-line `refresh-unsafe` script in electron/package.json and blocking installers outright | It's a script line the CS task needs, and blocking (instead of asking) follows the no-confirmation rule |
| 00:22 | A1 targets reset to p50 ≤ 1.0 s / p90 ≤ 1.6 s for model plans; streaming the plan into A2 approved; 10 more Haiku calls approved | Haiku takes ~0.9 s to its first token, so 700 ms isn't reachable; the ≤ 2 s gate is end-to-end and simple commands take the code path |
| 00:30 | CS merged into integration (400d306, 327/327 tests twice) | The safe-site block is a prerequisite for plan.js and for the user's malware guardrail |
| 00:30 | Haiku stays the planner; Groq goes to BACKLOG | Groq 429s at about one call per second on this key (B2) |
| 00:30 | QA uses its own ledger, capped at $1.50 | The shared spend.json counts other sessions, so it can't be used to stop QA |
| 00:30 | All agents run with no user prompts; questions go to the orchestrator | The user's order |
| 00:42 | Silent mode: no user updates until the gate passes AND the Mini tab is done; the done bar adds the hidden set ≥ 95% to the two clean suite runs | The user's order: "only return once you're 100% sure… and the UI thing is done" |
| 00:42 | Messaging test rows use a contact named "Dixi Test" that QA creates locally, pointing only at the user's own address; never a real contact like "mom" | Tests can't wait on the user and must never text a real person |
| 00:50 | Hard stop at 98% of the weekly Claude limit (78% at 00:48). All agents STOP and commit; the user gets one message | The user's order: keep some of the limit left |
| 00:50 | Merged lane/c-exec (5155dd7) and lane/a-plan (230d8fb) into integration; 340/340 tests (one flaky failure on the first run, didn't reproduce in 3 reruns) | A1, the safe-site wiring and the removal of the quit confirmation are ready for QA |
| 00:55 | builtin-tools.js goes to Lane A for the undo wiring | Lane C's no-confirmation move/rename only works once everywhere's deps pass `undo` |
| 00:58 | The messaging row is deferred to the end; the user is asked for one macOS Contacts/Automation click in the final report | An unanswered TCC prompt hangs the run, and only the user can click it |
| 01:00 | preload.cjs's everywhere block goes to Lane A (one text-only onBrowse channel) | A web step needs a main→renderer channel to reach voice.handleText, and nobody owns preload.cjs |
| 01:03 | Merges are held while QA's full run is going | A build that changes mid-run would make the results meaningless |
| 01:03 | Apple Music catalog: open the catalog link, AX-press Play, check the player state; without a subscription, say so plainly | It works on any subscribed Mac, it's generic, and there's no YouTube fallback |
| 18:25 | "rename it" with no name: don't ask; name it from the file's title or first line; send a one-file chain to fileIntent as one instant path | Dixi acts directly, and the user's own example gives no name |
| 18:25 | QA runs the orch/integration HEAD only (qa/.integ updated before every run) | The PDF failure came from QA running stale lane code |
| 18:3x | No confirmation prompts anywhere: a risky action the user asked for runs; a risky click they didn't ask for is refused with a reason, never asked | The user's rule "Dixi acts directly", plus the safety rules |
| 18:5x | QA cap → $3.00 ($0.70/run); rerun failed rows before full runs; tests use a dedicated Chrome window, never the user's tabs | Two passing full runs + hidden + post-Mini rerun don't fit in $1.50; the user's tabs were exposed |
