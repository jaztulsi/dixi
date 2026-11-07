# OpenDots (CopilotKit, MIT): the agent pathway

Sources:
- github.com/CopilotKit/OpenDots (README);
- the CopilotKit blog "Introducing OpenDots".

It is an open-source take on OpenAI's "Dots" (always-on personal agents).

## Pathway
- **The loop and its transport:**
  - CopilotKit runtime plus **AG-UI**, a protocol that streams messages, tool calls and agent state to the UI;
  - **TanStack AI** for model streaming and server-side tool execution.
  - It works with any OpenAI-compatible model (`OPENAI_API_KEY`, `OPENAI_MODEL`).
- **Voice:** realtime speech over **WebRTC** feeds a **Compute bridge**, which hands the work to "specialist compute agents". So voice is one front door to the same text agent. That is exactly Dixi's shape: STT → text → agent.
- **Tools:**
  - **MCP servers** per Dot, and **Composio** for connected apps (Gmail, Slack, …);
  - **Parallel** (`search.parallel.ai/mcp`) for web research;
  - a read-only page-capture browser service;
  - a per-Dot **computer** (browser, shell, files) from **OpenBot**, a container supervisor. Computer access is **off by default** and permissions are set per Dot.
- **Approval:** human-in-the-loop cards. "Approve & run" gates every MCP tool that isn't read-only; "Approve & save" gates writes.
- **Memory:**
  - threads, meaning messages, tool calls and run events (CopilotKit Intelligence);
  - SQLite for pages and metadata;
  - user-managed Memory plus per-Dot "Automatic Learning".

## What Dixi takes from it
1. **Voice is only an input channel.** No voice-specific planner: the transcript becomes a user message to one general agent.
2. **Read-only tools run freely; anything that writes needs an approval card.** That is the simplest policy that works, and Dixi's island already has a card.
3. **Persist each run's events** (tool calls and results) as the log you can replay and measure from. Dixi has `activity.jsonl` (`main/activity.js`).
4. **Computer control off unless granted.** It sits behind a setting, not on by default.

## What Dixi does not take
- **The container computer (OpenBot):** Dixi acts on *your* Mac, not on a separate box.
- **OpenAI-compatible model plumbing:** Dixi uses Claude through the Agent SDK.
