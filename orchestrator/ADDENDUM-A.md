# ADDENDUM A: new requirements (append to the master prompt; where they conflict with it, THIS wins)

## A0. PRIORITY ORDER (updated)
1. SPEED. Number one, always. Nothing below may add latency to the voice loop.
2. Mic closed unless I press Option+Space (A1). Cheap, fixes credit burn and mishearing.
3. Click and focus reliability (A2). It gets stuck and clicks random places.
4. Accuracy (A3).
5. Design system + dashboard rebuild + overlay/island + mascot fix (A4-A7).
6. Agents tab (A8).
7. Website declutter (A9).
Deep analysis comes first: before touching anything, write docs/DIAGNOSIS.md that covers EVERY symptom I have reported in this whole prompt (slow at every stage, deaf after Dixi speaks, wrong words, nothing shows up, cut off mid-sentence, approval card nagging, fallback and quota failures, dashboard buttons dead, random clicks, gray bar, clipped mascot). For each: evidence from code or logs, root cause, fix, how it will be verified. Keep it under 2 pages. Don't spend more than 20 tool calls on it.

## A1. PUSH-TO-TALK ONLY: THE MIC IS CLOSED UNLESS I PRESS OPTION+SPACE
- No always-listening. No wake word by default. Remove "Hey Dixi" as a trigger (keep the code behind a setting that defaults OFF and is clearly labeled experimental).
- Idle state means: no open mic stream, no audio sent to any STT service, no open STT websocket (zero billable audio). Prove it: a test that idles for 60 s with fake audio and asserts no bytes were sent and no capture device is open. Also verify macOS shows no orange mic indicator while idle.
- Option+Space: press once to start a session (open mic, open STT, show listening), press again to finish and send. Esc cancels. Add a hard safety timeout (default 60 s of silence ends the session) and a max session length so a forgotten session cannot keep streaming.
- Pre-warm without recording: keep the STT connection warm only while a session is active or within about 2 s of hotkey-down. Open the mic on key-down so the first word isn't clipped. Nothing is recorded or uploaded before the key press.
- Dixi's own speech never needs a wake word. Strip an optional leading "Dixi" or "Dixie" from a command if I say it (accept the spellings Dixi, Dixie, Dixy), but never require it.
- Show clear state: tray icon and island show "listening" ONLY while the mic is open.

