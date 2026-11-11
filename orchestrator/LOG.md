# Orchestrator log

Every message between the orchestrator (dixi-23), the agents and the user, oldest first. The live status is in [BOARD.md](BOARD.md).

Legend: **→** orchestrator sent · **←** agent replied · **👤** the user · **📣** report to the user

---

## 2026-10-31

### 01:15 · 👤 User → orchestrator
Take charge of all the Dixi agents and fix one problem: Dixi must control anything on the Mac, with several tasks in one command, correctly and fast (≤ 2 s for simple commands). Step 0: analyze the repo. Then baseline, the board, lanes, 30-minute cycles, a 50-command test gate, short reports. No new features.

### 01:17 · 👤 User
"You'll be the only person who's gonna ask me questions … give them work … just fix the baseline. The main feature: control anything on my Mac by voice, multiple things at once, instantly."

### 01:18 · → All four Dixi agents (dixi-aa, dixi-cf, dixi-22, dixi-holmes-council-r1)
Freeze edits and commits. Report three things: your current work and uncommitted files, three reasons multi-task Mac commands fail or are slow (file:line), and the one fix you'd make first.

### 01:19 · ← dixi-holmes-council-r1
- **Stopped.** It was about to run an 11-command Mac baseline in a test copy.
- **Built and committed** (f579492, b550048, 51c7da6): the tools.js registry, mcp.js, builtin-tools.js, undo.js, jobs.js, index.js + ingest.js (local search), ask.js (Groq, ~0.35 s), capture.js (act on selection, OCR), automate.js.
- **Uncommitted:** none. bayvalleyhacks-baseline isn't theirs.
- **The user's last words to it:** "first try to fix the basic thing … simple base line control over mac do any task on your mac instantly."

### 01:19 · ← dixi-aa
- **Stopped** its builders (day.js was killed, study.js stopped; neither file written). It's running the user's Dixi in browser mode.
- **Uncommitted, theirs:**
  - game mode (game.js, the input.js key pump, the GAME regex, wiring);
  - the voice.js false-wake fix;
  - G1 wiring (ask, index, jobs, undo);
  - the ⌥⇧Space selection key.
- **Tests:** 324/324.
- **Root causes:**
  1. A new STT turn aborts the run (voice.js:280, everywhere.js:638).
  2. No split, and whole-string anchored fast paths (desktop.js:32), so everything falls to the computer-use agent (everywhere.js:346).
  3. The Sonnet agent with a fresh screenshot every turn: 3–5 s per step.
- **First fix:** a step planner in front of run(): a clause split, Groq JSON when ambiguous, fast paths per step, and a queue that appends instead of aborting.

### 01:21 · ← dixi-cf
- **Role:** independent QA.
- **Theirs:** qa/ (suite, runner, dashboard, repros), the root package.json, the app.spec.js launch() fix. Live stages never ran.
- **Verified BLOCKERs:**
  - hold_key stays held after a kill or crash (input.js `key()`);
  - the game key pump stays held after SIGKILL.
- **MAJOR:** ingest.test.js:34 fails 5 of 8 runs.
- **Root causes:**
  1. No clause split on the Mac path, so compounds fall to the 40-turn Sonnet agent.
  2. OPEN_APP swallows "and …" (everywhere.js:113): it opens the wrong app name or drops the rest.
  3. The only splitter is hive's parallel one (:616).
- **First fix:** an ordered clause splitter at the top of run(), plus a live Everywhere harness checking real state.

### 01:21 · ← dixi-holmes-council-r1 (full report)
Same root causes, verified by running the code:
- `desktopIntent("turn the volume up and open Calculator")` → null.
- splitClauses misses ";" and "then".
- No direct route for Messages.

**First fix:** split, then instant paths, then the agent only for leftover clauses. **Harness note:** don't set DIXI_EVAL (main.js:210 turns Everywhere off).

### 01:22 · 👤 User
"Talk to each of them, get their opinion … give them tasks based on the collective progress … to fix this baseline issue." Also: "create a plan to give each of the Claude agents to launch subagents."

### 01:22 · Orchestrator decision
Code split, then ONE claude-haiku-5-5 planner call, then direct routes (AppleScript/JXA/URL). The screen agent is the last resort, per clause. See BOARD §6.

### 01:21 · Orchestrator
Created worktrees `/Users/jaz/dixi-lane-{b-speed,c-exec,qa}` on branches `lane/{b-speed,c-exec,qa}` from 51c7da6. node_modules and .env are symlinked.

### 01:24 · → dixi-aa: LANE A (Understanding + front door)
- A0: park game mode, commit the rest.
- A1: plan.js.
- A2: wire it into run(), with the append queue and no confirmations.
- A3: plan() as the single front door.

### 01:24 · → dixi-holmes-council-r1: LANE C (Execution)
- C0: the flaky ingest test.
- C1: mac.js (installedApps, openTarget, runScript, check).
- C2: timed direct routes (Music, Messages to own number only, Calendar, Notes, PDF move).
- C3: the hold_key blocker.

### 01:24 · → dixi-cf: TEST GATE + BASELINE
- Q2: baseline numbers first.
- Q1: a ≥ 50-command Mac suite with real-state checks.
- Q3: rerun after every merge.
- Answered its questions: bugs go to owners by file; live stages are OK; commit qa/ on lane/qa; checklist work is frozen.

### 01:24 · → dixi-22: LANE B (Speed), offered
B1 timing log, B2 Haiku vs Groq, B3 STT, B4 TTS, B5 pre-warm. **No reply yet**; reassign at 01:40 if still silent.

### 01:25 · 👤 User
"Your job is not to do any work … give the work to these agents to divide up … into subtasks. If they need any help, you will help them."

### 01:26 · 👤 User
"Limited tokens and API keys … use very limited API credits. Especially for ElevenLabs."

### 01:26 · → ALL: BUDGET RULE
- **ElevenLabs:** zero calls without the orchestrator's OK. Test copies run with `ELEVENLABS_API_KEY=' '` and `DEEPGRAM_API_KEY=' '`, and commands go in as text.
- **Anthropic:** unit tests make no network calls; Haiku only.
- **Live runs:** 30 s cap per command.
- **Batches:** anything over $0.50 needs the orchestrator's OK.
- **Baseline:** only the 7 known-failure rows plus 5 simple commands, about $1–3.
- **Lane B:** B3 and B4 on hold.

### 01:33 · ← dixi-cf
- **Moved and committed** qa/, the root package.json and the app.spec.js fix to `lane/qa` (892bfa6). The main tree is clean of its files.
- **Q2 baseline started**, under the budget rule.
- **Sent its problems and ideas list**, added to BACKLOG.md. New problems: the shared spend ledger, approvals that wait forever, no default error log.

### 01:31 · ← dixi-aa: A0 done
- **Committed** 59e8626, 0c220fb and 0fff895 to the feat branch; game mode is on `parked/game-mode` (892111a). Units 318/318.
- **Sent its problems and ideas list** (in BACKLOG.md). Key point: the wake word is matched on cloud STT, so the mic streams to paid STT nonstop.

### 01:32 · Orchestrator
Created `orch/integration` @ 0fff895 and the worktree `/Users/jaz/dixi-lane-a-plan` (`lane/a-plan`). → dixi-aa: start A1. Keep the prompt under 1.5 KB and cached; max 10 live calls.

### 01:33 · Orchestrator
Scheduled a check-in every 15 minutes (:07, :22, :37, :52) and dixi-22's deadline (01:41).

### 01:4x · ← dixi-holmes-council-r1
Budget and scope rules received; Lane C costs $0 (osascript only). Sent its problems and ideas list (in BACKLOG.md). New: Groq isn't in any tier despite ~0.35 s; STT is fixed to English (stt.js:39).

### 21:54 · Orchestrator check-in
- **Clock gap:** jumped from 01:33 to 21:54 (Mac asleep?). No commits since 01:28.
- **Worktrees:** lane-c has an uncommitted ingest.test.js diff (C0); lane-qa has uncommitted qa/run.js + qa/app.js; lane-a has no plan.js yet. No off-lane edits found.
- **dixi-22:** status "waiting", never confirmed. → **Lane B withdrawn.**
- → dixi-holmes: progress? Plus B1 timing.js and B5 pre-warm after C1.
- → dixi-cf: progress and partial baseline numbers? Plus B2 Haiku-vs-Groq table.
- → dixi-aa: progress on A1? Write against a stub; no need to wait for Lane C.

### 21:57 · ← dixi-aa: A1 in progress
Design done; writing plan.js + plan.test.js against a stub executor. Code split, then the instant path, then one Haiku JSON call, then validation in code. $0, no blockers. The prompt is ~1.4 KB, below the cache minimum.
→ **Approved, with two corrections:** a URL host is OK if a said word (≥ 4 letters) appears in it or it uses an installed app's scheme; check names against what was said, not every literal (dates and message text are computed).

### 21:58 · ← dixi-cf: Q2 in progress
- **Committed** lane/qa 5c15b74 (the launchMac harness). The probe passes: muted copy, Everywhere on, real-state reads work.
- **$0.00 spent so far.**
- **Row 4** (text mom) blocked until the Dixi Test contact exists. "couldn't find that on this page" isn't a literal string in the code, so it's approximated with a YouTube row.
- **BACKLOG:** eval/harness.js launchApp throws in --real mode.
→ Run row 4 without the text part; clean up whatever each test creates.

### 21:56 · Orchestrator check-in (cron)
- **Commits:** 5c15b74 (lane/qa).
- **Worktrees:** lane-a has plan.js in progress; lane-c still has the uncommitted ingest.test.js diff. No off-lane edits.
- **No pings sent:** every agent reported in the last 10 minutes. Still waiting on dixi-holmes's progress reply (asked 21:55).

### 22:00 · 👤 User
"This should do any task I tell it to do … it can navigate through my Mac and do these tasks. After all your sessions are done … this should better be done."

