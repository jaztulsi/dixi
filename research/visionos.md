# VisionOS teardown (ledaniel0/treehacks2026)

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.

---

# VisionOS (ledaniel0/treehacks2026): engineering teardown

Paths are relative to the repo root at https://github.com/ledaniel0/treehacks2026/blob/main/. `[ov]` means the `openai-voice` branch. I read everything through `gh api` and cloned nothing.

## Headline findings

1. **There is no license.** The code is all rights reserved, so treat it as inspiration only.
2. **The `main` HEAD does not run on a clean checkout.**
   - `server/src/socket/handler.ts` imports `../tts/openai.js` and `../stt/openai.js`.
   - `electron/src/components/VoiceAgent.tsx` imports `@/hooks/useOpenAISTT`.
   - None of those files exist on `main`. They only exist on `[ov]`, and that branch never wires them in: its handler still uses Cartesia and Deepgram.
   - On top of that, `electron/src/main.ts` lines 248-257 use `await fadeWindow(...)` inside a non-async `toggleWindow()`, and `fadeWindow` and `isFading` are undefined there. That is a TypeScript syntax error, so `npm run build:main` fails.
   - The break came from merge commit `c29d56f` ("Merge with test and ui changes").
3. **The headline "I'm allergic" demo is scripted.**
   - `server/src/test/responses.ts` (run with `TEST=true`, see `server/package.json` `dev:test`) plays canned speech plus fake "console" lines such as "Commerce agent calls Elasticsearch tool", "Perplexity Sonar tool" and `elastic_hits: [{field: "medical_allergies", value: "Aspirin"}]`, on timed delays.
   - No allergy or medical field exists anywhere in the real schema. `visionimplementationplan.md` lines 1475 and 1942 list "Add medical profile data (conditions, medications, allergies)" as unchecked.
   - I couldn't access Devpost or the demo video, so I can't say for certain what was shown. The fake log lines and their timings are strong evidence that this is what was demoed.
4. **API keys were committed and are still in git history.** `server/.env` was tracked in commits `85e1240`, `fdafe90` and `92fe2d7` and contained what look like real `CARTESIA_API_KEY`, `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` values (I masked them when reading). They may have been revoked; I don't know.

---

## 1. License

- **No LICENSE, COPYING or NOTICE file on either branch, in any folder.** `gh api repos/.../license` returns 404.
- `server/package.json` has `"license": "ISC"`. That is the `npm init` default and applies to that package manifest only. It is not a license grant for the repo, so don't rely on it.
- **What this means:** default copyright applies (all rights reserved). GitHub's terms let you view and fork on GitHub, not reuse the code. Use it for ideas and architecture only. Rewrite anything you want from scratch, or ask the three authors for a license.

## 2. Repo metadata

| Field | Value |
|---|---|
| Created | 2026-02-13T19:28:19Z (Fri 11:28 PT) |
| Last push | 2026-02-15T17:26:57Z (Sun 09:26 PT). `updated_at` of 2026-08-14 is metadata only. |
| Commits | 50 unique on `main`, all between Fri 11:28 PT and Sun 09:26 PT. `[ov]` adds 1 more (2026-02-15T14:49Z) and is 1 ahead / 3 behind `main`. |
| Hackathon window | Every commit falls inside Feb 13-15, 2026. I'm inferring the TreeHacks dates from that window; Devpost wasn't reachable to confirm. |
| Contributors | ledaniel0 (21), AdityaShirodkar123 (16), airjlee (13) |
| Stars / forks / watchers | 3 / 4 / 3 |
| Description, topics, homepage | none |
| Languages (bytes) | TypeScript 269,673; Python 9,755; Shell 3,034; CSS 1,922; JS 788; HTML 684 |
| Size | 44 MB, inflated because `node_modules` was committed early and later removed ("Remove node_modules from tracking") |

## 3. File tree: what matters

