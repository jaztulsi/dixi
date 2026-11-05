# Lane C diagnosis (Nov 5, base ea2c661; paths under electron/src/main unless given)
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