### 22:00 · Orchestrator response
- → dixi-aa: **new A4**, the screen-navigation fallback (Haiku-first, AX-first, 30 s / 12 turns per clause), judged on the hidden set.
- → dixi-cf: **new Q4**, a hidden set of 20 commands kept outside the repo. The gate gains ≥ 90% on the hidden set.
- → dixi-holmes: keep mac.js generic (no app special cases); AX helpers under 300 ms in non-Apple apps too. Re-asked for its progress report.

### 22:03 · ← dixi-holmes-council-r1
- **C0 done** (d983702): ingest.js:82's settle timer leaked; 10/10 green.
- **Suite** is 318/319 on the lane base: voice.test.js:251 fails because the lane predates 59e8626.
- **C1 in progress**, kept generic. $0.
- → Rebase lane/c-exec onto orch/integration. C3 builds on the committed input.js (the key pump is parked); dixi-aa adds the stop/kill hook line.

### 22:05 · 👤 User
Wants Dixi always on screen as a mini tab: hover or ⌥Space activates it, and it can be dragged to any corner.

### 22:05 · 👤 User decisions (asked by the orchestrator)
- **Mini tab:** right after the baseline (top of the backlog).
- **ElevenLabs:** mic off when idle.
- **Dixi Test contact:** the user will create it.

## 2026-11-01

### 00:04 · Orchestrator check-in (cron; about 2 h since the last one)
- **No commits in 20 minutes.** Uncommitted: plan.js, plan.test.js, test/live/ (lane-a); mac.js, mac.test.js (lane-c, rebased to 2cda48b); qa mac-suite, mac-run, b2-planner, results (lane-qa). No off-lane edits.
- **Baseline found** in qa/results/mac-2026-11-01T05-08-35-361Z.json: 3/12 pass, avg 10.8 s, slowest 35.7 s, simple p50 3.9 s / p90 26.7 s, $0.12.
- → dixi-aa: its lane's failures, plus the **safety finding** (the screen agent typed into a Claude terminal), which goes into A4. Commit the WIP.
- → dixi-holmes: **new C2f** (files.js hijacks "search …", wrong Downloads folder, the date filter missing a PDF; remove the quit/wifi confirmations). Commit the WIP.
- → dixi-cf: commit the suite; send B2; keep a neutral app in front during runs.

### 00:10 · ← dixi-holmes-council-r1
- **C1 done** (c4cdae2): mac.js works live. Open takes 88–585 ms, verified; runScript about 30 ms; installedApps 144 ms first, then 0.03 ms cached.
- **Suite** 324/324. $0. Starting C2f.

### 00:11 · ← dixi-aa
- **A1 WIP committed** (55fbde7); 328/328.
- **Unit table:** 26 code-path commands (11 compound), $0.
- **Live, 10 Haiku calls:** 1.2–6.8 s each, and 4/10 broken (truncated JSON or empty). Cause: Haiku 5.5's adaptive thinking was on. Fixed with thinking disabled.
- **The PDF find/rename/move runs on the code path in 3 ms.**
- Asked for 10 more calls.

### 00:12 · Orchestrator
- **Merged** lane/c-exec → orch/integration (a181a35); npm test 324/324.
- → dixi-aa: 10 more calls approved (thinking off, max_tokens about 400); rebase onto a181a35; call safesite in plan.js.

### 00:12 · 👤 User
"Set guardrails … it keeps going onto not safe sites for testing … it cannot go to any site that might contain malicious software."
- → dixi-holmes: **new top-priority CS**, the unsafe-site guardrail (`safesite.js`, a generated malware/phishing list, every open path, downloads blocked).
- → dixi-cf: tests use only big well-known sites, no downloads, a guard row for a known-bad host, and every visited URL logged and flagged.