| Folder | Matters? | Notes |
|---|---|---|
| `server/src/` | Yes, this is the core | `agents/` (supervisor, commerce, general, coding, desktop, documentation, tools), `lib/` (stagehand, elasticsearch, computerControl, computerActions), `pipeline/voicePipeline.ts`, `socket/handler.ts`, `tts/cartesia.ts`, `stt/deepgram.ts`, `test/responses.ts` (canned demo) |
| `server/scripts/setup-elastic.ts` | Yes | Elasticsearch indices, Jina inference endpoint, ingest pipeline |
| `electron/src/` | Yes | Overlay: `main.ts`, `preload.ts`, `App.tsx`, `components/VoiceAgent.tsx`, `hooks/*` |
| `visualizer/` | Somewhat | Separate Electron app with a Three.js audio orb |
| `agentverse/` | Somewhat | Fetch.ai uAgents proxy (`adapter.py`, `register.py`) |
| `client/` | No | Legacy Next.js web client that the Electron app superseded |
| `docs/`, `PHASES.md`, `visionimplementationplan.md` (101 KB), `agent-S-dev-plan.md`, `architecture.txt` | Plans only | They often don't match the code (see section 9) |
| `uagents_core.log` | No | A committed log of failed Agentverse registrations; it also leaks a local username path |

## 4. Architecture

### Process model

1. **Electron main process** (`electron/src/main.ts`):
   - Starts the server with `spawn('npx', ['tsx','src/index.ts'])` from `../../server`, passing in `server/.env`, and polls `/health`.
   - Opens a 740x390 transparent, frameless, always-on-top window (`'screen-saver'` level, visible on all workspaces), adds a tray icon and a global hotkey `Cmd+Shift+V`.
   - Checks macOS Accessibility permission on startup.
   - The server path only works in dev. electron-builder packages only `dist/**`, so a packaged app wouldn't find the server.
2. **Renderer** (Vite + React 19, `contextIsolation: true`, `nodeIntegration: false`):
   - `preload.ts` exposes `toggleOverlay`, `setClickThrough` and `onServerStatus`. The renderer never uses any of them.
   - The renderer captures the mic itself and talks to `localhost:3001` directly over socket.io.
3. **Node server** (`server/src/index.ts`), a single process:
   - Express + socket.io, the LangGraph graph, and a Stagehand-driven visible Chrome.
   - `osascript` child processes for desktop control.
4. **Optional extra processes:** the visualizer Electron app (port 5174, `Cmd+Shift+X`) and the Agentverse Python Bureau.

### The "brain" is several models, not one

| Role | Model | Where |
|---|---|---|
| Intent classifier | `gpt-4.1-mini`, temperature 0, maxTokens 256 | `server/src/agents/supervisor.ts`, `classifierModel` + `CLASSIFY_SYSTEM` |
| Commerce, general and coding agents | `gpt-4.1` via `ChatOpenAI`, temperature 0.3, non-streaming `invoke` | `commerce.ts`, `general.ts`, `coding.ts` |
| Desktop and documentation agents | `claude-sonnet-4-5-20250929` with the `computer_20250124` tool | `desktop.ts`, `documentation.ts` |
| Stagehand's internal LLM | `openai/gpt-4.1` | `lib/stagehand.ts` |

- The classifier prompt defines five categories: commerce, coding, desktop, documentation (Apple Notes) and general.
- It returns JSON parsed from free text (no structured-output mode), and falls back to `general` if parsing fails.
- It can also return `secondaryCategory`, `primaryTask` and `secondaryTask` for compound requests.

### Speech-to-text

- **`main`:** OpenAI Realtime `gpt-4o-mini-transcribe` with server-side voice-activity detection (threshold 0.5, 300 ms prefix, 500 ms silence). The client sends 24 kHz PCM16 in ~100 ms frames from an AudioWorklet. The files that implement this exist only on `[ov]`: `server/src/stt/openai.ts`, `electron/src/hooks/useOpenAISTT.ts`, `electron/src/audio/pcm-processor.ts`.
- **`[ov]` wiring and earlier commits:** Deepgram `nova-3` (`server/src/stt/deepgram.ts`) with interim results, VAD events, 600 ms endpointing and 1500 ms utterance end. The client sends WebM/Opus via `MediaRecorder` in 250 ms slices (`electron/src/hooks/useDeepgramSTT.ts`).
- In both cases the server relays results to the client. The client assembles the final transcript and sends it back as `user_message`.

### Text-to-speech