## A2. CLICK AND FOCUS RELIABILITY (the "pasting into Gemini" bug)
Symptom: asked to paste into Gemini, it could not find the search bar, moved the cursor and clicked random positions, even when the cursor was already in the search bar and it didn't know.
Root cause hypothesis: it acts blind (screenshot or coordinates) and doesn't check what is focused. Verify, then fix with this ladder, cheapest first:
1. Ask the OS what has focus: read the system-wide focused element via Accessibility (AXFocusedUIElement: role, subrole, value, editable). If the focused element is already an editable text field/area, act directly (paste or type) with NO click.
2. Find the target by accessibility, not pixels: search the front window's AX tree by role and label (AXTextField, AXTextArea, AXSearchField; labels such as "Search", "Ask", "Message", "Enter a prompt"). Use the element's frame to focus it with AXPress/AXFocused set, or a single click at the center of its verified frame.
3. Chrome, Electron and web apps expose their AX tree only if accessibility is enabled for them (AXManualAccessibility / AXEnhancedUserInterface, or Chrome's accessibility flag). Detect that case and turn it on for the target app instead of guessing.
4. Keyboard first when it exists: Cmd+L for the address bar, "/" or Cmd+K for site search where the site documents it, Tab order from a known anchor. Keep a small per-site table (Gemini, ChatGPT, Claude, YouTube, Google, LinkedIn, Gmail, Notion, Slack) and let it learn: when a fast path works, store it.
5. Vision locate (on-device OCR first, then a vision model) only as the last resort, and only on the front window, never on the whole screen.
Hard rules for any click:
- Every click needs a target with a verified on-screen frame. No blind coordinate clicks. Never click outside the front window.
- After every focus/click/paste, VERIFY: focused element changed to the expected one, or the pasted text now appears in the field's AXValue. If verification fails, retry once with the next method on the ladder, then STOP and report one clear line ("Couldn't find the Gemini input"). Max 2 attempts per step. No cursor wandering.
- Pointer movement is only for the final click, never for exploring.
- Add regression tests with a local fake text-field app or fixture window for: already-focused field (must not click), field not focused, no AX tree, field in a web view, paste verify.

## A3. ACCURACY (hearing and understanding)
- Even with API keys working, it mishears about half the time. Measure first: use the eval audio set (eval/audio-cache, score.js) to get word error rate per STT provider and per condition (quiet, noise, AirPods, built-in mic, fast speech). Log in docs/DIAGNOSIS.md.
- Vocabulary boosting: pass product and command words (Dixi, YouTube, LinkedIn, Gemini, Kai, my app names, names from my contacts if indexed) as keyterms/keywords to the STT provider if it supports them (verify in its docs, don't guess parameters).
- Post-process transcripts: phonetic and edit-distance snapping to known app names, site names, my command names (interpret.js has helpers: closeSpelling, skeleton, normName), numerals and units.
- Endpointing: tune so I am not cut off mid-sentence; use the provider's end-of-turn signal plus a short grace period; never end a session on a mid-sentence pause under about 700 ms.
- Audio quality: 16 kHz mono PCM, AudioWorklet, echoCancellation and noiseSuppression on, input gain sane, resample correctly, pick the user's chosen input device, handle device changes (AirPods connect/disconnect) without restarting.
- Understanding accuracy: keep the 100-case task suite as a regression gate; add the three known-bad phrases ("search lo-fi beats on Apple Music", "buy a bagel from Safeway", "couldn't find that on this page" failure). Report accuracy before and after.
- Do not trade accuracy for speed silently: every speed change must show accuracy unchanged or better.

## A4. DESIGN SYSTEM: BLACK LIQUID GLASS, ONE LOOK IN EVERY FRAME
Create ONE shared token file (e.g. src/renderer/ui/tokens.css) used by every surface: dashboard, overlay/island, cards, onboarding, settings, menus and the website. No surface may hardcode its own colors.
Look: true black base with restrained liquid glass. Minimal, quiet, Apple-like. Hand-designed, not "AI-looking": no sparkle icons, no neural-net or random-dot decorations, no purple/blue gradients, no glowing orbs, no emoji headings.
- Base: #000 to #0A0A0A. Glass panels: rgba(255,255,255,0.04-0.07) fill, backdrop-filter: blur(24-40px) saturate(1.2-1.5), 1px hairline border rgba(255,255,255,0.08-0.12), a faint top inner highlight (inset 0 1px 0 rgba(255,255,255,0.10)), soft shadow. Corner radii consistent (e.g. 14/20/28). Generous spacing, one accent at most (white at varying opacity; optional single subtle accent color, used sparingly).
- Type: SF Pro (system font stack), 3 sizes plus one display size; weights 400/500/600; high contrast for primary text, 55-65% white for secondary.
- Native feel on macOS: use BrowserWindow vibrancy (e.g. 'under-window' or 'hud') with transparent: true and visualEffectState 'active' where it looks right. Check what the installed Electron version supports for newer macOS glass materials and use it if it exists; otherwise CSS backdrop-filter. The black base must stay black, not wallpaper-tinted gray.
- Performance budget (this is a fanless MacBook Air and the voice loop comes first): at most 2 blurred layers on screen, never animate blur radius, no per-frame JS animation of the background, pause all decorative animation when the window is hidden or unfocused, idle CPU near 0%, frame time under 8 ms for interactions. Measure and log idle CPU and GPU before/after. If glass hurts latency or battery, simplify it.
- Accessibility: contrast AA for text, visible keyboard focus ring, honor prefers-reduced-motion and prefers-reduced-transparency (falls back to solid near-black).
- Components to build once and reuse: Button (primary, quiet, destructive), Toggle, Segmented tabs, List row, Search field, Card, Chip, Empty state, Toast, Dialog. Every button needs hover, active, focus, disabled and loading states.

## A5. BACKGROUND: FAINT MARBLE / CONTOUR LINES (match my reference image)
Reference: a near-black field with very faint, thin, low-contrast curved contour lines, like topographic or marble veining, flowing in large smooth curves and fading toward the edges. Very hard to see at a glance.
- Generate it, do not use an AI-generated image: procedural contour lines from smooth noise (marching squares) exported ONCE to an SVG or WebP asset shipped in the app. Don't run noise live per frame.
- Strokes: 1 px hairlines, white at 3-7% opacity, a few lines slightly brighter (up to ~9%), wide spacing, no fills. Add a very faint large-scale marble gradient (white at 1-2%) behind the lines. Blend into the black with a radial mask so edges fade to pure black.
- Motion: none by default, or an extremely slow drift (60-120 s loop) via a CSS transform on one layer. No motion at all under reduced-motion. Paused when hidden.
- Make 2-3 variants (different seeds), so dashboard, onboarding and website can differ subtly. Same system.
- The text and glass panels sit above it. The background must never reduce text contrast or compete with content. When in doubt, make it fainter.

## A6. THE BAR / ISLAND / TRAY LOOK (why it looks gray)
- Audit the overlay pill and the menu-bar tray icon. The gray comes from semi-transparent backgrounds composited over light content, or a gray fill. Use an opaque #000 base for the notch island so it merges with the hardware notch exactly (same black, top edge flush, matching the notch's corner geometry). On non-notch Macs use the same opaque black pill; glass highlights on top only.
- Tray icon: a monochrome template image (macOS adapts it to light/dark menu bars). No colored or gray PNG.
- The state machine and sizes from the master prompt Phase 5 still apply. Use the new tokens.

## A7. MASCOT: NO CLIPPED HEAD OR EAR
- The mascot (renderer/ui/mascot.js, and the website's mascot) is partially cut off at an edge, so only a bit of the head or an ear shows. This looks broken and AI-generated.
- Audit every place it's drawn (dashboard, onboarding, empty states, website). Find the overflow:hidden, clip-path, negative offsets or off-screen positioning that cuts it. Fix by one of: show the mascot FULLY inside its frame with padding, or remove it from that surface. No half-peeking, cropped, or partially hidden mascot anywhere. Test at small, default, and large window sizes and at 1x and 2x scale. Take screenshots into docs/ui/.
- On the dashboard, use the mascot sparingly (empty states or onboarding at most). The app should look like a product, not a toy.

## A8. DASHBOARD REBUILD (minimal, 4 tabs, everything works)
Current problem: buttons in the dashboard don't work. Hypotheses to check first: dashboard.js (497 lines) contains an in-page stub store (saveCommands writes to a local object s.commands and returns copy().commands, with Date.now() IDs), so the UI may be wired to fake state instead of the real IPC; also the preload/contextBridge API may not expose the handlers, ipcMain handlers (main/commands.js) may not be registered, CSP may block inline handlers, or an overlay may be eating clicks. Find the actual cause with evidence, fix it, and add tests that click every button.
Structure: a left or top segmented tab bar with 4 tabs. Quiet, spacious, few elements per screen, no walls of text.
1. HOME. Calm overview: how to activate (Option+Space, with a small keycap graphic and a one-line "press once to talk, again to send"), status (listening/ready, provider health, today's usage and cost), 3-5 example commands that I can click to run, recent activity (last 5 things Dixi did, each with Undo), and "next steps" (2-3 suggestions like set up an agent, add a command). That is it.
2. COMMANDS and SETTINGS (one tab, two sections, a clear settings bar).
   - Commands: a simple list of my commands (name, what I say, what it does). "Add command" button opens a small dialog (name, phrase(s), action or steps, optional app/site). Edit, duplicate, delete, enable/disable. Use the existing commands.js store and the "save that as a skill" flow, and wire to the real backend.
   - Settings: a navigable settings list (General, Voice and microphone, Hotkeys, Providers and keys, Privacy, Appearance, About). Each page is a short, simple form. Clicking a setting opens it, changing it applies immediately with a "saved" indicator, and everything persists. Include: hotkey (Option+Space default, change by pressing keys), input device picker, voice on/off and voice choice, provider choice and key status (never show key values), spend cap, launch at login, notch/pill style, reduce motion/transparency.
3. CHATS. Every new session opens a new chat. Define a session as: app launch, or an Option+Space start after 10+ minutes idle, or my click on "New chat". Each chat shows: transcript of what I said, what Dixi did (steps), results, errors, and Undo; titled automatically from the first command; searchable; stored locally only; delete one or all; export to markdown. List on the left, chat on the right.
4. AGENTS (see A9).
Quality gates for the dashboard:
- Playwright (or Electron test) that opens the dashboard and clicks EVERY interactive control, asserts the real state change in the main process (not the stub), and screenshots each tab. Run with fake audio, no paid APIs.
- Keyboard navigable, focus order sane, no dead buttons, no console errors, loading and empty states everywhere, optimistic UI with rollback on failure.
- Minimal: if a screen needs more than about 7 distinct elements, simplify it. Fewer words. Nothing decorative that has no function.

## A9. AGENTS TAB (create and schedule agents)
Let me create agents that run on a schedule or on demand, locally. Build on existing automate.js (scheduling), jobs.js (background jobs), brief.js, hive.js, and the browse/page tools. Don't rebuild what exists.
- Agent = name, instruction in plain words, schedule (daily at a time, weekly on days, e.g. "every Friday 4pm", or manual), tools allowed (browse, files, mail summary, search), output (spoken summary, card in the dashboard, saved markdown), cost cap. Create from the tab with a simple form or by voice ("make an agent that...").
- Ship 4 ready templates the user can enable in one click:
  1. Daily and Friday debrief: summarizes my emails (key threads, things needing a reply, deadlines), calendar and tasks for the day or week. Source: local Mail via ingest.js if available; otherwise the browse agent in my signed-in browser.
  2. Cheapest flights: given origin, destination, date range, runs the browse agent on a flights site, compares options, reports the cheapest with a link, can run on a schedule and notify me only when the price drops.
  3. Lectures: opens or summarizes my lecture pages or recordings on a schedule or on command. Config has a field for course links or a folder. If no lecture source is configured, the agent says what is missing instead of guessing.
  4. Morning brief: reuse brief.js.
- BROWSE AGENT: drives the browser, can log in to sites on my behalf and navigate multi-step flows. Local and private: runs on this Mac, uses MY existing signed-in browser profile or the macOS Keychain; never sends passwords or cookies to any LLM or cloud service, never stores credentials in plaintext, never prints them. The page content sent to a model is minimized (visible text only). It must use the A2 click/focus ladder, verify each step, and stop with a clear line instead of wandering. Per-site allowlist the user controls.
- Run history per agent: last run time, result, what it did, errors, cost. Pause/resume/delete. Runs while the app is open (log this limitation; scheduling when the app is closed is out of scope unless it is trivial with launchd).
- Safety instead of confirmations: no confirmation cards (per Phase 4), but agents are read-and-report by default. Anything that spends money or sends messages must be an explicit setting in the agent config that I turned on, and every action is logged and undoable where possible.

## A10. WEBSITE (website/): now in scope for a declutter pass
- Scope change: the master prompt said not to touch website/. For this pass you may change website/ ONLY to make it more minimal and less crowded, using the same tokens and background (A4, A5). Separate lane, separate commits, don't touch app code from this lane.
- Remove clutter: fewer sections, fewer words, more whitespace, one primary call to action, no stacked effects. Same rules as the dashboard: nothing decorative without function, no AI-looking gimmicks (random dots, sparkles, glow). Check the shuffling use-case deck and intro animation for restraint (slower, quieter, fewer simultaneous things). Keep the waitlist and admin working. Mascot rules from A7 apply.
- Verify on mobile and desktop widths, run the site's build, and screenshot before/after into docs/ui/.

## A11. HOW THIS FITS THE MASTER PROMPT
- Phase 0-4 stay first. Insert A1 right after Phase 1 and A2 and A3 inside Phase 2-4 work. A4-A8 replace/extend Phase 5. A9 extends Phase 6. A10 runs last, in its own lane.
- Same hard rules: max 3 agents, no paid-API tests, small commits on the branch, stuck protocol, everything logged in LOG.md, assumptions in ASSUMPTIONS, needs-from-me in NEEDS_USER.md.
- Assumptions to log rather than ask about: (1) "no AI look" means avoid generic AI-product visuals (sparkles, dot-clouds, neon gradients), not a specific style; (2) "locally disconnects" for the browse agent means runs on-device with credentials never leaving it; (3) what counts as "lectures" depends on my configured source; (4) new chat per session uses the definition in A8.
- Definition of done additions: dashboard test clicks every control with real effects; mic-closed test passes; Gemini paste test passes without clicking when already focused; latency table not worse than the Phase 0 baseline; before/after screenshots of every tab and state in docs/ui/; idle CPU/GPU numbers logged.