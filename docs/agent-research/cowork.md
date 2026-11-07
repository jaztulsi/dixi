# Claude Cowork (and Claude Code underneath it): the agent pathway

Sources:
- the pvieito.com teardown (Jan 2026);
- a Hacker News comment attributed to an Anthropic employee;
- the pluto.security analysis;
- Anthropic's Agent SDK docs.

The teardowns are third-party and reverse-engineered, so details may have changed since.

## The whole design in one line
**Cowork is the Claude Code CLI running headless, driven by the desktop app over JSON pipes.** There is no separate model and no separate agent.
The "agent" is Claude Code's own loop: think, call a tool, read the result, repeat until done and checked.

## Pathway, step by step
1. **The desktop app starts the harness.** It runs `/usr/local/bin/claude` (CLI 2.1.15 at teardown time) inside a Linux VM, using Apple Virtualization.framework (Ubuntu 22.04, 4 vCPU, 3.8 GB RAM, ~10 GB disk bundle under `~/Library/Application Support/Claude/vm_bundles/`).
2. **Flags seen:**
   - `--input-format stream-json --output-format stream-json`: one long-lived process that takes user messages on stdin and streams events on stdout;
   - `--model`;
   - `--resume <session>`;
   - `--allowedTools` (Task, Bash, Glob, Grep, Read, Edit, Write, …);
   - `--mcp-config`;
   - `--permission-mode default`;
   - `--plugin-dir …/.skills`.
3. **The host's tools come in as MCP servers.**
   - The app passes its MCP servers with `--mcp-config`, including entries with `"type": "sdk"`. Those are the Agent SDK's in-process servers: the tool's code runs in the app, and calls cross the same pipe.
   - Connectors such as Slack and Atlassian arrive the same way.
   - A built-in `cowork` server adds `request_cowork_directory` and `allow_cowork_file_delete`, so even "may I delete?" is a tool call that the host answers.
4. **Files:** only folders the user mounts (VirtioFS) are visible. The UI maps VM paths back to Mac paths.
5. **Network:** everything goes through a host allowlist proxy (api.anthropic.com, pypi, npm). Other sites return 403 `blocked-by-allowlist`. WebSearch still works because it runs through the Anthropic API.
6. **Isolation:** a bubblewrap sandbox plus seccomp per session, each with its own Linux user.
7. **Real desktop and browser:** computer use runs *outside* the VM, on your real screen (pluto.security, quoting Anthropic). Chrome is reached over MCP ("Claude in Chrome"), not with a browser inside the VM.
8. **Approval:** permission mode `default`. Risky tools stop and ask, and the app shows the question as a card.

## The tool ladder it follows (from the agent paper you pasted, same design)
1. Answer from knowledge.
2. A connector or MCP tool.
3. Search or fetch.
4. Code or shell in the sandbox.
5. A browser.
6. Screenshots and clicks.

Every step re-reads the result. The task ends with a check, not just when the work is produced.

## What Dixi can copy as-is
- The harness: the same `claude` binary in stream-json mode, or the Agent SDK, which wraps exactly that ("a library that runs the Claude Code binary", Agent SDK overview).
- Host capabilities as in-process (`sdk`) MCP tools, permission prompts answered by the host, and one warm process per session.
- **Dixi already does a cut-down version of this:** `electron/src/main/hive.js` spawns `claude -p --output-format stream-json --restricted …` for hard tasks.

## What Dixi cannot copy, and what replaces it
- **The VM bundle** (10 GB, Anthropic's private image). Use instead: the host-side permission callback plus a PreToolUse hook that allowlists Bash, and Claude Code's own sandbox setting. Whether that sandbox setting works on macOS is not verified yet; it is the first check in M0.
- **Claude in Chrome** is Anthropic's extension; I'm assuming its MCP isn't offered to other apps. Use instead: Dixi's own browser, `renderer/ui/pagekit.js` and `tabs.js`, exposed as tools.
- **claude.ai login:** the Agent SDK docs forbid offering it in third-party products. Use instead: an API key.
