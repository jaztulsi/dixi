# Log

- 2026-11-07 Mac slowdown: the 16 GB Mac ran out of memory (66–383 MB free, 5.6–6.7 GB compressed, 3.1 GB of 4 GB swap; on for 18 days). The memory went to Chrome (~3.5 GB), Cursor, the Claude app, and 4 Claude Code sessions left open since Oct 29 – Nov 2. Dixi was not the cause: 0.6% CPU, ~280 MB, no debug WAVs written. ruflo was not running.
- Fix applied: stopped the 4 stale `claude` sessions with SIGTERM. Compressed memory fell 6.7 → 5.8 GB; swap stayed at about 3.2 GB. Still to do: quit unused apps and restart the Mac.
- Guards: DIXI_DEBUG_AUDIO stays off by default and audiodump prunes WAVs after 7 days. Every eval/test run must start Electron in the foreground and exit, never leaving a dev server running. Close Claude Code sessions when their task ends.
