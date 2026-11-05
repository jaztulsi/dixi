# Bench baseline (Phase 0): Mac-wide ⌥Space, lane/b-speed = fix/voice-speed 82a720d + gate

`cd electron && npm run bench`. No paid calls: every non-loopback connect is refused. The ⌥Space planner (plan.js, which everywhere.js run() calls) replays real recorded Haiku replies (test/fixtures/plan-live.json), each held for its recorded ms. Raw JSON goes to electron/bench/out/.

Scope:
- **Plan only.** Nothing is executed on this shared Mac, so "done ≤ 2 s" isn't measured yet.
- **Reply = local `say`,** the fallback voice while ElevenLabs is at 0 credits.
- **"may ask"** counts steps whose executor has an approve/askUser site (everywhere.js:444/466/642).
- **MISS** means the planner needed a model call with no recording, so the step shown is what code falls back to.

Against the targets:
- **First visible action < 1 s:** met when code answers (plan p50 0-3 ms). Missed whenever the model plans (Haiku p50 1.4 s, p95 2.8 s).
- **Common Mac-wide commands have no code path.** "switch to Safari", "type hello world", "find my resume", "what's on my screen" and "open Notes and start a new note" all go to the model. They then fall back to a `computer` (screen) step: the slowest path, and one that can ask.
- **Spoken reply:** `say` synthesis takes p50 1.2-1.9 s and p95 1.7-4.4 s (varies run to run) before the first audio. It renders the whole WAV first.

Bench 2026-11-05T17:02: 21 commands (21 everywhere, 0 browser), $0 spent, 6 cache misses
| stage (ms) | n | p50 | p95 |
|---|---|---|---|
| everywhere: interpret→plan ready (all) | 21 | 2 | 2064 |
|   of which provider (recorded Haiku) | 9 | 1409 | 2839 |
|   of which Dixi code | 21 | 2 | 17 |
| reply spoken: local `say` synth | 21 | 1196 | 1712 |
Everywhere planner: 9 via anthropic:claude-haiku-5-5, 6 by code; $0.0010 total as recorded (0.00011/call)
Browser: not run: eval/.cache/llm is empty, and every browser command needs an LLM call (no code path). Needs one approved record run.

| command | mode | provider | steps | plan ms | reply ms | $ | may ask |
|---|---|---|---|---|---|---|---|
| Open Apple Music, search lo-fi beats, and play it | everywhere | anthropic:claude-haiku-5-5 | instant+script+script | 2908 | 1936 | 0.00024 | 0 |
| Go to my school calendar, add my test on Friday, then text my mom I'll be late | everywhere | anthropic:claude-haiku-5-5 | open+script+script | 2064 | 874 | 0.00014 | 0 |
| Turn the volume down, open my notes, and start a new note | everywhere | anthropic:claude-haiku-5-5 | instant+instant+script | 1328 | 926 | 0.00010 | 0 |
| **A3** search lo-fi beats on Apple Music | everywhere | code | instant | 0 | 931 | 0.00000 | 0 |
| **A3** buy a bagel from Safeway | everywhere | anthropic:claude-haiku-5-5 | web | 1563 | 1272 | 0.00004 | 1 |
| remind me to call the dentist tomorrow at 9 | everywhere | anthropic:claude-haiku-5-5 | script | 1415 | 980 | 0.00011 | 0 |
| open Safari and go to the New York Times website | everywhere | anthropic:claude-haiku-5-5 | instant+open | 1258 | 980 | 0.00005 | 0 |
| make a new folder on my desktop called homework | everywhere | anthropic:claude-haiku-5-5 | script | 1243 | 880 | 0.00007 | 0 |
| what's on my calendar tomorrow, then text Sam I'm running late | everywhere | anthropic:claude-haiku-5-5 | answer+script | 1333 | 1196 | 0.00009 | 0 |
| turn on dark mode, open Messages and start a new message to Alex | everywhere | anthropic:claude-haiku-5-5 | instant+instant+script | 1707 | 1401 | 0.00012 | 0 |
| open Notes | everywhere | code | instant | 0 | 1003 | 0.00000 | 0 |
| open Calendar | everywhere | code | instant | 0 | 1174 | 0.00000 | 0 |
| switch to Safari | everywhere | MISS | computer | 2 | 1279 | 0.00000 | 1 |
| type hello world | everywhere | MISS | computer | 1 | 1053 | 0.00000 | 1 |
| turn the volume down | everywhere | code | instant | 0 | 1608 | 0.00000 | 0 |
| mute | everywhere | code | instant | 0 | 1712 | 0.00000 | 0 |
| set a timer for 5 minutes | everywhere | code | instant | 3 | 1711 | 0.00000 | 0 |
| find my resume | everywhere | MISS | computer | 2 | 998 | 0.00000 | 1 |
| what's on my screen | everywhere | MISS | computer | 0 | 1454 | 0.00000 | 1 |
| open Notes and start a new note | everywhere | MISS | instant+computer | 2 | 1349 | 0.00000 | 1 |
| **A3** couldn't find that on this page | everywhere | MISS | computer | 2 | 1230 | 0.00000 | 1 |