- **Cartesia** (`server/src/tts/cartesia.ts`):
  - Raw WebSocket to `wss://api.cartesia.ai/tts/websocket?api_key=...`, model `sonic-3`, PCM s16le 24 kHz.
  - One `context_id` per turn, `continue: true` per chunk, and `{cancel: true}` to cancel.
  - Audio is streamed back to the client, but the text is not: `VoicePipeline.processSupervisorResponse()` gets the agent's finished answer, splits it into sentences, and sends them all at once.
  - The token-streaming LLM-to-TTS path (`processMessage()` with clause flushing at 40/60/150 chars) is dead code, because the pipeline is built with `llm = null` in `handler.ts`.
- **`main` actually uses OpenAI TTS** `gpt-4o-mini-tts`, voice `nova` (`[ov] server/src/tts/openai.ts`):
  - `sendChunk` only buffers text. `finalizeContext` makes one HTTP request and streams PCM back in 4800-byte chunks.
- **"Interim" spoken phrases** (`VoicePipeline.speakInterim`) use their own TTS contexts, with a 2 s global cooldown and a 4 s cooldown for repeating the same phrase.
- **Client playback** (`electron/src/hooks/useAudioPlayer.ts`): WebAudio with a 200 ms jitter buffer and ~80 ms batches.

### LangGraph graph (`supervisor.ts`, `createSupervisor`)

```
__start__ -> classify -> {commerceAgent|codingAgent|generalAgent|desktopAgent|documentationAgent}
          -> recheck -> (agentPhase==1 ? same router again : formatResponse) -> __end__
```

- **`classify`:** runs `Promise.all([classifierModel.invoke, kb.fetchMemoryContext])`, so the memory lookup happens in parallel with classification.
- **Agent nodes:** each is a hand-rolled ReAct loop, not LangGraph's prebuilt agent.
  - `MAX_TOOL_STEPS = 10` for the GPT agents; `MAX_ITERATIONS` is 15 (desktop) and 10 (documentation).
  - The abort signal is checked only between iterations and between tool calls.
- **`recheck`:** chains to a second agent for compound tasks, using `scopedInput = secondaryTask`.
- **`formatResponse`:** regex-strips markdown, URLs and list markers for TTS.

**How context is passed:**
- Each socket connection has its own in-memory `conversationHistory` array. It grows without limit and holds only the user's text and the assistant's final text, never tool traces.
- The last 6 turns go to the classifier and to every agent (the last 4 for documentation).
- Elasticsearch `memoryContext` is appended to each agent's system prompt.
- The commerce prompt gets `userProfile` (budget, preferred stores).

**Compound-chaining bug (high confidence):** the second agent never sees the first agent's `responseText`. `buildScopedState` doesn't include it, and the reducer overwrites it. Only the second agent's answer is spoken. So "search for tips and write them in Notes" sends Notes a task with no tips in it, unless the classifier happened to put the content into `secondaryTask`.

### Agent tools (`server/src/agents/tools.ts`)

| Tool set | Tools | Notes |
|---|---|---|
| `createSearchTools` | `web_search` | Perplexity **Sonar**: plain `fetch` to `api.perplexity.ai/chat/completions`, `model: "sonar"`, `search_recency_filter` defaults to `week`, returns answer + citations. Disabled if the key is missing. |
| `createBrowserTools` | `navigate_to_url`, `click_element`, `extract_data`, `observe_page` | `click_element` calls `observe()` and then `act()`. `act` doesn't reuse what `observe` found, so that's two LLM calls per click. |
| `createKnowledgeTools` | `search_browsing_history`, `search_products_viewed`, `search_conversation_history` | Elasticsearch queries |
| `createCodingTools` | `read_file`, `write_file`, `edit_file`, `run_command`, `list_directory`, `search_code` | `run_command` runs `/bin/bash -c` with a 30 s timeout |

Commerce and general agents get search + browser + knowledge tools. The coding agent gets coding + search tools.

### Stagehand

