# Bench baseline (Phase 0), lane/b-speed = fix/voice-speed 82a720d + gate

`cd electron && npm run bench`. No paid calls: every non-loopback connect is refused (test/no-network.js), and the planner replays real recorded Haiku replies (test/fixtures/plan-live.json), each held for its recorded ms.

What this does and doesn't measure:
- **Everywhere, plan only.** Nothing is executed on this shared Mac.
- **Reply = local `say`.** That is the fallback voice, and the one in use while ElevenLabs is at 0 credits.
- **Not measured: hotkey → mic open → STT partial → STT final.** No STT replay exists.
- **Not measured: browser mode.** eval/.cache/llm is empty. Every browser command needs an LLM call: a $0 run gave 318/318 `interpret: failed, "no answer"`. It needs one approved record run.

Findings:
1. **The fallback voice is the slowest stage measured.** `say` synthesis takes p50 1.9 s and p95 4.4 s before the first audio. It renders the whole WAV first.
2. **Planner (Haiku 5.5, recorded): p50 1.4 s, p95 2.8 s, about $0.0001 per call.** Dixi's own code adds p50 1 ms.
3. **No code path and no recording for two commands:** "go back" and the A3 phrase "couldn't find that on this page". Each needs a model call.

Bench 2026-11-05T16:56: 20 commands (20 everywhere, 0 browser), $0 spent, 2 cache misses
| stage (ms) | n | p50 | p95 |
|---|---|---|---|
| everywhere: interpret→plan ready (all) | 20 | 3 | 2128 |
|   of which provider (recorded Haiku) | 9 | 1409 | 2839 |
|   of which Dixi code | 20 | 1 | 67 |
| reply spoken: local `say` synth | 20 | 1895 | 4413 |
| browser: speech end→first action | 0 | - | - |
| browser: speech end→done | 0 | - | - |
Everywhere planner: 9 via anthropic:claude-haiku-5-5, 9 by code; $0.0010 total as recorded (0.00011/call)
Browser: not run: eval/.cache/llm is empty, and every browser command needs an LLM call (no code path). Needs one approved record run.

| command | mode | provider | plan ms | reply ms | $ |
|---|---|---|---|---|---|
| Open Apple Music, search lo-fi beats, and play it | everywhere | anthropic:claude-haiku-5-5 | 2985 | 4045 | 0.00024 |
| Go to my school calendar, add my test on Friday, then text my mom I'll be late | everywhere | anthropic:claude-haiku-5-5 | 2128 | 3787 | 0.00014 |
| Turn the volume down, open my notes, and start a new note | everywhere | anthropic:claude-haiku-5-5 | 1328 | 1512 | 0.00010 |
| **A3** search lo-fi beats on Apple Music | everywhere | code | 0 | 1477 | 0.00000 |
| **A3** buy a bagel from Safeway | everywhere | anthropic:claude-haiku-5-5 | 1562 | 1849 | 0.00004 |
| remind me to call the dentist tomorrow at 9 | everywhere | anthropic:claude-haiku-5-5 | 1441 | 3670 | 0.00011 |
| open Safari and go to the New York Times website | everywhere | anthropic:claude-haiku-5-5 | 1259 | 1688 | 0.00005 |
| make a new folder on my desktop called homework | everywhere | anthropic:claude-haiku-5-5 | 1242 | 1774 | 0.00007 |
| what's on my calendar tomorrow, then text Sam I'm running late | everywhere | anthropic:claude-haiku-5-5 | 1330 | 1990 | 0.00009 |
| turn on dark mode, open Messages and start a new message to Alex | everywhere | anthropic:claude-haiku-5-5 | 1707 | 1657 | 0.00012 |
| open Safari | everywhere | code | 0 | 1724 | 0.00000 |
| open Notes | everywhere | code | 0 | 1497 | 0.00000 |
| open Music | everywhere | code | 0 | 1362 | 0.00000 |
| open Calendar | everywhere | code | 0 | 1895 | 0.00000 |
| turn the volume down | everywhere | code | 0 | 2087 | 0.00000 |
| turn the volume up | everywhere | code | 1 | 2594 | 0.00000 |
| open Messages | everywhere | code | 1 | 3426 | 0.00000 |
| mute | everywhere | code | 1 | 4685 | 0.00000 |
| go back | everywhere | MISS | 5 | 4413 | 0.00000 |
| **A3** couldn't find that on this page | everywhere | MISS | 3 | 3527 | 0.00000 |