### 00:14 · 👤 User
"Ask all the agents to auto-compact. When they're 50% of their limit hit."
- Set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` in ~/.claude/settings.json (backup: settings.json.bak-autocompact). New or restarted sessions compact at 50% on their own.
- → dixi-aa, dixi-holmes, dixi-cf: compact at 50% (manually, if the session started before the change). The summary must keep the lane tasks, the contracts, and the scope/budget/safety rules.

### 00:15 · Orchestrator check-in (cron)
- **Commits (last 20 min):** lane/a-plan 5276d40, 0c1a484 (thinking off, plan capped at 400 tokens); lane/qa f091a69 (Mac suite runner, baseline results, B2 script); a181a35 merge.
- **Uncommitted:** lane-a plan-live fixture/script; lane-qa mac-run.js, mac-suite.js. **No off-lane edits.**
- Skipped dixi-aa (00:11) and dixi-holmes (00:10): both reported in the last 10 minutes. → dixi-cf: report request (B2 table, Q1 count).

### 00:15 · 👤 User
"This means you too … whenever there's 50% … that time you compact."
- The orchestrator session started before the 50% setting, and it can't run /compact itself. The user was asked to type `/compact` in this session.

### 00:21 · Orchestrator check-in (cron)
- **Commits (last 20 min):** lane/qa 7ecc0ba (00:17): neutral TextEdit in front, unsafe-front guard, visited-URL log, end-state timing. Nothing new on lane/a-plan or lane/c-exec.
- **Uncommitted, all in-lane:** lane-a has the plan-live fixture and script. lane-c-exec has CS: safesite.js, refresh-unsafe.js, unsafe.generated.txt (704 KB, URLhaus + phishing-filter hosts), the desktop.js/files.js/mac.js hooks, and one electron/package.json script line (approved).
- **No off-lane edits.**
- → dixi-aa: report the re-measure, commit, rebase on a181a35, then safesite and A2.
- → dixi-holmes-council-r1: add a safesite test, commit CS, hook main.js, tell aa, report.
- dixi-cf: not asked again (asked at 00:15, committed at 00:17). dixi-22: withdrawn, not asked.

### 00:22 · dixi-aa → Orchestrator (A1 report)
- 18859a0: re-measure rebased on a181a35 with the real mac.js. 10 Haiku calls: plan p50 1485 ms, p90 2354 ms, max 3220 ms (cold); 1 of 10 truncated at 400 tokens and fell back to computer steps. The PDF command took the code path (3 ms). $0.004 in total for A1.
- Slow because the output dominates: ~0.9 s to the first token, then ~3–4 ms per token. Fix (a)–(c): the model plans only the clauses code couldn't; drop `say` and the filler fields; keep the complete steps of a cut-off reply.
- Quality: the Music plan searched the library, not the catalog; the calendar script used `calendar 1`, not "School".
- → Approved: (a)–(c), 10 more calls, two generic prompt rules (prefer search URLs/schemes; use the names the user said), streaming into A2, and the front-app check for keystroke scripts. New target: p50 ≤ 1.0 s, p90 ≤ 1.6 s. BACKLOG #13.

### 00:23–00:30 · 👤 User: "never ask me for permissions"
- The Cursor extension sessions were launched with `--permission-mode=auto`. Set Cursor `claudeCode.allowDangerouslySkipPermissions: true` and `claudeCode.initialPermissionMode: bypassPermissions` (backup: settings.json.bak-perms). ~/.claude/settings.json already has `defaultMode: bypassPermissions` (set at 00:20 by someone else).
- Sessions already running keep their mode. The user is switching each one: Shift+Tab, or `claude --dangerously-skip-permissions --resume`.
- Told every agent: never ask the user anything; everything goes to the orchestrator. Sessions were renamed: holmes → agent-2, dixi-cf → agent-1, dixi-23 → orchestrator.

### 00:24 · dixi-aa: A1 re-measure 2
465790b, 9a9d27d: plan p50 1327 ms, p90 2061 ms, 0 truncated. Music now goes through the search link; the school calendar is right. Approved: speculative planning at the STT pause, the date-math prompt line, and the safesite edits in everywhere.js.

### 00:26 · agent-1 (dixi-cf): B2 + causes
Plan time: Groq 1.03 s vs Haiku 3.2 s, but Groq 429s. Causes: fileIntent hijacks compound commands (files.js:40); a quit confirmation (desktop.js:258); compound commands fall to the screen agent. Q1 is at 13 rows. → Haiku stays the planner; QA has its own $1.50 ledger.

### 00:30 · Orchestrator merge
lane/c-exec (CS 7df6237) → orch/integration at 400d306. npm test: 326/327 on the first run, then 327/327 on two reruns (one flaky test). → agent-2: main.js hook, desktop.js:258, files.js:40, then C2f.

### 00:37 · Orchestrator check-in (cron, after the restart into bypass mode)
- Renamed: agent-1 = dixi-cf (restarted), agent-2 = Holmes (restarted), agent-3 = dixi-aa (idle). The orchestrator also restarted.
- The two held 00:30 messages (agent-1, agent-2) were released. Re-briefed both after their restarts. agent-3 got the CS merge, the approvals and A2 again.
- **Commits (30 min):** 400d306 (merge), c67978e (B2), 465790b/9a9d27d (plan), 7df6237 (CS). **Uncommitted:** lane-c main.js (the in-lane CS hook). **No off-lane edits.**

### 00:40 · agent-3 restarted in bypass mode
- New session agent-3 [3a9ef5]. The old [eda1eb] is still open, and the message held there (971deb41) is left alone.
- Sent the new session the full Lane A brief: rebase on 400d306, wire safesite in, the approvals, then A2.

### 00:42 · 👤 User: "only return to me once you're a hundred percent sure it can do this… and the UI thing is done"
- Silent mode. The check-in cron was recreated as SILENT: no user updates, and agent questions are decided by the orchestrator.
- Done = suite ≥ 95% with simple commands ≤ 2 s on two consecutive runs, plus the hidden set ≥ 95%, no safety violations, then the Mini tab built and verified, then the suite rerun with no regression. Then the final table goes to the user.

### 00:45 · agent-3 (Lane A)
db13a8c: rebased on 400d306 and wired safesite into plan.js check() and everywhere.js (:1053 website, :911 back()); 340/340 tests. $0. Next: A2.

### 00:45 · agent-2 (Lane C)
7f02060: main.js safe-site hook, live-checked (blocked list hosts, a lookalike domain and a private IP; Setup.dmg download stopped; unsafe() 1–20 µs). 9b6a195: no quit or Wi-Fi confirmation; "quit Calculator" took 1217 ms with no question. $0. Next: files.js:40.

### 00:48 · 👤 User: "stop when 98 percent of the weekly limit is hit"
- New ~/.claude/usage-tee.sh saves the status line's rate_limits to ~/.claude/usage-latest.json (statusLine backup: settings.json.bak-statusline). A Monitor alerts at 90/95/98%. The cron was recreated with step 0, the weekly stop.
- First reading: **weekly 78%**. The agents were given a token-frugality rule.

### 00:50 · Orchestrator merges
lane/c-exec → 5155dd7 and lane/a-plan → 230d8fb on orch/integration. 340/340 tests (339 on the first run; the flaky test didn't reproduce in 3 reruns).

### 00:55 · agent-2 (Lane C) → merge 05b28b3
- ed5d5d9: fileIntent returns null for compound commands; app names aren't treated as files; "open my Downloads folder" opens ~/Downloads (177 ms); "downloaded yesterday" uses kMDItemDateAdded (464 ms).
- af0c7a9: undoable move/rename with no question (6 ms / 1 ms live).
- Merged into integration, 342/342 tests. → agent-3: the undo wiring (everywhere.js:681, builtin-tools.js:23) as part of A2. → agent-2: B1, then C2, B5, C3. BACKLOG #17, #18.

### 00:58 · agent-1 (QA)
- f4b8ab2/58dc2a6: Q1 is at 50 rows (21 multi-task); guard row smoke passed (450 ms, refused); Dixi Test card setup; own $1.50 ledger; the done bar in the summary. The neutral front is now a Finder window, avoiding the TextEdit automation prompt.
- Smoke: Calculator 492 ms, volume 384 ms, mute 2189 ms (over budget), guard 450 ms. $0.
- → Full run approved ($0.30–0.60). Messaging row deferred (macOS TCC prompt).

### 01:00 · agent-3 (Lane A)
4d5ada5: the undo wiring (move/rename with no question; "undo that" uses the undo log; fileChangeAt fixed). 9762456: streamed plan via deps.onStep plus the three prompt rules. 343/343 tests. → Approved the one-line preload.cjs onBrowse channel. Next: A2, then A3.

### 01:03 · agent-2 (Lane C)
B1 8f187fd: timing.js. C2 live: calendar add 769 ms, note 487 ms, PDF find/rename/move + undo ✅, library play 125 ms, catalog play ❌ (`play` doesn't start a catalog song). Messages timed out (likely an Automation prompt on screen). → (a) QA creates the contact; messaging goes last. (b) Build AX press Play for the catalog. (c) Leave the prompts. B1 wiring → agent-3. Merge held until QA's run ends.

### 00:51 · 👤 User: "take a break, I have to go to sleep, we'll resume tomorrow morning"
- PAUSE sent to agent-1 (stop the suite run cleanly, commit partial results), agent-2 and agent-3 (commit WIP, then idle).
- Check-in cron 84fe2472 deleted, usage monitor stopped, caffeinate stopped so the Mac can sleep. Weekly usage: 80%.
- Held: Lane C's 8f187fd (B1) is not merged yet, held for QA's run.

## RESUME CHECKLIST (morning)
1. ListAgents: names may change after restarts. Lane A = agent-3 [3a9ef5], Lane C = agent-2, QA = agent-1.
2. Read the weekly % from ~/.claude/usage-latest.json; re-arm the 98% monitor; recreate the silent check-in cron (the prompt is in this session's history: step 0 weekly stop, then steps 1–6).
3. Merge lane/c-exec (8f187fd and anything after) into orch/integration after npm test.
4. agent-3: finish A2 (queue, timing marks, onBrowse), then A3 → merge.
5. agent-1: full 50-row suite run on integration → route the failures by owner.
6. Gate (two runs ≥ 95%, simple ≤ 2 s, hidden 20 ≥ 95%) → Mini tab → final table to the user. The final report also asks for one macOS Contacts/Messages Automation grant (messaging row).

### Night stop · agent-2 (Lane C) paused
Last commit 8f187fd (B1, tests green), tree clean, nothing running. B5 measured: cold ~170 ms, warm ~130 ms; a fresh socket after any idle gap (60 s → 276 ms). B5 = pre-warm the API host when speech starts (saves ~40–150 ms). Then C3, then the AX catalog play.

### Night stop · agent-1 (QA) stopped
- Partial run on 230d8fb (no A2/A4 yet): 1 of 7 rows passed, $0.1662, committed c9326f8. Three rows hit the 31–32 s hard stop: lo-fi Music, Safeway, school calendar. Volume+Notes also hit it.
- Failed: the Music search+play (3.2 s), and the PDF rename+move (the fixture never moved).
- The test copy was killed and cleaned up; the ledger marker was removed.
- **SAFETY REPEAT:** in the volume+Notes row, the screen agent typed "Notes" into a Cursor terminal prompt. The Enter check stopped it, and nothing was submitted.
- **Morning:**
  - (1) Lane A's A4 rule is top priority: before any typing, check the front app; never type into a terminal, IDE or Dixi itself.
  - (2) QA mitigation approved: hide terminals and editors through NSRunningApplication during rows, then unhide them.
  - (3) Rerun on integration after A2 merges.

### Sun 18:20 · 👤 User: "continue". RESUMED
- Weekly 81%. Usage monitor re-armed, silent check-in cron 7ce6da78 created, caffeinate for 8 hours.
- Merged lane/c-exec B1 (8f187fd) → orch/integration 86dc232, 344/344.
- → agent-3: the A4 front-app check before any typing comes FIRST (the safety repeat), then finish A2 (its WIP 4ac0245 has 1 failing test), then A3.
- → agent-2: B5 → C3 → AX catalog play; check whether the PDF row failure belongs to files.js or routing.
- → agent-1: the terminal-hiding guard, the Q4 hidden set; full run after A2 merges.

### Sun 18:3x · agent-1 (QA)
1d6c9f8: the terminal/editor hiding guard, plus the owner lane named in every failure. Q4 hidden set of 20 written: 8 multi-task, 6 screen-only, no new grants, nothing sends, buys or deletes. Kept outside the repo; the orchestrator holds a copy. Estimate $0.15–0.30 per run; QA ledger $0.17 of $1.50.

### Sun 18:25 · MERGE lane/c-exec → orch/integration @ 77d4180 (345/345)
- 87a3b9d B5: keyless keep-alive GET warms the Anthropic connection on STT activity, at most every 20 s. Saves 25–30 ms here, $0.
- 2facb20 files.js: "downloaded yesterday" matches date added OR last saved. The PDF fixture uses utimes.
- agent-2's cause for the PDF row: that run used lane/qa's own old files.js (QA ran stale code), plus the date-added-only filter. A live replay of the fixture is now found, renamed, moved, undone.
- DECISION: "rename it" with no name doesn't ask. files.js names the file from its title/first text line, falling back to the old name plus the date (Lane C). Lane A routes a one-file chain ("find…, rename it, move it…") to fileIntent as one instant path instead of the planner. Resolves BACKLOG #17.
- DECISION: QA rows must run the orch/integration HEAD (update qa/.integ to it before each run), never lane/qa's own electron/.
- Weekly usage 83%.

### Sun 18:26 · check-in: usage 83%; monitor alive. All edits are in-lane (A: everywhere.js+test; C: input.js, main.js, input.test.js for C3). Everyone reported within 10 min. No merges: A2 not done, C3 in progress. Silent.

### Sun 18:3x · MERGE lane/a-plan → orch/integration @ 274a5ef (348/348, twice)
- A2: streamed plan into run() (each step runs once it's final); executors instant/open/script(+check, one Haiku repair, then screen)/web(onBrowse→voice)/answer/computer; append queue (only stop or a protest aborts); timing marks heard…first_audio; no "One thing first" notice.
- A4 safety (6de94f6): front app checked in code (bundle id or LSApplicationCategoryType developer-tools, plus Dixi's pid) before any type/key/keystroke script; refocus once, else the step stops.
- Undo-logged move/rename with no question (bc3fb0d).
- Off-lane check: the 7 files are all Lane A's (builtin-tools.js and preload.cjs assigned 00:5x).
- DECISION: no confirmation prompts anywhere. Desktop verbs (quit, Wi-Fi off) run directly. A risky click the user asked for goes ahead; a risky click they didn't ask for (install/open anyway/allow/buy/delete/erase) is refused with a reason, never asked. Single-clause screen tasks may cost one Haiku plan call. Terminal dictation without line breaks and ⌘Z for "undo that" are unchanged.
- agent-1: qa/.integ follows orch/integration (a1f6746); GO given for the full 50-row suite on 274a5ef. MERGES HELD until it reports.
- BACKLOG #19–23 added (agent-3's items).

### Sun 18:3x · agent-2 (Lane C): ready, merge HELD (QA run)
- 2c50be0 C3: input.js tracks held keys, buttons and drags; stopAll() kills osascript and posts key-up/mouse-up on before-quit, exit and failed press. The kill cuts a 3 s hold in <2.5 s. Lane A is to call stopAll() from kill() (assigned).
- ca3b3e4 files.js: one-file chain as one intent (find → rename → move), a no-name rename taken from kMDItemTitle, else the first text line, else the old name + date added. Live: 369 ms and 321 ms, undone. 335/335, $0.
- BACKLOG #24, #25. Next for C: AX catalog play → mute.

### Sun 18:4x · agent-3 Q: no-ask change breaks 2 tests in redteam2.test.js (baseline file, unowned)
- DECISION: OK to edit. redteam2.test.js → Lane A (it tests everywhere.js). Both tests are rewritten to the new rule: refused means nothing pressed, nothing asked, and a reason spoken; the 'send it to Alex' case presses with nothing asked. Scope is unchanged: !el refused everywhere; unnamed refused only when strict. The words-match uses the user's clause text, not the model's.
- kill() → input.stopAll?.() approved (safe before C3 merges).

### Sun 18:4x · agent-3: c74fdd7 no-ask (on 274a5ef, 350/350), merge HELD (QA run)
- A risky press goes ahead only when its risky words are in the user's own clause words (state.words). The refusal is a spoken reason in code, with no model call and no retry; the queue stops in a plan. !el is refused everywhere; unnamed is refused only when strict. runDesktop verbs run without asking. The user's own Careful mode still asks (allowed). kill() → input.stopAll?.().
- Fixed: perform() read an outer-scope `said`.

### Sun 18:5x · agent-3: 71a426f file chain (350/350), merge HELD (QA run)
- plan.js fileChain(): a file-find first clause plus later clauses that point back to it (it/that/them/those) → ONE instant file step with fileIntent(full text), source 'code', no planner call. Needs Lane C ca3b3e4 in integration for the no-name rename. Next: A3.

### Sun 18:41 · check-in: usage 86% (≈+5%/30 min → 90% ≈19:05, 98% ≈20:00)
- QA full run on 274a5ef IN PROGRESS (pid 48703), about 21 rows done. Early fails: Desktop/Downloads→Documents folder opens leave the neutral window in front (C / A plan); new Finder window and "play some music" fell to the screen agent and hit the 33–39 s hard stop; YouTube play-first stopped because Electron came to front. Messaging row SKIP-TCC.
- Lanes clean (no uncommitted edits). Ready and held: C 2c50be0+ca3b3e4, A c74fdd7+71a426f, QA 605d9b3.
- No merges (run in progress). Silent.

### Sun 18:4x · agent-2: b25a6d5 Apple Music play (336/336, $0), merge HELD · ⚠ AGENT INCIDENT
- Play: library search first. With no subscription it says so plainly (no YouTube fallback). With a subscription: public catalog search → music:// link → AX press "Play" by name → check the player state. Live 208–263 ms (unsubscribed path). The subscribed path isn't verifiable here.
- Mute: Dixi 451 ms; the 2189 ms is QA's flat 1.5 s post-run sleep → agent-1 (BACKLOG #26).
- ⚠ INCIDENT (an agent probe, not Dixi): pressByName probe pressed Music's "Account › Join Apple Music…", which opened the "1 month free" offer sheet. Nothing bought or signed in. Then a coordinate click landed in the user's Chrome tab (plain text, nothing triggered). Contained: agent-2 stopped all coordinate clicks. Cleanup: agent-1 runs pkill Music after the current run and marks the Music rows after ~18:35 as possibly tainted.
- RULES (agent-2): no coordinate clicks ever; no live probes during a QA run; probes press controls by name only, never sign-up/subscribe/trial/buy/get/install.
- SAFETY GAP → agent-3 (before A3): sign-up/subscribe/trial/upgrade/"Get" install labels become risky (refused unless the user asked).
- agent-2 next (offline until the run ends): (a) Desktop folder ends in the front Finder window, (b) "new Finder window" as an instant route, (c) "play some music" with no song plays the library.

### Sun 18:5x · agent-3: c2bcdea risky set + sign-up/trial/upgrade/download/'Get' (351/351, $0), merge HELD. Positive/negative label tests (Get Info, Sign In, Downloads sidebar are not risky). Now finishing A3.

### Sun 18:5x · QA FULL RUN on 274a5ef: 30/49 = 61% (1 SKIP-TCC). Gate FAILED; the hidden set was not run.
- Multi 11/20, simple 19/29. Passed simple rows p50 1278 / p90 2397 ms (included the flat 1.5 s pad, now fixed 082bd7b). $0.6724 spent; ledger $0.8386.
- Failures by owner:
  - C: folder commands caught by fileIntent (3; partly fixed 47cf0de); pdf date/Spotlight lag; open-calendar; new-finder-window (fixed 17ccd9e); music-search false "Done.".
  - A: safeway-bagel and youtube-search-play false "Done."; amazon-then-apple order; music-search-play; calendar-school-test to the screen agent; google-paris-weather answered instead of searching.
  - Tainted by the Music sheet: play-music, volume-then-play.
  - QA-side: two rows read the user's active Chrome tab.
- SAFETY: 17/17 URLs safe, guard row refused in 721 ms, no downloads, no typing into terminals. EVENTS: the screen agent screenshotted the user's front Chrome tab (a claude.ai chat; scroll only), and typed URLs into the user's real Chrome (open-nytimes, misheard-you-tube). Root cause: web commands reached the screen agent (A3 fixes the routing), and tests shared the user's Chrome window (fixed by QA (a)).
- MERGE C (2c50be0 ca3b3e4 b25a6d5 47cf0de 17ccd9e 70a0d5b) + A (c74fdd7 71a426f c2bcdea) → orch/integration @ 8c207c4, 357/357 twice.
- DECISIONS: QA uses a dedicated Chrome window and checks only Dixi's own tabs; the QA cap is raised to $3.00 ($0.70 per run); the next run is the 19 failed rows only; play-music gets a local "QA Dixi Tone" fixture track (strict check kept); no user question about Chrome.
- Assigned: A → A3 front door, step order, no false Done, named-site search, calendar recipe, Music search+play. C → fs scan of known folders first, app-name match ignoring my/the/spaces, real Music search. agent-2 cleared for live replays.
- Usage 87%.

### Sun 19:0x · MERGE lane/a-plan bfaa4c3 (A3) → orch/integration @ 85eb58f (358/358 twice). Compound commands go to main from any window (HERE words keep them on the page); web steps wait for the browser's reply (60 s cap); a computer step with Dixi in front becomes a browser step. Single commands in main with no instant path still go to the lone screen agent → agent-3's item 1. A $0.01 live latency check approved. Usage 88%; usage monitor re-armed (b631ki6tp).

### Sun 19:0x · MERGE lane/a-plan 7be8e32 → orch/integration (item 1: single 'open X' with no app goes to plan() first; only computer steps reach the screen agent).

### Sun 19:1x · MERGE lane/a-plan 8a7bcef → @ bd0c67b (360/360): an open-link step waits up to 4 s for its page (fixes amazon-then-apple order). Live A3 planner: 0.77–1.9 s, <$0.005 (4 calls). Bug found: web chain split across Chrome and Dixi's browser → one browser (item 3). Asked agent-3 to confirm the tab read can't block on a TCC prompt. Simple planner rows (~1.9 s + open) sit at the 2 s line: watch it.

### Sun 19:1x · agent-1: e238e49 a dedicated QA Chrome window (only that window is read or touched; strayBrowserWindows counted) + 'QA Dixi Tone' Music fixture (exact cleanup by persistent ID, live-verified); 9ffb11a QA_CAP $3.00, --run-usd 0.70. Ledger $0.8386. PLAN: GO the 19-row rerun once A item 3 and C items 1–3 land, or at 93% weekly usage, whichever comes first, so the state is measured before the 98% stop.

### Sun 18:56 (real clock; the 19:0x/19:1x labels above are estimates and ran ahead) · ⚠ WEEKLY USAGE 90%
- MERGE lane/c-exec 206cc89 (known folders read with fs before Spotlight) + fd9daa2 ('open my calendar' → Calendar) → @ c49cbb1 (361/361).
- 90% rule: each agent finishes only its current item. A: item 3 (no false Done + one browser) + the TCC timeout answer. C: real Music search. QA: the 19-row rerun on GO (fixes landed or 93%).
- Not started, stays in the BOARD queue: A items 4–6 (named-site search, calendar recipe, Music search+play), A4 computer step, Mini Dixi tab.
- Lanes clean (A has an uncommitted item 3 in progress). Silent.

### Sun 19:0x · agent-1: 0655903 a clean stop on SIGINT (finishes the row, restores state, tears down, writes the ledger, marks stoppedByRequest; a 2nd signal exits at once). $0. Accepted: it serves the 98% stop. Idle until GO.

### Sun 19:0x · MERGE lane/a-plan 3100a4b (item 3) → @ e4335c4 (365/365): a clause counts as planned only when a step starts in it (fixes the dropped 'play the first video'); one browser per web chain; an unfinished screen step fails ('I didn't finish that.', the plan stops); the tab read is raced at 400 ms (TCC-safe); redteam2's openTarget is stubbed. Open (A4): a screen step that finishes wrong still counts as ok (no after-check). agent-3 IDLE (90% rule). Waiting on C's Music search, then GO the QA rerun.

### Sun 19:1x · agent-2: 80cfe01 real Apple Music search (music:// storefront search link, then poll Music's AX window text by pid until the terms show, else 'no results showed up'; presses nothing). Live 1593–1782 ms. Merging it breaks Lane A's plan.test.js:208 (the fixture now answered by code) → agent-3 one-line test fix; QA's music-search check to read the window text. agent-2 IDLE. BACKLOG #28.

### Sun 19:1x · 👤 USER: "stop now, that's enough". ALL STOPPED at weekly usage 90%
- STOP sent to agent-1/2/3 (commit WIP, then idle). Check-in cron 7ce6da78 deleted, usage monitor stopped, caffeinate killed.
- STATE: orch/integration @ e4335c4 (365/365). Last full run (274a5ef): 30/49 = 61%. Fixes merged since: A3 front door, single "open X" → planner, step order, no dropped clauses, no false Done, one browser, C3, file chains, no-name rename, Music play, folders, new window, play music, "my calendar", the no-ask rule, risky sign-up labels.
- NOT MERGED: lane/c-exec 80cfe01 (real Music search; needs Lane A's plan.test.js:208 fixture fix first).
- RESUME: (1) agent-3 plan.test.js fix → merge C 80cfe01; (2) QA music-search check reads the window text; (3) GO the 19-row rerun (~$0.30); (4) A items 4–6 (named-site search, calendar recipe, Music search+play); (5) two full runs, hidden set, Mini tab. QA ledger $0.84 of $3.00.
- For the final report, still owed: one macOS Contacts/Messages Automation grant (messaging row); rotate the tokens in Cursor's settings.json.

### Thu Nov 5 · RESUME (master prompt "make it instant, reliable, trustworthy" + Addendum A; weekly usage 1%)
- SEPARATION:
  - Dixi and optimizer-autopsy are already two repos (jaztulsi/dixi, jaztulsi/optimizer-autopsy) with separate memory dirs.
  - Cross-link removed: the global ~/.claude/settings.json attached 3 optimizer-autopsy folders to every session. They moved to optimizer-autopsy/.claude/settings.local.json (backups *.bak-separate*).
  - The name clash: two sessions were called "orchestrator". This one is renamed **dixi-orchestrator** in the registry. Dixi agents must never message bare "orchestrator".
- DONE (carried over, not rerun):
  - all merged lane work through e4335c4;
  - now also lane/a-plan e3c2d10 (contains C 80cfe01, real Music search) and lane/qa 0655903.
  - **fix/voice-speed @ ea2c661 = orch/integration.** 366/366 unit tests in 15 s; ~/dixi checkout 318/318 in 14 s.
- npm test HANG: not reproduced (no hang with the root .env present). Lane B owns finding the network/key-dependent test and making "<30 s, no network" a gate.
- OPEN:
  - Every item in the master prompt Phases 0–6 and Addendum A1–A10.
  - Old queue items that fold in:
    - A items 4–6 go into Phase 6a;
    - the A4 after-check goes into the Phase 4 verify step;
    - the Mini tab goes into the Phase 5 island/pill.
  - The QA music-search check goes into Lane B.
- FAILED BEFORE, and why:
  - The live suite was 30/49 (61%). The causes were web steps reaching the screen agent, false "Done", and QA reading the user's Chrome. All were fixed since; not live-retested.
  - The weekly budget burned on live runs. Hence the new rules: no paid-API tests, and one live check per phase at most ($0.50).
- PLAN: agent and lane mapping in BOARD §3. First step for each lane: its part of docs/DIAGNOSIS.md (≤20 tool calls). I assemble those parts into one document.

#### ASSUMPTIONS (decided, not asked)
1. "no AI look" means none of the generic AI visuals (sparkles, dot clouds, neon/purple gradients, glowing orbs). Where they differ, the user's reference images (orchestrator/ui-ref/1.png, 2.png) plus A4 tokens (black liquid glass, faint marble contours) win over the older navy look. The website's Dixi animation is ported, toned down.
2. The Phase 5 top-center island/pill replaces the earlier "Mini Dixi tab". Drag-to-corner is dropped unless it is cheap.
3. Browse agent "local" means it runs on-device and credentials never leave it. It is read-only by default with a blocked-verb list (Hedwig model, COMPETITORS.md).
4. "Lectures" depends on the source the user configures. A new chat per session uses the A8 definition.
5. The integration branch is fix/voice-speed; lane branches merge into it after cross-review (authors never review their own work).
6. Model routing: lane agents do code. Big grep, log or bench summaries go to one short-lived haiku helper.
7. Old done bar (50-command live suite ≥95%) → replaced by the master prompt §7/§9 DONE (bench numbers + tests). The live suite runs once, after Phase 1+, as the regression check within the $0.50/phase cap.

### Nov 5 · Lane C DIAG fb63b15 (docs/diagnosis/C.md)
- Blind clicks at the screenshot point (everywhere.js:557-568); type with no focus or read-back check (:596-605).
- Card still reachable at :642, :444, :1049, :1380.
- Unverified ok: open, desktop (out() never sets ok), screen step, type.
- 630 ms of fixed waits per click; full AX walks.
- CLAIM granted: everywhere.js :557-605 → dixiagent2 until its A2 commit.
- Decided: the card is removed except in careful mode. The risky refusal is kept unless the user's own words name it. Profile use is allowed and logged.

### Nov 5 · Lane B DIAG e2b4748 (docs/diagnosis/B.md)
- The TTS pause misses in-flight calls and plain 401s, and it is in-memory only. Everywhere claude() is a raw fetch with no retry. STT tries Scribe every launch before Deepgram. config.js loads the real .env in tests.
- Lane D hypotheses:
  - gray bar = an empty capture backdrop;
  - mascot clipped by bottom:-3px with overflow:hidden;
  - dashboard: suspected preload↔ipcMain channel mismatch (unconfirmed).
- B next: gate → bench → Phase 1. main.js is split: the service-routing region is B's, the hotkey region is A's (claims by line range).

### Nov 5 · Lane A DIAG 80f49ad (docs/diagnosis/A.md)
- Scribe commits a turn only after 0.9 s of silence, so the user's speech merges with Dixi's echo and the turn is dropped or the wake word is missed.
- Reconnect = the mic stops for 500 ms with no buffer.
- Everywhere has no carry and does no speculation.
- requireWakeWord defaults to true.
- CLAIMS → dixiagent3: everywhere.js :1254-1258 and app.js :38.
- Audio cache found: ~/dixi/electron/eval/audio-cache (28 free `say` WAVs).
- APPROVED: one Deepgram-only WER baseline over those clips, cap $0.10, plus one "after" run later. No paid TTS renders.
- DIAGNOSIS.md assembled @ 82a720d (fix/voice-speed = orch/integration).
- A1 claims widened for dixiagent3: everywhere.js :1185-1262, app.js :38/:110-112/:126-131 (lent from unstaffed D, released on commit), voice.js. Owner card = informational only; Esc only in-session; MIC_KEY no-op unless experimental wake word ON.
- Lane B GATE 2789c56: 367/367 in 13.9 s with .env present (was 15.1 s); no-network guard + 20 s per-test timeout. → review by dixiagent3. B starts Phase 0 bench on 82a720d, recorded-LLM cache, $0.
- Merged Lane B GATE as dba051d (cherry-pick of 2789c56): 367/367, 15 s wall. Review PASS by dixiagent3, nits → B follow-up (assert ENETUNREACH, loopback test, separate total-suite <30 s gate; A saw 32 s under load).
- Lane C A2 ladder on lane/c-exec (9f21144 + 64878dd target fix at :475/:502, approved out-of-claim). The ladder made redteam2 22.5 s > 20 s per-file timeout → C fixing waits, not timeout. Review routed to dixiagent1 once green.
- USER DIRECTIVE Nov 5: ⌥Space Mac-wide is the product, browser last; Dixi never asks ("would you like me to click"); sign-in = browser already persist:dixi-tabs; Mac-wide sign-in → BACKLOG (focus login field so macOS/Chrome AutoFill fills it; Dixi never sees the password). Sent to all 3 lanes: C = zero-questions (Phase 4 pulled forward), A = planner never asks, B = bench on ⌥Space path + questions_asked column.
- A1 DONE lane/a-plan c3aec96 + 8df02ee: idle 60 s 1.92 MB → 0 bytes, 0 sockets, mic closed; redteam2 32.6 → 12.2 s; suite 372/372 19.2 s. → review by dixiagent1. Lane D follow-ups: tray label ~everywhere.js:1397 says wake word; app.js:317 wake toggle doesn't start/stop mic.
- USER Nov 5 (2nd): no questions, max speed+accuracy, better ⌥Space UI merged with the notch ("dynamic island… Wispr Flow-like but better"). Decision: Lane D staffed by dixiagent1 after (1) bench baseline, (2) dead-service skip (Scribe at 0 credits → Deepgram direct, TTS → say; persisted, 6 h retry). D = Phase 5 island + A4/A6 tokens + tray template icon, worktree dixi-lane-d-ui lane/d-ui, reviewer dixiagent3. Phase 1 retry/fallback rest deferred until island merged. ASSUMPTION 8: "copy Wispr Flow" = functionality (a tiny always-on-top voice pill with waveform), never their visual design.
- A1 review (dixiagent1): FAIL (a) mic-denied mid-connect leaves Deepgram socket open + fallen=true → A fixes voice.js (allSettled), B fixes stt.js half. (b) ptt.end() on render-process-gone. Rest PASS. Re-review the delta only.
- A cf4fa66: planner never asks (plan.js prompt, interpret clarify ""). Decision: executor "which one?" → pick best/first, say it, "next" switches. Granted A everywhere.js :287-305 + 1 init line: pre-create overlay hidden ~2 s after launch (first ⌥Space was 200-500 ms, est.), createOverlay() reused by Lane D.
- 15:01 RESUME after usage reset (weekly 14%). Pending: C ladder a4f87ab..f3270ab (green 374/374 15.0 s), B a7bb543 stt fix + bench 95e789e..2078bb9 (BASELINE: plan p50 2 ms/p95 2064 ms; model planner p50 1409/p95 2839; say synth p50 1196; 6/21 Mac-wide commands have no code path), A1 delta da56894 (376/376).
- Reviewer rebalance (one review each): dixiagent1 → A1 delta; dixiagent2 → Lane B; dixiagent3 → Lane C ladder.
- ASSUMPTION 9: eval/out/stt-7.json (Oct 16; Flux cmd WER 61.9 %, entity err 100 %) is the WER "before"; saves the $0.10 run. "After" uses the same clips/models.
- Re-plan for "max speed": C adds code paths for the 6 no-path commands (Phase 3 item 2) after zero-questions; B does planner routing to Groq/Cerebras (Phase 3 item 3, ≤$0.10 live A/B) after the island. Rename to dixi-orchestrator did NOT persist (ListAgents still shows "orchestrator [d41708]") → NEEDS_USER #6 stands.
- Merged lane/a-plan → fix/voice-speed 86b91ca (A1 push-to-talk + planner never asks; cf4fa66 reviewed by orchestrator, 18 lines). 376/376, 13 s. orch/integration ff. Nit for A: render-process-gone guard must check win.isDestroyed().
- Lane C ladder review (dixiagent3): FAIL — left_click fails open when frontApp() errors (pid 0) → could click SecurityAgent/coreautha; SYSTEM_PROMPT refusal after yes(); re-paste edge when focus moved; dictation :1202 unchecked paste. Sent back to C, fix before zero-questions.
- Merged lane/b-speed → fix/voice-speed ef58847 (bench + gate + stt cancel fix; review dixiagent2: stt reset FAIL folded into dead registry, bench stage-marks FAIL → follow-up, not a merge blocker since the baseline measures plan() only). 378/378, 13 s. DECISION: keep the plan-stage method fixed for before/after; add timing.js marks when the bench grows execution stages. Electron no-network guard must be proven before any browser-half bench run.
- Merged lane/a-plan e99a749 → 35a1ce6 (which-one → pick first + 'the other one'; reviewed by orchestrator). 379/379, 13 s. Nit → A: choose() with exactly 1 option still calls ask(); should just take it.
- Merged lane/c-exec → 6d13a84 (A2 ladder + review fixes 846054f, delta reviewed by orchestrator). 387/387, 15 s. Nit → C: if el.pid is also 0, theirs=false → clicks with owner ''; use theirs = Boolean(el) && (!front.pid || el.pid !== front.pid).
- Merged lane/b-speed → f700813 (dead registry cbf8dbf, fallen→retryAt 95b906b, Electron guard 4b458f1; reviewed by orchestrator). 392/392, 15 s. Nit → B: stt giveUp passes only the HTTP status to deadAnswer; pass r.error text too so a "quota" message without a code is dead.
- Merged lane/a-plan → 7c8c11d (createOverlay pre-create 1be01cd + choose() 1-option fb1f775; reviewed by orchestrator). 393/393, 15 s. First ⌥Space no longer builds a window on the hotkey path (wall ms unmeasured: no live launch on the shared Mac).
- Merged lane/c-exec → 7310d9b (pid-0 fail-closed 40d11bc + Z1 verb families 73c8239; reviewed by orchestrator; new checks are assertions inside existing tests, count stays 393). 393/393, 15 s.
- Merged lane/a-plan 548b19c → d52f7e4 (deaf window: tail 1200→250 ms + afterEcho/ownWords; reviewed by orchestrator). 395/395, 15 s. RISK flagged to A: TTS is now `say` (EL dead), played by execFile outside the renderer → Chromium AEC has no reference → the 250 ms tail leans on heardSelf only. Under PTT the mic is normally closed while Dixi speaks, so the risk is limited to wake-word mode / barge-in; A to confirm and keep the long tail for `say` if not.
- Lane D: granted dixiagent1 the trayTitle() line at everywhere.js:1261 (A released the range). Dropped ew:backdrop screenshot over IPC = the gray bar root cause (DIAG B hypothesis confirmed by D).
- DECISION endpointing (A): 700 ms still-words hold on EOT/EagerEOT only; the 2nd ⌥Space press commits immediately (flush), Esc during hold cancels. Rationale: PTT press = explicit end, so no added latency on the main path; the hold stops mid-pause cut-offs ("can't hear me") when the user doesn't press.
- Merged deca784 → 838309c. My echo concern was wrong: `say -o` WAV plays through the page <audio>, so AEC has the reference; only the speechSynthesis fallback keeps 1200 ms. 396/396.
- Merged lane/c-exec Z2–Z4 → 204c658 (reviewed by orchestrator). 399/399, 17 s. Note: normal mode now sends the user's typed form profile to the screen agent for form tasks (shown masked on the card, values never logged) — the profile's stated purpose; passwords/cards never included.
- Lane D 1c9032d island renderer: tokens.css, #000 island w/ notch ears, pill fallback, 24 offscreen shots, thinking frame p50 5.4 ms, idle CPU 0.15 %. Orchestrator looked at shots: clean; fix = done-card duplicates text (island → ✓ + short title). Whole-lane review → dixiagent3. B next: planner routing A/B (plan-only, 21 cmds, ≤$0.10, command sent for go first).
- Merged lane/a-plan 02b09a1 → e901427 (endpointing; 2nd press 1538.9 → 0.1 ms; EOT hold 700 ms). 402/402, 19 s. DECISION: endSession waitMS 1500→0 risks losing the last word → A follow-up: CloseStream flush + speculate at once + commit on next Update or 250 ms.
- Lane D whole-lane review (dixiagent3): PASS (a)–(f); nits → B before merge: setIgnoreMouseEvents reset on hide/show (a stuck click-catching overlay would block the Mac), listening fade delay 0, coalesce notch reads. e3d11bc done-card fix (island text 117 → 12 chars) reviewed by orchestrator.
- Lane C Z3–Z7 approved by orchestrator; merge conflicted in redteam2.test.js vs e901427 → aborted, C resolves on its lane.
- P0 (A, from code read): Flux turn_index restarts at 0 per socket; PTT opens a new socket per session; voice.js turnsDone never cleared → from the 2nd ⌥Space session on, turns are dropped. Likely a main cause of "can't hear me" since Flux became live STT. Fix first: DeepgramBridge offsets turn_index (root, all callers) + 3-session test.
- Merged lane/c-exec (Z3–Z7 via ea088c7) → 051dc12. 405/405, 19 s.

## Nov 5 — three merges into fix/voice-speed (orch/integration = c202276)
- cb6cedc merge lane/a-plan e429a5a (P0): Flux turn_index restarts at 0 on every socket and turnsDone was never cleared, so from the 2nd ⌥Space session on, speech was dropped as an already-handled turn. It now keeps rising across sessions and the Scribe↔Flux switch (turns.test: 0,0,0 → 0,1,2; all 3 commands run). 407/407, 20 s.
- 6943fdb merge lane/c-exec fdf389a (Z8): a static no-ask test. Explicit careful guards on the agent loop and the calendar day question; dead approve dep dropped (desktop.js has 0 reads). 409/409, 21 s.
- c202276 merge lane/d-ui (A4 island, nits done): click-through reset on every show and hide (test fails without it); "Listening…" fully shown p50 172.5 → 72.7 ms; notch reads coalesced (readScreens never rejects, so busy can't stick). 413/413, 22 s.
- DECISION (Lane C Phase 3 item 2): "couldn't find that on this page" = the user reporting a failure, not a command. It runs code only, with no model call: stop what's running, say "Okay, I stopped.", log it (the same family as the protest stop in 59e8626). Approved as proposed.
- Gate watch: 16 → 22 s over the last 4 merges. Still under 30 s; at 25 s, ask the slowest file's owner to trim.
- 8035adc merge lane/a-plan b853641 (press-flush): the second ⌥Space sends CloseStream; it commits on the next Update/EndOfTurn, the socket close, or 250 ms. Last word 200 ms late: kept 20/20 (was dropped), p50 202 ms. Flux silent costs ≤250 ms, but speculation starts at the press. 416/416, 21 s. ASSUMPTION 10: a ≤250 ms commit wait on the 2nd press is worth it for "hears me every time" (the planner overlaps it). Revisit if the bench shows press→first action > 1 s.
- 5afe82d merge lane/a-plan 413b9cd (reconnect + replay): a dropped Flux socket reconnects at 0/300/1000 ms and replays a ≤6 s / 192 KB ring. The mic stays open; the open turn keeps its number; finished turns are trimmed at EndOfTurn. 419/419, 19 s. Follow-ups sent to A:
  (a) no handshakeTimeout on the WebSocket, so a black-holed network can hang "Reconnecting…" (pre-existing on open(); reconnect makes it likelier);
  (b) narrow edge: voice commits a turn by hold/press before Flux's EndOfTurn, then a drop puts the replay plus new speech under the done number, and the new words are lost. Lane D to-do: show voice.reconnecting on the island.
- GO (Phase 3's one live run): B's planner A/B, `node eval/plan-ab.mjs --cap 0.10` in dixi-lane-b-speed. Plan-only, 21 bench commands, ≤45 calls, context {} (no profile, no screen; only command text plus fixture app names go to Groq/Cerebras). Script reviewed: budget() blocks any call at or over the cap; keys are never printed.
- 5aa6516 merge lane/c-exec ea47274, 8112fa5, 1161fa9 (Phase 3 item 2, 3 of 6): switch to/go back to/bring up <installed app>, "type X" literal (via typeText: secret-box, terminal line-break and read-back checks kept), "find my <name>" (NAMED skips phone/keys/way…). Bench misses 6 → 3, code 6 → 9, $0. 420/420, 19 s. Known ceiling: "find my dog" becomes a file search (Dixi says what it did; NAMED grows when needed).
- LIVE (Phase 3's one run): B's planner A/B, 45 calls, $0.0093. Haiku p50 1403 / p95 3760 (cold first call); Groq→Haiku 885 / 2013, 11/15 same shape, 3 kept plans worse (music:// form, AppleScript to WhatsApp, a screen question answered without the screen); Cerebras→Haiku 1017 / 2183, 6× 429, 2 wrong plans. HYPOTHESIS "a fast open model can plan as well as Haiku": KILLED as-is (accuracy).
- 378b70b merge lane/b-planner (fast try OFF by default; deadAnswer nit; recordings in test/fixtures/plan-fast.json). 422/422, 18 s.
- DECISION (B next, $0, offline): no more live runs this phase.
  1. Race, not try-then-fall-back: start Groq and Haiku together; take Groq's plan only if it passes the gate, else Haiku's when it lands. The tail is never worse than Haiku alone; the extra cost is Groq's cheap tokens.
  2. A generic gate, no phrase rules: (a) every app is an exact installed name; (b) only https links and known step kinds, so any script or custom URL scheme step goes to Haiku; (c) a clause that points at the screen (this/that/here/screen/selected) gets no world answer.
  3. Drop Cerebras (429s). Flip DIXI_PLAN_FAST on only if the gate keeps 0 worse plans on the recordings and p50 still wins; re-score $0. The overfitting risk is accepted because the rules are generic validators, not phrase rules.

## Nov 6 — SOLO MODE (user: "you are on your own, u made my mac hella slow… you do not get the agents help")
- dixiagent1/2/3 are closed (pids gone). The orchestrator now writes the code itself on fix/voice-speed in dixi-integration. No subagents, no lane agents. One npm test per commit; nothing left running.
- 5afe82d→afccec4 merge lane/a-plan 0ddf5fa + af00790 (2.5 s handshake timeout; the local TurnDone control). 424/424, 19 s.
- Left in the worktrees: lane/c-exec has 2 committed commits not yet reviewed (aae79a3 what's on my screen, 4bb2b81 open Notes + ⌘N) plus WIP (the A3 stop line). lane/b-planner has WIP (race + gate, plan-rescore.mjs). Lane A barge-in not started.
- 66dcfc6 (solo) "couldn't find that on this page" → stop + say + log, no model (dixiagent2's WIP, finished with tests); "open Notes … type" tied to Notes only when nothing came between. Bench $0: no-code-path 6 → 0; by code 6 → 13 of 21; Haiku 15 → 8; plan p50 0 / p95 2063. 427/427, 19 s.
- KILLED: the Groq ∥ Haiku race (B's WIP). Offline re-score ($0, recorded replies) with the generic gate kept 1 of 15 (buy a bagel, 1914 → 593 ms); the tail is unchanged at 3760. Now that code plans 13 of 21, the 8 left are mostly scripts, which the gate sends to Haiku anyway. One win doesn't justify a second provider seeing every command plus the race code. The fast try stays merged and OFF (378b70b). Next speed lever for the multi-step tail: Haiku streaming plus the first step starting early (already there), so look at the prompt size instead.

## f49045e — barge-in (MASTER Phase 2), solo
- StartOfTurn while speaking → speaker.pause(); echo / EndOfTurn / 600 ms silence → resume; 2+ real words → stop. Hush <1 ms after the event (fake audio).
- DECISION: ⌥Space pressed while Dixi talks stays "stop only" (redteam2: "⌥Space is the one stop button"). Talking over Dixi is the hush-and-listen path. Corrects my earlier user line that the press would also listen.
- ASSUMPTION 11: 600 ms hush window; a stray echo-triggered StartOfTurn costs at most a 600 ms pause.

## f09b036, d1c8ea9 — A3 snapping + app keyterms (solo)
- f09b036 soundsLike(): misheard app names → the one installed app (0/7 → 7/7 by code). Bench unchanged (p50 0 / p95 2066).
- d1c8ea9 installed apps (/Applications, ~/Applications; 34 here) → Flux keyterms in ⌥Space sessions.
- GO (Phase 2's one live run = the pre-approved A3 "after" WER): `node eval/audio.js --seed 7 --n 4 --providers flux --keyterms`, Deepgram Flux only, the same 28 cached `say` clips as stt-7 (119 s audio max ≈ $0.015, cap $0.10). Natural control: 2 entities in the keyterm list (Faistnuk, Gyckbrum), 2 not (Caishoux, Caishex Travel).
- RESULT (A3 after, ~$0.015, 169 s): Flux cmd WER 61.9 % → 42.9 %, entity err 100 % → 50 %; clean 19.0 %, babble 66.7 %; wake FA 0/4 FR 0/4. CONFIRMED: keyterms help names Dixi knows (Gyckbrum, Caishex Travel). Faistnuk still missed; an unlisted name drifts to a listed one. docs/DIAGNOSIS.md. No more live runs this phase.

- e4ebd3a dashboard (A8/A7): eval/dash-clicks.mjs, real window + IPC, offscreen: 26/26 controls make their dash:* call. Copy now leads with ⌥Space; the wake word is labelled experimental. The mascot in the sidebar and toast isn't clipped (docs/ui/dashboard-*.png). (Superseded by e3302d2: the dashboard is now black, per A4.)

- e3302d2 A4/A5 dashboard: black tokens over procedural contour SVGs (eval/contours.mjs, 3 seeds, static, no motion → idle cost unchanged: no animation, no live noise). 26/26 controls still work. ASSUMPTION 12: contour-2/3 are for onboarding and the website (A10 lane); not wired yet.

## e4491ea fix(onboarding): A4 look, whole mascot (A7)
- Cause: welcome.html relied on the old overlay.css (glass/vars), no tokens.css, no mascot CSS; `.buddy .mascot` never matched → Times, black text, giant cropped mascot.
- Fix: ui/mascot.css (shared via @import in styles.css), self-contained welcome.css over contour-2.svg, black window (no vibrancy), ⌥Space copy.
- Proof: docs/ui/welcome-{mic,ax,try}.png via eval/welcome-shots.mjs (offscreen). Tests 431/431, dash clicks 26/26.

## 02d39e9 feat(ui): profile window A4 black look (tokens, contour-2, no vibrancy). docs/ui/profile.png.
## (no-offer) fix(everywhere): talk() no longer ends with "Say 'Dixi, do it' and I'll do it" (a question in disguise); skill-saved line no longer promises asking.
## perf(everywhere): ⌥Space on the browser's clock (user, Nov 6: "use the same exact technology as the browser version", "instant before I'm done saying it")
- voice.js ewProgress: specMS 250 → main head start (plan only), settleMS 550 → send whole commands; questions/half sentences/buys/unknown sites wait for end; growth sent as remainder; never twice; cancel clears.
- main: headStart/adopt (exact-words match, else dropped); second ⌥Space in an open session = finish (was: kill if busy, which would kill the pause-sent run).
- Bench (offline, recorded Haiku): planner-routed 1.2–2.9 s plan now overlaps speech. Live gain unmeasured (no live run left this phase).
- ASSUMPTION 13: acting at a 550 ms pause on Mac-wide (as the browser does) is wanted; a long mid-sentence pause can send the first half early (then the rest is appended, never dropped).
- Note: tests 425/426 once under load avg 57 (not Dixi); flaky files pass alone.

## 564d3de feat(island): Wispr Flow–style pill at the bottom, live voice waveform (user Nov 6: "improve ui to match whisper flows")
- The island is now a small black pill bottom-center above the Dock (ew:dock = the Dock's height from workArea); 15-bar waveform driven by ew:level (newest in the middle, ripples out); live words' tail only; green check on done.
- Notch/top placement kept: menu "Show Dixi at the top (in the notch)" (prefs.islandTop).
- Proof: docs/ui/island-pill-{light,dark}-*.png, island-notch-dark-*.png (21 shots, eval/island-shots.mjs, offscreen). Thinking first frame p50 5.5 ms; idle CPU 0.04 % (was 0.15).
- ASSUMPTION 14: the bottom Flow pill is the default; the notch is a menu option.

## 256eb79 perf(everywhere): everyday keys, web searches, folders plan instantly — no AI
- desktop.js: KEY_SAID (close tab, scroll, back, zoom, copy/paste, save, next tab, full screen…) + search (Google/YouTube/Amazon/Wikipedia/Maps/directions) + open folder + mkdir as code rules. Keys go through appKey → keysBlocked (never terminals/editors/Dixi); refusal → ok:false "I didn't press anything".
- Bench (offline): "make a new folder on my desktop called homework" 1243 ms → 0 ms; planner calls 8 → 7 of 21. Tests 433/433, 19 s.
- ASSUMPTION 15: a key-press command is silent (no "Done."), the pill shows ⌘W etc. for 1.2 s.

## (reminders) perf(everywhere): spoken reminders by code
- spokenReminder (calendar.js) + desktop 'remind' verb → Reminders via the existing JXA createArgs; undo via removeFromCalendar.
- Bench: "remind me to call the dentist tomorrow at 9" 1412 → 1 ms; planner 7 → 6 of 21. Tests 434/434.
- ASSUMPTION 16: a weekday means its next one (today's weekday = next week); "tonight" with no time = 8 PM, morning 9 AM, afternoon 3 PM; bare "at 9" = 9 AM, "at 3" = 3 PM (same rule as the screen path). Careful mode does not read back first on this path (Undo instead).

## (chatter) fix(everywhere): less confused — from the real activity log (~/Library/Application Support/Dixi/activity.jsonl, read-only)
- Root cause of "confused": modeOf() sends any unknown line to the screen agent; filler/chatter in an awake window became key presses (log: "Come on, Dixi. You got this." → pressed keys on Canvas).
- chatter() gate in voice.js (after PROTEST) and main run() (before abort): 7/33 logged runs now ignored. Insults join PROTEST (stop). Spoken-number math + "X out of Y" percent in quick.js. keyRisk: Enter safe in Calculator etc. (front app at key time).
- Tests 435/435.
- ASSUMPTION 17: filler while Dixi works is ignored, never a stop; "thanks"/"okay"/"yes" alone outside a question get no reply.

## a99f5ec / ea748e9 fix(security)+feat(ui): hold ⌃ to talk; island always on screen; dashboard rebuilt (user Nov 5)
- ASSUMPTION 18: always-listening and the "hey Dixi" wake word are removed (the user's call): the mic opens only while Control is held alone ≥ 200 ms; ⌃+another key/click is a shortcut and cancels; letting go sends.
- ASSUMPTION 19: ⌥Space = instant stop of everything (task, Claude team, voice), never a mic toggle.
- ASSUMPTION 20: the island is always on screen as a small idle pill bottom-center above the Dock; clicking it opens the dashboard. Your words show under the pill, never the word "Listening".
- ASSUMPTION 21: requests typed in the dashboard's box go through the same run() as voice.

## 5d98a2e fix(clipboard): Electron 44's clipboard is async
- Root cause (live): clipboard.readImage is not a function in Electron 44.7.2 (API is now read()/write() of ClipboardItems, readText/writeText async). Every selection grab threw (swallowed → "Nothing was selected"; ⌥⇧Space dead); every Dixi paste left the typed text on the clipboard (the restore compared a Promise to a string).
- Fix: snapshot every format via read()+getType, restore via write([new ClipboardItem]); raw macOS types via "electron application/osclipboard;format=…". Probe in real Electron: restore gives back the original text. Tests 438/438.
- Note: the earlier live typing tests hit this bug and replaced the user's clipboard text with a test question; it can't be recovered.

## 3759415 fix(island): stale idle timer
- A done card's "back to idle" timer survived into the next run (the island never re-shows now), so it went idle mid-task. Live: idle at 0.8 s → none.

## cb98fae feat(everywhere): "ask Gemini …", "paste this into ChatGPT"
- chatIntent (desktop.js): ask/open-and-ask/paste-into for Gemini, ChatGPT, Claude (claude.ai/new), Perplexity; the selection, select-all or clipboard; "and ask it to …" prefixes the text. No planner. quickIntent skips anything naming those chats.
- Live (Chrome, new tab): "ask gemini what the capital of australia is" before: Web answer 1.0 s, Gemini never asked → after: sent to Gemini, done 2.3–2.8 s.
- ASSUMPTION 22: "ask Claude …" uses claude.ai in the browser (a new chat), not the Claude app (typing into the app could continue an old conversation).
- ASSUMPTION 23: live key-press tests run only when the Mac has been idle (HID idle), the target is a scratch TextEdit file Dixi checks is in front, and new tabs only. The user was playing Roblox at 0 s idle, so they were paused.

## 2026-11-05 wrap-up
- Check-in: no dixiagent1/2/3 exist (solo directive); nothing to merge; orch/integration = cb98fae; weekly usage 37% (< 98%).
- ASSUMPTION 24: the final key-press live test ("select everything and paste into Gemini") was skipped — the Mac went idle for 121 s, then the user came back (HID idle 1–7 s) before keys were sent. No keys were sent; clipboard verified unchanged. NEEDS_USER #12 covers trying it by hand.
- Dixi relaunched without the debug port.

- User asked "push commit kill dixi": code already committed (cb98fae); pushed fix/voice-speed to origin (new branch, upstream set; no force, main untouched); Dixi stopped. orchestrator/ notes left uncommitted in ~/dixi.

## Nov 6 · RESUME under MASTER v2 + ADDENDUM B (solo, fix/voice-speed in dixi-integration)
- DONE before v2 (kept, not rerun): npm test gate (16.9 s, 438), bench ($0, 21 cmds: plan p50 0 / p95 2067, code 15/21), dead registry, deaf tail 1200→250, barge-in, endpointing + press-flush, reconnect+replay, A3 keyterms (WER 61.9→42.9 %), zero-questions, island pill, tokens, dashboard 26/26, chatIntent (Gemini/ChatGPT).
- OPEN vs v2: hotkey was hold-⌃ (v2: ⌥Space toggle); "fetch failed" unfixed (DIAGNOSIS 4 specced only); send/pay/delete didn't stop one step before; B1 context cache, B3 hit-rate, B4 registry, B2 real-time lane, agents tab, website.
- FAILED-and-why: Groq∥Haiku race killed (1/15 kept); Cerebras 429s.
- 591d20c ⌥Space = talk, again = send, Esc cancels; hold-⌃ opt-in (its 30 Hz osascript poll off at idle). 438/438.
- ebcbafe claude() retries one TypeError on a fresh socket; plainError line; prewarm() at hotkey-down. Test fails w/o fix. 439/439.
- 05b2935 heldBack(): Send / Place order / Empty Trash left ready unless Settings allows; send-scripts go via screen steps. 441/441; dash 30/30.
- ASSUMPTION 25: v2 wins over ASSUMPTION 18/19 (hold-⌃ / ⌥Space-stop). ⌘⇧Esc and the menu stay the hard stop; ⌥Space mid-task listens, never kills.
- ASSUMPTION 26: moving to the Trash (undo exists) is not "delete data"; only Empty Trash / erase / delete permanently / Delete <X> buttons are held.
- ASSUMPTION 27: "text my mom" with sending off = Messages composed on screen, stopped before Send (scripts with `send` are not run).

## Nov 6 · CHECKPOINT (Addendum B, "prove the state") — HEAD 05b2935, fix/voice-speed
Raw output: orchestrator/cp-test.txt, orchestrator/cp-bench.txt. B1 WIP (adapters.js, Gemini same-site) stashed first (`git stash list`: "B1 wip …"), so these numbers are HEAD's alone. The WIP had 25 failing tests; HEAD has 0.

### 1. Raw results
- `git log --oneline main..HEAD`: 245 commits. The last 3, made under v2: 05b2935 (Phase 4 send/pay/delete held: 441/441, dash 30/30), ebcbafe ('fetch failed' retry: the test fails without the fix, 439/439), 591d20c (⌥Space = talk/send/Esc). Earlier deltas are in each commit message (e.g. e901427 2nd ⌥Space commit 1538.9 → 0.1 ms p50; cfb66d6 island 173 → 73 ms).
- `npm test`: **441 pass / 0 fail, 20.7 s wall** (gate limit 30 s).
- `npm run bench` ($0, recorded, no network):
  | stage (ms) | n | p50 | p95 |
  |---|---|---|---|
  | interpret→plan ready (all) | 21 | 1 | 2069 |
  | of which provider (recorded Haiku) | 6 | 1560 | 2839 |
  | of which Dixi code | 21 | 1 | 29 |
  | reply: local `say` synth | 21 | 1365 (rerun 1356) | 1414 |
  | browser mode | 0 | – | – (frozen; no recorded LLM cache) |
  Providers: 15/21 by code (no LLM), 6/21 anthropic:claude-haiku-5-5 (recorded). TTS = macOS `say` for every request (ElevenLabs dead, 0 credits). 0 cache misses.
  `say` p50 is 1365 ms now against 740 at 18:13 with the same code. A bare `say -o x.aiff "Opened Notes."` outside Dixi takes 1.43–1.57 s right now (load avg 7.9; WindowServer 33 %, a second Dixi 25–50 %). So: machine load, not a Dixi regression. Re-bench on a quiet machine.

### 2. Phases
- **P0 DONE**: docs/DIAGNOSIS.md + bench/out/2026-11-06T03-45-20-644Z.json baseline (plan p50 0 / p95 2067, say 732).
- **P1 PARTIAL**: dead registry (stt tests 365/369: EL out of credit → Deepgram, 0 EL round trips after relaunch); fetch timeouts; 'fetch failed' fixed (ebcbafe). MISSING: an end-to-end no-keys run and an EL-at-0 run test asserting no visible error.
- **P2 DONE**: ⌥Space push-to-talk (test 306), Esc cancels (265/267), 60 s silence end (266), mic-closed idle (263), barge-in (122), WER 61.9 % → 42.9 % (−30.7 % relative, ≥30 % target; DIAGNOSIS.md:90).
- **P3 PARTIAL**: 15/21 bench commands by code (71 %, but that's the bench, not the B3 hit rate from real use). MISSING: context engine (B1, stashed WIP), B3 hit-rate measurement, ack ≤200 ms number, Gemini no-click test (stashed).
- **P4 PARTIAL**: no question reachable in normal mode (static tests 231/232); send/pay/delete stop before (05b2935 tests). MISSING: a dynamic 20-command run asserting 0 cards + one verified result line each.
- **P5 PARTIAL**: dashboard + island built; eval/dash-clicks.mjs clicks every control (30/30), BUT against a recording stub api, not real main-process state → NOT DONE by checkpoint rule. Idle CPU regression found (below).

### 3. Specific checks
- mic-closed idle 60 s: EXISTS, PASSES — `ok 263 - A1: idle 60 s with fake audio: 0 bytes sent, no socket, no capture device`.
- three known-bad phrases: they pass, but NOT in interpret.test.js: lo-fi → desktop.test (ok 98), bagel/Safeway → plan.test:131-136/212, "couldn't find that on this page" → everywhere.test (ok 146). interpret.js is the frozen browser path.
- zero approval cards in a 20-command run: NOT TESTED dynamically. The static proof is 231/232; the bench "may ask" column = 1 (the bagel web step, gated behind careful mode).
- ElevenLabs-at-0 / no-keys runs: STT side tested (365/369); a full no-keys run: NO TEST.
- dashboard real-state click test: NO (stub api).

### 4. Built out of order (design before P1–4): measured
- Bench p50/p95: unchanged (plan 1/2069 vs 0/2067 baseline; code stages 1/29). No effect.
- **Idle CPU, made worse.** HEAD launched with a temp userData and unused keys, measured with top at 10 s samples:
  - dashboard open: 16.5–18 %;
  - dashboard closed, hidden main window still blinking: 5.3 %;
  - all CSS animations paused: 2.0 %.
  Cause: the hidden main window (index.html, backgroundThrottling:false) reports `visible`, runs rAF at 61/s, and keeps the mascot's infinite SVG `blink` compositing forever (+3.3 %). The open dashboard runs the same blink plus more (+~12 %).
  The user's running build (~/dixi, feat/where-dixi-is-going 0fff895) idles at 50.4–51.9 %.
  → FIX FIRST: pause animations in any window that is hidden or not focused.

### 5. Resume order
- ASSUMPTION 28: the checkpoint fix (idle CPU) first. Then the user's live request ("the UI with the guy like the Wispr Flow one": the bottom pill with the mascot) as Phase 5 work, since it's the user's most recent word. Then v2 order from P1 (no-keys / EL-at-0 tests) → P3 (pop the B1 stash) → P4 20-command run → P5 real-state dash test.

### Checkpoint follow-up (Nov 6, same session)
- 7182f83 perf(idle): still.js pauses CSS animations in hidden/minimized/background windows (the island is never focusable, so untouched). Dashboard closed: 5.3 % → 2.5 %. Test: still.test.js (3). 444/444, 17.8 s.
- 7c92864 perf(idle): the mascot's idle glances only run while its window has focus. Background dashboard 11 % → 0.3 %. 444/444, 16.5 s.
- Real instance (HEAD, your real userData, dashboard open behind Claude): **0.2–0.55 % idle** (cputime delta, 2×20 s), against 50.4–51.9 % for the old feat/where-dixi-is-going build it replaced. No sockets open at idle (lsof: 0 for every Dixi pid).
  One earlier real-instance run read 8–12 % with the cursor still. It did not come back after the restart. Pages showed 1 ms of JS per 10 s (CDP Performance), so the cost was GPU/compositor. OPEN: recheck after an hour of real use.
- USER (mid-run): "i want the ui with the guy like the Wispr Flow one". HEAD already has it: the bottom pill with the mascot + live waveform (564d3de; docs/ui/island-pill-*.png). The user was running the old branch in ~/dixi. Replaced it: quit the old Dixi (pid 46825), now running HEAD from ~/dixi-integration with the real userData (⌥Space registered, no warnings). ~/dixi's branch is untouched.
- ASSUMPTION 29: swapping the running app is the "run it" the user meant (memory: run = Electron). ~/dixi stays on feat/where-dixi-is-going. To keep the new UI after a reboot, launch from ~/dixi-integration (NEEDS_USER).
- NEXT (v2 order): P1 no-keys + EL-at-0 run tests → pop the B1 stash (25 failing tests to fix) → B3 hit rate → P4 20-command run → P5 dashboard real-state click test.