- `lib/stagehand.ts` runs with `env: "LOCAL"`: a local visible Chrome at the hardcoded path `/Applications/Google Chrome.app/...`, falling back to bundled Chromium, with a throwaway profile at `os.tmpdir()/rcy-chrome-profile`.
- **Browserbase cloud is not used.** It appears only as a "fallback" in `docs/07-execution-layer.md`.
- `act()` retries 3 times, scrolling down 400 px between attempts.
- There is one shared page for every socket and every concurrent run.

### Desktop control

- **Not Agent-S.** `agent-S-dev-plan.md` describes a Python FastAPI sidecar that was never built; no `agent-s-sidecar/` folder exists.
- What exists is Anthropic computer use (`desktop.ts`, `documentation.ts`) running on `lib/computerControl.ts` (`createMacOSControl`):
  - `screencapture` + `sips` resize to fit 1280x800, saved at the fixed path `/tmp/cua-screenshot.png`.
  - Mouse events via CoreGraphics from JXA; keystrokes via AppleScript `System Events`; clipboard paste for text over 100 chars.
  - Every call uses **`execSync`**, so it blocks the server's event loop.
- `lib/computerActions.ts` is an OpenAI computer-use action mapper that nothing calls.
- Both prompts force Spotlight for opening apps, because "VS Code and Cursor are visually identical".

### Elasticsearch + Jina memory

**Setup** (`server/scripts/setup-elastic.ts`): an inference endpoint `jina-embeddings-v3` (service `jinaai`) and these indices:

| Index | Mapping highlights |
|---|---|
| `browsing-history` | url keyword, title text, **content `semantic_text`**, sessionId, userQuery, agentCategory, timestamp, `drug_safety_flag` |
| `products-viewed` | name, price, rating, store, **content `semantic_text`** |
| `user-profile` | structured fields only |
| `conversation-history` | **text `semantic_text`** |

It also creates an ingest pipeline `drug-safety-pipeline` (keyword regex sets `drug_safety_flag`) and a Kibana step labelled "Agent Builder" that actually calls `/api/security_ai_assistant/knowledge_base/entries/_bulk_action`.

**What gets written:**
- Every user turn and assistant turn goes to `conversation-history`, fire-and-forget (`handler.ts`).
- `navigate_to_url` results are indexed with title as content. `extract_data` results are indexed as JSON content with an empty url and title.
- Product items are indexed from commerce extracts.

**Retrieval** (`lib/elasticsearch.ts`): hybrid search fusing a `semantic` query with a fuzzy `multi_match` via RRF (`window_size` 50, `rank_constant` 20), falling back to semantic-only. `fetchMemoryContext` runs 3 searches with top-3 each, on every turn.

**Broken in practice (high confidence):**
- **Every query filters by `sessionId = socket.id`**, which changes on every reconnect, and the client never sends `restore_session`. Memory therefore doesn't carry across sessions.
- `getProfile(socket.id)` always misses, so the profile is always the seed `server/data/seed-user-profile.json` ("Alex"), while the UI says "Hello, Jordan."
- `indexProductViewed` never sets `content`, so semantic search on products always returns nothing.
- Nothing ever reads `drug_safety_flag`.
- `updatePreference` interpolates `key` straight into a Painless script (an injection risk), but nothing calls it.

### Agentverse / Fetch.ai (`agentverse/adapter.py`)

- A Bureau runs 5 uAgents (supervisor, commerce, web, desktop, code). All 5 forward the same text to `POST localhost:3001/api/chat`, so the "specialist" agents are identical.
- `/api/chat` uses `createSupervisor(null, kb)`: no browser, but desktop and coding agents still work (see section 8).
- The payment protocol does nothing: the `pending` dict is never filled, so `CommitPayment` always returns early.
- Seed phrases are hardcoded in a public repo (`"visionos-supervisor-seed-phrase"` and so on), so anyone can derive these agents' keys.
- `register.py` registers with `WEBHOOK = "https://localhost:3001"`.
- The README text claims "classifies intent using Claude" and "never auto-confirms purchases". Neither is true.

## 5. One request end to end, and where the latency lives

Normal mode on `main`, for a commerce request:

