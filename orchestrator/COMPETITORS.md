# What to borrow (functionality only, never design). Nov 5.

Sources: voiceos.com (fetched), hedwig-ai.com and OpenJarvis (the user's pasted pages; repo at ~/ref/OpenJarvis, read-only).

## VoiceOS (Mac voice agent, YC)
- Activates with **fn**. It has two modes: **Dictation** (cleans fillers, grammar and formatting, then types into any app) and **Agent** (does the action: email, Slack reply, calendar, Linear bug, notes).
- **Pointer as context:** "find his LinkedIn" uses whatever is under the cursor.
- **Reminders:** "remind me at 4 to …".
- Privacy: transcripts saved on the device, no audio stored, no training on user data.
- Dixi takes from it:
  - the fn key (Phase 4, time-boxed);
  - pointer/selection as context ("this person", Phase 6a);
  - a plain dictation mode as a later BACKLOG item;
  - "no audio stored" as a stated default (A1 already guarantees no audio before the key press).

## Hedwig (assistant plus the "Flock" browser agent)
- **Read-only browsing as you:** pages open on your machine and logins stay local. Submit, pay, post, delete and sign-out clicks are **blocked**.
- **Drafts go to an Outbox.** Nothing is sent without the user pressing send.
- **Per-site connect/disconnect:** a paused site is refused before anything runs.
- **Answers persist** as lists, schedules and threads (a "canvas"), not chat that scrolls away.
- One question searches inbox, calendar, web and signed-in sites together.
- Dixi takes from it:
  - the A9 browse-agent safety model (read-and-report by default; a blocked-verb list; a per-site allowlist with a pause switch; a send/pay step only when the agent's config enables it);
  - A8 Chats and cards that stay put;
  - a "what's due / who's waiting on me" agent template, folded into the Daily/Friday debrief.

## OpenJarvis (Stanford, open-source, local-first)
- **Hardware-aware model/engine pick:** Ollama, llama.cpp or MLX on Apple Silicon. Cloud is optional and per-request.
- **Latency, energy and cost as first-class eval metrics.**
- **Scheduled agents** (Morning Brief: calendar, email, news) and persistent memory across sessions.
- Dixi takes from it:
  - Phase 6e: a small local intent router on the M5, kept only if the bench shows a win, with the cloud model last;
  - bench columns for $ and ms per stage (Phase 0);
  - the agents tab schedule model (A9), which reuses automate.js and brief.js.

## Not borrowed
- Their visual design, branding or copy.
- Hedwig's mail-hosting and pricing model.
- OpenJarvis's installer (never run it).
