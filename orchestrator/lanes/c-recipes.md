# Lane C: direct-route recipes (C2)

Measured 2026-11-01 on the real Mac with `mac.js runScript` and `check` (osascript with an argv list, under the refuse() rules), run from the terminal's node process. **The Dixi app has its own Automation permissions, so a route that hangs here may still work in the app, and the other way round.** Everything the run made was removed again.

| Route | Result | ms | Recipe |
|---|---|---|---|
| Calendar: add an event | ✅ made, then checked with `exists … whose uid`, then deleted | **769** add, 499 delete | `tell application "Calendar"` → `set c to first calendar whose writable is true` → `make new event at end of events of c with properties {summary:…, start date:s, end date:s + 30 * minutes}` → return `uid of e` (the check and the undo use the uid) |
| Notes: a new note | ✅ made, then checked with `exists note id`, then deleted (Recently Deleted) | **487** add, 194 delete | `tell application "Notes" to return id of (make new note with properties {body:"<h1>Title</h1><p>text</p>"})` (the first line becomes the title) |
| PDF: find "the PDF I downloaded today", rename, move to Documents | ✅ through files.js with the undo log, no question; two "undo that" put it back | find **~300 once indexed** (3.4 s for a brand-new file until Spotlight indexed it), rename 10, move 1 | `fileIntent` → `findFiles` (mdfind, kMDItemDateAdded for downloads) → `fileAction(…, { undo })` |
| Music: search **your library** and play | ⚠️ ran fine, but this Mac's library had no match for the query | 125 | `tell application "Music"` → `set r to search library playlist 1 for q only songs` → `play item 1 of r` → `return name of current track` |
| Music: search **Apple Music** (the catalog) and play | ❌ the song opens, but `play` doesn't start it | search 305; open+play gave up at 14 s | `GET https://itunes.apple.com/search?term=q&media=music&entity=song&limit=1` (public, no key) → `open location "music://music.apple.com/us/album/<collectionId>?i=<trackId>"` → `play` does nothing. Needs one AX click on the track's play button, or the Mac isn't on an Apple Music subscription. **Blocker** |
| Messages: send | ⏸ not tried: waiting for the **"Dixi Test" contact** (BOARD §7). Even the read-only `count of accounts` timed out at 10 s, probably a macOS Automation prompt left waiting for this terminal | — | to fill in once the contact exists: `tell application "Messages"` → `send t to participant h of (1st account whose service type = iMessage)`, with h being the Dixi Test number only |

## For the planner
- Calendar and Notes are fast and safe enough to be direct routes (no model, under 1 s). Make the uid or id the undo handle.
- The file routes need no AppleScript at all (files.js). Spotlight lags about 3 s behind a brand-new file.
- Music: try the library search first (125 ms). If it finds nothing, the catalog needs the AX step or a subscription, so tell the user rather than guess.