1. Mic → AudioWorklet → socket `stt_audio` → server → OpenAI Realtime WebSocket. VAD waits for **500 ms of silence**, then transcribes.
2. `stt_transcript` goes to the client, which sends `user_message` back to the server (a localhost round trip, cheap).
3. `handler.ts`: index the turn in Elasticsearch (async), abort any previous run, emit `status: thinking`, call `runSupervisor`.
4. **`classify`: gpt-4.1-mini (hop 1)** in parallel with **3 Elasticsearch hybrid searches, each needing a Jina embedding of the query** (probably 3 parallel Jina calls; I'm inferring that from how `semantic` queries work).
5. **Agent loop, gpt-4.1, not streamed.** Each iteration costs one LLM hop plus its tools:
   - `web_search` adds a **Perplexity hop**.
   - `click_element` adds a **Stagehand observe LLM hop + act LLM hop**. Failed attempts retry up to 3 times, so up to **6 hops**.
   - `extract_data` adds **1 Stagehand LLM hop**.
   - `navigate` waits for a page load.
   - Each tool call also triggers an interim TTS request.
6. **Final gpt-4.1 call** produces the answer. A compound task runs a whole second agent loop after this.
7. `formatResponse` (local), then **TTS hop**. OpenAI TTS can't start until the full text exists. Cartesia streams audio back but still receives the whole text at once. The client adds a 200 ms jitter buffer.

**Hop counts:**
- **Simplest factual question:** STT + classifier + gpt-4.1 (decides to search) + Perplexity + gpt-4.1 (answer) + TTS = **about 6 sequential network/LLM steps**, not counting the 500 ms VAD wait.
- **"Find X on Amazon and add to cart":** classifier + 4-8 agent iterations × (1 + 1-3 Stagehand hops) ≈ **10-25 sequential LLM calls**. That's tens of seconds (my estimate; nothing was measured). The interim phrases ("Opening Amazon.", "Adding to cart.") are what make the wait tolerable.
- **Desktop agent:** each iteration is a screenshot (blocking `execSync` of `screencapture` + `sips`), a Sonnet call with the image, and several `osascript` spawns. Up to 15 iterations. While `execSync` runs, **the whole server stalls**, including audio delivery and stop events.

Nothing reduces this: no streaming of the agent's final answer, no prompt caching, no speculative TTS.

## 6. Interruption, barge-in and mid-task refinement

**Barge-in mechanism** (`electron/src/components/VoiceAgent.tsx` `handleBargeIn`, `server/src/socket/handler.ts` `stop_audio`, `VoicePipeline.abort`):
- There is no voice-activity detection on the client. The trigger is the first *non-final transcript text* from the STT provider, and only while `isPlaying()` is true.
- When it fires: `stopPlayback()` stops all scheduled WebAudio nodes and clears the buffer, then `stop_audio` is sent.
- The server then calls `supervisorAbort.abort()` and `pipeline.abort()`, which cancels Cartesia contexts with `{cancel:true}` or aborts the OpenAI TTS request.
- Any partial assistant text is kept in the transcript.

**On `main`, barge-in is slow** (medium-high confidence):
- `handleSpeechStarted` is an empty function `() => {}` in `useOpenAISTT.ts`.
- With server-side VAD, transcription text only arrives after the user stops talking.
- So the assistant keeps talking over the user until they finish plus ~0.5 s plus transcription time.
- The Deepgram path streams interim results while the user is still speaking, so it reacts much faster.
- Echo: they rely on Chromium's `echoCancellation: true`. Speaker bleed might trigger false barge-ins without headphones; I can't verify that from code.

**Aborting the graph is cooperative only:**
- The signal isn't passed into `modelWithTools.invoke`, `anthropic.beta.messages.create` or the Stagehand calls.
- One in-flight LLM call or browser/desktop action always finishes after "stop". For example, an in-flight `act("Place order")` completes.
- The singleton Stagehand page is shared, so the old run and the new run can briefly both drive it.

**Mid-task refinement ("I'm allergic to peanuts"):**
- It isn't a feature. A new `user_message` cancels the current run and starts over: re-classify, new agent loop, history = [..., "order snacks", "I'm allergic to peanuts"].
- The old run's tool trace and findings are lost. Only the browser's current page and the Elasticsearch page titles survive.
- There is no "stop" or "wait" intent and no confirm state.
- The polished allergy flow exists only in `server/src/test/responses.ts`.

## 7. Overlay UI/UX (`electron/src/App.tsx`, `VoiceAgent.tsx`, `index.css`)

**Layout:**
- A centered 700x350 "liquid glass" panel (`liquid-glass-react`: displacement 30, blur 1.5, saturation 150, chromatic aberration, 26 px corners) with a 25% black tint over it.
- "VisionOS" at 50% opacity, top-left.
- A 10 px status dot, top-right: glowing green while listening, gray when connected, red when disconnected.
- A 50 px drag strip along the top.

**Center area, in order of what you see:**
1. A large "Hello, Jordan." greeting (28 px light, hardcoded).
2. While the user talks, the live transcript takes over the center (20 px).
3. Otherwise a chat log of small bubbles: user on the right, assistant on the left, 13 px.

Other content:
- "Console" lines (11 px italic, 40% opacity) only ever appear in TEST mode, because only canned sequences emit `console_log`.
- Real interim progress is sent as `interim_text`, which the client ignores, so in real mode **progress is audio-only**.
- The "streaming" bubble with a blinking cursor gets the whole text at once.
- The first utterance is a hidden "greeting trigger": it's sent to the server, but that exchange is left out of the UI.

**Controls:**
- 50 px mic toggle at the bottom center (red glow and a stop square while listening).
- A 38 px mute button that appears only while listening (amber when muted).
- A red error pill that disappears after 5 s.

**States:**
- `agentState` (idle / listening / thinking / speaking) is computed, but nothing renders it. `StatusIndicator` is imported and never used.
- There is **no thinking, acting or confirming visual**, no earcons or sounds, and no captions beyond the chat log.

**Accessibility, bluntly:**
- Listening only starts when you **mouse-click a `<div>`**. There's no role, no aria label and no keyboard shortcut. The global hotkey only shows or hides the window, and on `main` even that doesn't compile.
- This is an app for blind users.

**Visualizer** (`visualizer/src/components/AudioVisualizer.tsx`, `visualizer/electron-main.ts`):
- A 350x350 transparent always-on-top window with a wireframe icosahedron (detail 30), displaced by Perlin noise driven by RMS and FFT of the mic, with a cyan glow. `Cmd+Shift+X` fades it over 600 ms.
- It subscribes to `audio_chunk` on **its own** socket. The server only sends audio to the socket that made the request, and sends it as `{data}` where the visualizer expects a bare string. So in practice the orb reacts to the mic only (medium-high confidence).

## 8. Safety

| Control | Status | Evidence |
|---|---|---|
| Confirm before purchase | **None in code** | The commerce prompt in `commerce.ts` has no checkout-confirmation rule. Only `docs/04-commerce-agent.md` says "MUST NOT auto-confirm". The canned demo itself says "I'll go ahead and purchase" and then calls `act("Purchase the Boiron...")`. The throwaway Chrome profile (`rcy-chrome-profile` in tmpdir) is the only accidental guard: you'd have to log in to Amazon first. |
| Prompt-injection defense | **None** | Page extracts and Perplexity answers go straight into gpt-4.1 context. The coding agent has `web_search` plus `run_command`. The desktop agent acts on whatever is on screen. |
| Shell sandbox | Not a real sandbox | `resolveSafe` uses a `startsWith` prefix check, which sibling directories like `/ws-evil` pass. `run_command` is `bash -c` anyway. `WORKSPACE_PATH` defaults to `process.cwd()`, the server directory, so the agent can edit its own source while `tsx watch` reloads it. |
| Network exposure | **Serious** | `index.ts`: `cors()` with no restrictions, socket.io `origin: "*"`, `listen(PORT)` on every interface. Anyone on the hackathon Wi-Fi, any web page open in any browser on the machine (including pages Stagehand visits), or any ASI:One user via the Agentverse proxy can `POST /api/chat`. That reaches the coding agent's `run_command` or the desktop agent: **remote code execution and full control of the Mac**. |
| Permissions | Partial | Electron checks Accessibility trust (`checkAccessibilityPermission`). Screen Recording isn't checked. |
| Audit log | Weak | Console logs plus Elasticsearch `conversation-history`. Actions taken are not recorded. |
| Kill switch | Weak | `stop_audio`, mute, and tray Quit (kills the server). There's no stop intent, no hotkey to abort, and in-flight actions finish (section 6). |
| Secrets | Leaked | `server/.env` in history (Cartesia, Anthropic, Gemini). `index.ts` logs the first 12 characters of the OpenAI key. Hardcoded Agentverse seeds. |
| Medical safety | Bad optics | The scripted demo says it will avoid Pepto-Bismol because of an aspirin allergy, then recommends **bismuth subsalicylate**, which is Pepto-Bismol's active ingredient (a salicylate), then homeopathic Arsenicum. |

## 9. What's clever and what's hype

**Clever, worth borrowing as ideas:**
- Spoken progress phrases chosen from the tool name and arguments, with cooldowns and separate cancellable TTS contexts (`getCommerceInterimPhrase`, `speakInterim`). Cheap and good for blind users.
- Classifier and memory lookup run in parallel, so memory adds no latency on top of classification.
- The compound-task design (`secondaryCategory`, `primaryTask`/`secondaryTask`, a `recheck` node). The idea is sound even though context is lost between agents.
- The documentation agent's prompt makes the model batch several computer-use actions per turn (at most ~4 model calls), uses clipboard paste for long text, and enforces "always use Spotlight" to tell similar-looking apps apart.
- Observe-then-act with scroll retries; hybrid RRF search with a fallback.
- The `TTSProvider` interface that let them swap Cartesia and OpenAI; the 200 ms jitter buffer; markdown stripping for speech.
- Electron starting the server itself and health-polling it.

**Hype, fragile or demo-only:**
- Demo-critical behaviour (allergy awareness, Elasticsearch hits, the agent-call log) is canned in `server/src/test/responses.ts`. Its sequence index is module-level, shared across connections, and cycles. It uses Cartesia tags (`<emotion value=... />`, `[laughter]`) that OpenAI TTS would probably read aloud literally (my inference).
- Named integrations that are missing or thin:
  - Agent-S: plan only (`agent-S-dev-plan.md`).
  - Browserbase: library only, `LOCAL` mode.
  - Fetch.ai: an HTTP proxy with fake specialists and a no-op payment protocol; the committed `uagents_core.log` shows 422 errors and "Agent limit reached 4/4".
  - Elasticsearch "memory": per socket, so it doesn't persist across sessions.
  - "Drug safety": a flag nothing reads.
  - "Agent Builder": actually the wrong Kibana API.
- Docs don't match the code:
  - `PHASES.md` and the `[ov]` diagram say Haiku or Claude does the classification; the code uses gpt-4.1-mini.
  - `architecture.txt` describes Web Speech API, Next.js and a "Medical Agent".
  - `PHASES.md` itself marks Phase 5 agents as "Not demo-ready".
- Hardcoded and macOS-only:
  - Chrome path, `/tmp/cua-screenshot.png`, `osascript`/JXA/`screencapture`/`sips`.
  - Ports 3001, 5173, 5174; the visualizer's `SERVER_URL`.
  - "Hello, Jordan." vs the seed profile's "Alex"; Cartesia voice-ID fallback `a0e99841-...`; the `cartesia_version=2024-06-10` API header paired with `sonic-3`.
- Concurrency: one shared Stagehand page for every socket and run, and `execSync` blocking the event loop.
- `client/` is dead weight, as are `computerActions.ts` and `processMessage()`.
- No real tests: the only "tests" are the canned responses.
- `main` doesn't build (headline 2). To run anything you'd need `[ov]` with Cartesia + Deepgram, and that branch has no documentation agent.

**Uncertainty:**
- I couldn't reach Devpost: searches found nothing and direct fetches returned 403. I can't confirm the project page, prizes or demo video.
- Barge-in latency, Jina call counts and the latency figures are inferred from the code and provider behaviour, not measured.
- I don't know whether the leaked keys are still live.

Sources (searched; neither turned up the project):
- [Stanford Daily TreeHacks coverage](https://stanforddaily.com/2024/02/27/treehacks-2024/)
- [shloakr/treehacks (different team, 2024)](https://github.com/shloakr/treehacks)
