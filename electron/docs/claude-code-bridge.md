# Connect your Claude Code to Dixi

With this, Claude Code can talk to you out loud through Dixi while you're away from the keyboard:

- **dixi_say**: a short spoken update.
- **dixi_notify**: a card in Dixi's panel, with its title said out loud.
- **dixi_ask**: a spoken question. Your spoken answer (or the Yes/No button) goes back to Claude Code. After 60 seconds of silence it gets "no answer".

The bridge only talks and listens. Claude Code can't click, type or see your screen through it.

## 1. Register the MCP server

Dixi must be running (it creates the socket and the token). Then, in a terminal:

```sh
# every project on this Mac
claude mcp add --scope user dixi -- node /Users/jaz/dixi/electron/bin/dixi-mcp.mjs

# or just the current project
claude mcp add dixi -- node /Users/jaz/dixi/electron/bin/dixi-mcp.mjs
```

Check it with `claude mcp list`, or `/mcp` inside Claude Code. To make Claude Code use it, add a line to a prompt or `CLAUDE.md`, for example: "When you finish a long task, call dixi_notify. If you need a decision and I may be away, use dixi_ask."

## 2. Optional: Dixi tells you when Claude Code is done

Add a `Stop` hook to `~/.claude/settings.json` (all projects) or `.claude/settings.json` (one project):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node /Users/jaz/dixi/electron/bin/dixi-mcp.mjs --notify \"Claude Code finished\"", "async": true }
        ]
      }
    ]
  }
}
```

`Stop` runs every time Claude Code finishes a reply, short ones included. If that's too chatty, register only the MCP server and let Claude call `dixi_notify` itself after long tasks. To hear when Claude Code is waiting for your permission, add a `Notification` hook with `"matcher": "permission_prompt"` and `--notify "Claude Code needs you"`.

`--notify` always exits 0, so it never blocks Claude Code, even when Dixi isn't running.

## How it's protected

- The bridge uses a Unix socket at `~/Library/Application Support/Dixi/dixi.sock`. There's no network port, and the socket is readable by your user only (mode 600).
- Every request carries the token in `bridge-token` in the same folder (32 random bytes, mode 600). A wrong token is refused.
- Dixi speaks at most one line every 2 seconds and 10 lines a minute, so a runaway loop can't flood you.
- Dixi says nothing from Claude Code while it is busy for you: an approval card, a question, or a task.
- Dixi's wake word is removed from anything Claude Code asks it to say.

Settings: `DIXI_BRIDGE_SOCK` points `dixi-mcp.mjs` at a different socket (the token is read from the same folder). `DIXI_USER_DATA` follows Dixi's own test profile.
