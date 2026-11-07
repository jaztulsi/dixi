# Dixi Agent Mode: do what Cowork does, with a voice front door

Research: [cowork](agent-research/cowork.md) · [muse](agent-research/muse.md) · [opendots](agent-research/opendots.md).

**Short answer to "why can't we just do what they do": we can.**
- **Cowork** is the Claude Code CLI driven over stream-json, with the host's abilities plugged in as MCP tools and permission checks answered by the host.
- **Muse** and **OpenDots** have the same shape: one general agent loop, connectors first, computer control last, and approval before send or delete.

Dixi swaps the chat box for ⌥Space and STT. Everything after the transcript is the same harness.

## 1. What we use (with sources)
- **Claude Agent SDK, TypeScript** (`@anthropic-ai/claude-agent-sdk`). It is "a library that runs the Claude Code binary": the same loop, tools and context handling as Claude Code. ([overview](https://code.claude.com/docs/en/agent-sdk/overview), [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript))
- **License:** Anthropic Commercial Terms.
- **Auth:** an API key. claude.ai login is not allowed in third-party products (overview).
- **Naming:** "Dixi, powered by Claude" is fine; we must not call it "Claude Code".
- **Options we rely on:**
  - `query()` with an AsyncIterable prompt: one warm process, with `interrupt()` and `setModel()`;
  - `systemPrompt` as our own short string;
  - `mcpServers` with `createSdkMcpServer` and `tool(name, desc, zod, handler)` for in-process Dixi tools;
  - `canUseTool`, `hooks.PreToolUse` and `PostToolUse`;
  - `allowedTools` / `disallowedTools`;
  - `maxTurns`, `maxBudgetUsd` (a client-side estimate), `abortController`;
  - `includePartialMessages`;
  - `settingSources: []` (ignore the user's own Claude settings).
- ⚠ **New dependencies:** `@anthropic-ai/claude-agent-sdk` and `zod`.
  - The fallback with no new dependency is today's `hive.js` route: `claude -p --input-format stream-json --output-format stream-json --mcp-config …`.
  - That route costs us a separate stdio MCP server process for Dixi's tools. Decide in M0.
- **STT:** keep Deepgram Flux. It gives word-level confidence and no n-best list.
  - Apple SpeechTranscriber has an alternatives preset and `transcriptionConfidence`, on-device.
  - The pick waits for WER on corrected `refs.tsv` (offline, free: `eval/hearing/score.mjs`).
  - The agent gets the transcript, low-confidence words marked like `[bisk?]`, and alternatives when the provider has them.

## 2. Components (in words)
1. ⌥Space down → **context snapshot** (existing `capture.js` + `mac.js`): front app bundle ID, window title, URL, selection, clipboard, focused element. Taken *before* the mic opens.
2. **STT** (`voice.js`/`deepgram.js`) → transcript plus confidences.
3. **Agent** (new `main/agent.js`, ~150 lines): one warm SDK session.
   - The user message = transcript + context, at most ~600 tokens.
   - The model picks a tool, Dixi runs it, and the result is returned to the model. This repeats until it finishes and checks the result.
4. **Tool ladder, cheapest first**, all exposed as in-process MCP tools that wrap code Dixi already has:
   1. `quick` (answers in code);
   2. `open_url` / `site_search` (`resolve.js` templates);
   3. `run_jxa` / `run_shortcut` (`mac.js`, `desktop.js`);
   4. `files_find` (`files.js`);
   5. `calendar` (`calendar.js`);
   6. `bash`, allowlisted;
   7. `ax_press` / `ax_focus` (`input.js`);
   8. `page_*` in Dixi's own browser (`pagekit.js`);
   9. `screenshot` + `click` (the computer-use code in `everywhere.js`) only last.
   - Built-in Claude Code tools stay off except WebSearch/WebFetch (`tools:` list).
   - Gmail/Drive MCP connectors come later and are optional.
5. **Policy layer** (hooks, Sentinel-style): every tool call passes `PreToolUse` → allow / ask / deny. Then `PostToolUse` → `activity.jsonl`.
6. **Island** shows stream events as they arrive ("Opening Gmail…"), then one final line. The mic is never blocked: a new ⌥Space calls `interrupt()`.

## 3. Speed and cost (estimates, measured in M0)
Assumptions:
- Prices are Haiku 5.5 at $0.10 / $0.50 per MTok and Sonnet 5.5 at $2 / $10, with cache reads at 0.1×.
- The fixed prefix (prompt + tool schemas) is ~3k tokens, cached.

| Class | Example | Model | Turns | p50 / p95 target | $/command |
|---|---|---|---|---|---|
| Instant | "what's 15% of 80" | none (`quick`) | 0 | 0.1 / 0.3 s | 0 |
| One action | "open my Gmail" | Haiku | 1–2 | 1.5 / 3 s | ~$0.001 |
| App action | "make a note: call mom" | Haiku | 2–3 | 2.5 / 5 s | ~$0.002 |
| Multi-step / low confidence | "find the PDF Sam sent and email it to Jo" | Sonnet | 4–8 | 8 / 15 s | ~$0.02–0.06 |
| Screen fallback | an unknown app with no AX | Sonnet + screenshots | ≤10 | 12 / 20 s | ~$0.10–0.30 |

- **Default model:** Haiku. Switch with `setModel(Sonnet)` when any word's confidence is under 0.6, when the plan has 3 or more steps, or when Haiku fails once.
- **Hard caps per command:** 20 s (abort), 10 tool calls (`maxTurns`), `maxBudgetUsd: 0.25`.
- **Fast lanes:** built only from real `activity.jsonl` p95 numbers, never guessed.

## 4. Security model
- **Content is data.** The system prompt says so, and tool results are wrapped in `<content>`. If text inside content asks for an action, `canUseTool` turns it into an island question.
- **Bash:**
  - the `PreToolUse` allowlist covers `open`, `mdfind`, `osascript` (allowlisted scripts only), `ls`, `cat`, `mv` (into `~/_to_delete` only) and `shortcuts run`, working only in home, Desktop, Documents, Downloads and Dixi Tasks;
  - no `sudo`, `rm`, `curl | sh`, `npm`/`pip`/`brew install`;
  - `disallowedTools: ["Bash(rm *)", "Bash(sudo *)"]` as a second wall.
- **Deleting** = moving to `~/_to_delete`.
- **Send, spend and delete** only run when the user has turned on the matching setting (existing `allowSend` / `allowDelete` prefs plus a new `allowSpend`). Otherwise they are held for an island tap.
- **Logging and secrets:**
  - every command goes to `activity.jsonl` with the transcript, tool, args (secrets removed), result and ms;
  - no `.env` or cookie values ever enter the prompt;
  - browse-agent sign-ins stay inside the tools;
  - `guardian.js` scam tripwire stays in front of `page_*` and `open_url`.
- **Limits of this model:** with no VM, isolation is the allowlist plus hooks, not a sandbox. Claude Code's own sandbox setting on macOS is checked in M0.

## 5. Dixi modules: keep / delete
- **Keep:**
  - hearing and display: `mic`, `stt`, `deepgram`, `voice`, `audiodump`, overlay/island;
  - context: `capture`, `mac`;
  - abilities that become tools: `desktop`, `input`, `files`, `calendar`, `quick`, `resolve`, `pagekit`/tabs;
  - support: `guardian`, `activity`, `memory`, `skills`, `bridge`, `doctor`;
  - the eval folders.
- **Delete once M3 passes:**
  - `plan.js` (Haiku planner);
  - `renderer/core/agent.js` (browser agent and escalation);
  - the routing in `interpret.js` and `execute.js` (their mechanics move into tools);
  - the tier routing in `providers.js` (keep `chat()` for `quick`);
  - `hive.js` (folded into `agent.js`);
  - the loop in `everywhere.js` (keep its screenshot, click and held-back helpers as tools and hooks).
- **Expected:** about −4k lines.

## 6. Milestones (each stops for your approval; the gates are live runs **you** start)
The held-out sets are new commands, not used while building, mixed across apps, web, files, calendar and multi-step. Neither text nor audio is reused from development.

| # | Build | Gate | Token cap |
|---|---|---|---|
| M0 | `agent.js` spike with 3 tools (context, `open_url`, `run_jxa`); typed commands only. SDK vs CLI decision. Mac sandbox check. | 20 held-out typed commands: 16 or more succeed and are checked. Warm p50 under 3 s on one-action commands. | 300k tokens / $2 |
| M1 | ⌥Space → agent behind setting `agentMode`; island progress; all hooks (allowlist, gates, log, `_to_delete`). | 40 held-out spoken commands: 80% or more succeed, 0 unsafe actions, listening never blocked. | 1M / $5 |
| M2 | All Mac tools on the ladder; Sonnet escalation; computer use last; STT confidence into the prompt. | 60 held-out spoken commands: 85% or more succeed, p95 at or under 20 s, median cost logged per class. | 2M / $10 |
| M3 | Delete the old pipeline; fast lanes only where the logs show too slow. | Same 60 plus a fresh 20, no drop; `npm test` green. | 500k / $3 |

- **Development tests:** unit tests with a mocked SDK and `DIXI_FAKE_AUDIO`, no paid APIs.
- **Live gates:** the ElevenLabs spend ledger is never touched.
