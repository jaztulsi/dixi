# Dixi idea bucket: Claude Dixi Council, 2026-10-29

Sources:
- research/market-mac-agents.md (market agent)
- research/demand.md (analyst agent)
- research/hackathons-yc.md (scout, partial)
- plan/MASTER_PLAN.md §11a (37 repos)
- the founder's requests

Council: dixi-aa (lead, builds Everywhere) and dixi-5b (safety, red-team).

The rule we used: everything goes in. The council builds each idea unless it is unsafe, illegal or already done.

The selling line:
> **Dixi is the only voice assistant that sees your screen, points, and clicks in any Mac app, and asks before anything risky. That check is written in code, not left to the AI.**

The market agent backs this up:
- No one sells hands-free, any-app action with a code-enforced yes.
- Clicky only points.
- Gemini for Mac doesn't act.
- Claude and ChatGPT computer use leave the "ask first" decision to the model, and they're typed, slow, and on paid tiers.

## Done (built today, in the app now)
| Idea | Why (evidence) | Where |
|---|---|---|
| ⌥Space or "Dixi, …" in any app: one screenshot, an answer out loud, rings on the screen | "Where do I click?" has no product (demand §1g); Clicky and Holmes are unfunded | `main/everywhere.js`, overlay |
| Agent mode clicks and types in any app; a code gate asks before send, pay, buy, delete or Enter | Whitespace #1 (market) | `everywhere.js` `clickRisk`/`keyRisk` |
| It acts by default; it only explains when asked "what / show me how" | Founder: "do it, don't tell me" | `modeOf` |
| "Do it" after an explanation | Founder | `run()` |
| The agent asks follow-up questions out loud | Perplexity "won't ask follow-ups" (market) | `askUser` |
| "Ask me before every step" (careful mode), as a voice command and a menu toggle | Pew: 61% want more control (demand §2) | `prefs.careful` |
| "Take dictation": your words cleaned up and typed in any app | Wispr Flow ($2B), Gemini Fn dictation | `typeOut` |
| "Remember this", "Where was I?", "Take me back" | Moving info between apps costs 1.5–9 h/week, and nobody covers it end to end (demand §1g) | `remember`/`recall`/`back` |
| "Where am I, what can I do, what next" | A blind users' quote (demand §3) | talk prompt |
| ⌘⌥Space turns the microphone off and on; ⌥Space asks just once | Founder: privacy. Always-on capture is in retreat (Rewind, Granola, Wispr backlash) | `setListening` |
| A one-click kill switch (the menu bar shows "■ Stop Dixi") | Founder | `kill()` |
| Echo-loop fix: Dixi never acts on its own voice | Founder bug report | `voice.js` `heardSelf` |
| "Stop and listen" for long requests; the long ones are offered to your Claude team | Founder | `voice.js` `dictate` |
| Claude Code team (hive) whose workers can start subagents | Founder; TreeHacks Hive | `hive.js` |
| A mascot in a liquid-glass overlay that talks while Dixi speaks | Founder | overlay |

## Build now: one builder agent per section, each in its own new files
| # | Section | Ideas inside | Evidence | Builder |
|---|---|---|---|---|
| S1 | **Skills: do it once, then instant** | "Dixi, save that as a skill": a run that worked replays with no AI, checking each click against the Accessibility label first; "Dixi, morning routine" plays a JSON playbook; heals one step when a label moved; stops after 2 failures. Ideas from Holmes Playbooks, Stagehand, browser-use and BrowserOS | Every competitor runs a model on every step: slow, plus credit pricing (market whitespace #5) | `main/skills.js` |
| S2 | **Guardian: a scam shield on every screen Dixi reads** | Look-alike domains; tech-support popups ("call this number"); gift-card, crypto and wire demands; remote-access apps (AnyDesk, TeamViewer…) in front; a 15-minute cooling-off; a calm spoken warning. Policy table checked in code (Progent idea) | Elder fraud $7.7B; detectors fail (buried-injections); DECEPTICON | `main/guardian.js` |
| S3 | **Memory with receipts + a typed profile for forms** | Facts you said ("I wear size 10"), each with the sentence it came from, kept locally in SQLite FTS5. "What do you remember about me", "forget that". Profile (name, address, phone, email) is typed once and never taken from speech; used to fill forms after a read-back | Forms and admin: 11 h/week, and no one does arbitrary forms (demand §1g); Siri "loses track" (market) | `main/memory.js`, `renderer/everywhere/profile.*` |
| S4 | **Daily brief** | "Dixi, what's my day?": Calendar, Reminders and unread Mail counts through AppleScript, spoken in 20 seconds; "what's next?" | Time lost re-orienting (HBR: about 4 h/week) | `main/brief.js` |
| S5 | **First run + accessibility polish** | A welcome window that walks through the permissions out loud (Screen Recording, Accessibility, Microphone) with live checkmarks; earcons (sounds that can be turned off); VoiceOver-friendly overlay (aria-live, focus); large-text and high-contrast settings | Holmes's weakest point is onboarding; Be My Eyes for Mac only describes the screen; blind users need the yes on a key, not only a click | `renderer/everywhere/welcome.*`, overlay |
| S6 | **Claude Code ↔ Dixi bridge** | A local MCP server so Claude Code can `say` (speak to you), `ask` (a spoken question, your spoken answer) and `notify` ("your build finished"); token-protected, local only; plus a "tell me when Claude Code is done" hook recipe | Founder: "connect your Claude Code". ChatGPT Voice drives Codex by voice; nobody does it for Claude Code (market) | `main/bridge.js`, `bin/dixi-mcp.mjs` |
| S7 | **Small wins (lead does these)** | "Undo that" (⌘Z); answers in the language you spoke; route simple questions to Haiku for speed; a "change shortcut" note for clashes with Gemini's Option+Space | Market: slow agents; Gemini uses ⌥Space | `everywhere.js` |
| S8 | **Red-team + echo regression test (dixi-5b)** | Gate gaps, AppleScript injection, IPC, privacy, self-confirm by echo | Council | `test/unit/echo.test.js`, findings |

## Later (council decision, with the reason)
| Idea | Why not now |
|---|---|
| Send Dixi a task from your phone (Claude Dispatch, FaceTimeOS, a hackathon winner) | Remote control of a Mac is a scam vector for older users. It needs signed pairing and on-device approval, so it comes after S2 (Guardian) |
| Proactive watching (Littlebird, Holmes TriggerBrain) | The founder chose privacy: one picture, only when called. Market: always-on capture is in retreat |
| A local wake word (openWakeWord) | New dependency, and the model's license needs checking. The ⌘⌥Space mic switch covers privacy now |
| Drop the built-in browser | Founder: keep it for now. The market says a voice browser isn't whitespace (Comet, Atlas, Chrome auto browse) |
| Caregiver approve/deny from a phone | M7. Needs abuse protections (red team #10) |
| Meeting notes / captions | Crowded (Granola $1.5B, Otter, Zoom) |
| Scheduled autonomous tasks ("every Monday…") | The Rule of Two: unattended action plus private data. After Skills prove themselves |

## Rejected
| Idea | Why |
|---|---|
| Copying Holmes, VisionOS or GPL/AGPL code | License. Ideas only, credited in ATTRIBUTIONS.md |
| An "undetectable" overlay (Cluely) | Deception; a trust and legal risk |
| Auto-approving after a timeout (screen-voice-agent) | Unsafe. Silence means no |
