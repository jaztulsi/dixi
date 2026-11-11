# Needs you (surfaced only at the end)
1. **ElevenLabs credits are at 0.** Either top them up or keep the local voice. Dixi will degrade silently either way (Phase 1).
2. **macOS grants:**
   - Microphone, Accessibility and Screen Recording for Dixi;
   - Input Monitoring, only if you want the fn key;
   - the one-time Contacts/Messages Automation prompt for the messaging command.
3. **Rotate the GitHub/Supabase tokens** stored in Cursor's settings.json. They sit in plain text.
4. **⌥Space** (now the instant stop) may be owned by Raycast or Alfred. If Dixi says so, free it there or pick another stop key in Settings → Hotkeys.
5. **Hardware voice checklist:** exact phrases to say, which will be added after Phase 2.
6. **Session name:** this session was renamed to "dixi-orchestrator" in the registry. If it still shows as "orchestrator", type `/rename dixi-orchestrator` here.
7. **Mic check, 10 s:** with Dixi idle, the orange mic dot in the menu bar must be OFF. Hold ⌃ Control → ON; let go → OFF within 1 s. Pressing ⌃C or ⌃-click must never turn it on.
8. **Island check, ~5 s:** the small Dixi pill is always bottom-center above the Dock. Hold ⌃ and say "volume up": the bars move with your voice, your words show under the pill, then a green ✓. Click the idle pill to open the dashboard. Shots: docs/ui/island-*.png.
9. **Dixi is running from the new build.** It runs without the test debug port. If you quit it, restart with `! cd /Users/jaz/dixi-integration/electron && env -u ELECTRON_RUN_AS_NODE npx electron .`
10. ~~Hands-free mic~~: fixed. The wake word and always-listening are removed; the mic opens only while ⌃ is held.
11. **Your clipboard:** before the fix in 5d98a2e, each time Dixi typed something it left that text on the clipboard. My live tests did this once, so the clipboard text you had copied earlier today was replaced and can't be recovered. This is fixed now.
12. **Try these yourself (I paused while you were playing):** hold ⌃ and say "select everything and paste it into Gemini and ask it to summarize it" in any document; and "ask ChatGPT …". If Gemini or ChatGPT asks you to sign in, sign in once in Chrome yourself. Dixi never types passwords.

## Nov 6: which Dixi you're running
- The new UI (bottom pill with Dixi's face + live waveform, ⌥Space to talk) lives on branch fix/voice-speed, checked out at ~/dixi-integration. ~/dixi is still on the older feat/where-dixi-is-going.
- It's running now. To start it again after a restart: `cd ~/dixi-integration/electron && env -u ELECTRON_RUN_AS_NODE npx electron .`
- Or merge fix/voice-speed into your main branch when you're happy (not done for you: no merges without your say).

## Nov 11: hold Fn, speak (v4) — what only you can do
Branch `claude/epic-ritchie-k4kr9s` (built on fix/voice-speed). On the Mac:
1. **Get the branch:** `cd ~/dixi-integration && git fetch origin && git checkout claude/epic-ritchie-k4kr9s`
   (all work is pushed there).
2. **Build the ear** (Xcode 26 / macOS 26): `cd electron && npm run build:ear`. It was written on Linux and never
   compiled: if it fails, paste the errors back and they get fixed in one round.
3. **Permissions** for the app that starts Dixi (Electron, or Terminal while developing):
   - **Input Monitoring** (the Fn key; Accessibility alone isn't enough) and **Accessibility** (paste, context).
   - **Microphone.** Speech Recognition only matters on macOS < 26 (the fallback recognizer).
   - First run downloads Apple's on-device speech model once (the island log says "downloading").
4. **System Settings → Keyboard → "Press 🌐 key to": Do Nothing**, and turn off Dictation's own shortcut, so macOS
   doesn't open emoji/dictation when you press Fn.
5. **One key in `.env`:** `CEREBRAS_API_KEY` (fastest planner; `GROQ_API_KEY` works as the second). Without one,
   anything rules can't do goes to the Claude agent as before.
6. **The paid check, capped:** quit Dixi, then `cd electron && npm run smoke`. 13 typed commands: 10 by rules
   ($0), 3 by the fast planner (~$0.001 total). Anthropic and cloud speech are off for that run; cap +$0.01 per provider.
7. **2-minute hardware check** (say exactly):
   - hold Fn: "open Notes" → Notes in front, the eye squints, no voice reply;
   - double-tap Fn: "search lo-fi beats on Apple Music", then press Fn → Music search;
   - hold Fn, pause 2 s mid-sentence: "open Safari … and then go to youtube.com" → ONE command, two steps;
   - Fn+Space, speak, Fn+Space → sent; Esc while talking → nothing runs;
   - Fn+Left Arrow → nothing happens (no island, no sound); with Dixi idle the orange mic dot is OFF.
   - Fn+Control, say "see you at five" in a text field → pasted, your clipboard unchanged.
