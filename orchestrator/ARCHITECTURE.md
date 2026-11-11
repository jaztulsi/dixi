# Dixi architecture (as of 51c7da6 plus uncommitted work, 2026-10-31)

Electron app: `electron/`. API keys live in the main process only (`src/main/config.js`, `providers.js`). The renderer never sees a key.

## 1. How a command flows today

There are **two separate pipelines**, and a regex picks between them.

**Input**
1. The mic (AudioWorklet, 16 kHz) streams to **STT**: ElevenLabs Scribe realtime (`main/stt.js`), with Deepgram Flux as fallback (`main/deepgram.js`; chosen at `main/main.js:56`).
2. TurnInfo events reach `renderer/core/voice.js` `handleTurn()`. It strips the wake word "Dixi" (`wakeEnd`, matched by sound), filters echo, and handles stop/protest.
3. **The router**, `voice.js:275`: `everywhere.wants(command)` (`renderer/app.js:121`) sends the command to the Mac path when:
   - Dixi's window is hidden, which it always is in dashboard-first mode (`main.js:113`);
   - or another app has focus and the words match `ABOUT_SCREEN` / `DESKTOP_WORDS` / `COMMAND` (`renderer/core/everywhere-words.js`).
   Everything else goes to the in-app browser.

**Pipeline 1: in-app browser** (renderer)
4. `splitClauses` (`interpret.js:84`) splits on "and/then + verb". Each clause is dispatched as soon as the next one starts (`voice.js` `progress`/`dispatch`).
5. `interpret()` (`interpret.js:347`):
   - `fastPath` (regex) first;
   - then a parse cache;
   - then one JSON-schema LLM call. Cerebras is the fast tier; Claude Sonnet plans shopping commands (`providers.js` MODES.hybrid).
   The prompt is **"a spoken command for a web browser"** (`interpret.js:36`), and its acts are browser acts only.
6. `Executor.run(step)` (`execute.js`) carries out each step:
   - `open` resolves the site name through `resolve.js` (registry, then model URLs, then Wikidata, then a web search);
   - search, order and click run in a `<webview>` tab through pagekit;
   - the fallback is `BrowserAgent` (`agent.js`).

**Pipeline 2: Dixi Everywhere** (main, `main/everywhere.js` `run()` at :635)
7. The **whole utterance** goes through a chain of anchored regex intents, in order:
   - custom commands, mic/careful, the selection key, game, activity, watch, memory, skills, recall/back;
   - `fileIntent` (files.js), the brief, index-my-folder, undo;
   - `desktopIntent` (desktop.js: volume, media, site, window, timer, dark mode, lock, battery, screenshot, Wi-Fi, quit), doctor, tutor, reader;
   - `modeOf` (hive / open / talk / agent), `pressNamed` (AX press by name), `quickAnswer`, `personal_memory`, saved skills, `OPEN_APP` → `input.openApp`.
8. If nothing matched, it takes a **screenshot plus the front-app context**, then runs:
   - `talk()`: Haiku or Sonnet, one image, an answer plus marks;
   - or `agent()`: **Sonnet 5.5 computer use**, up to 40 turns, each turn with a fresh screenshot plus the AX control list (`everywhere.js:346–404`).
9. Every risky click or key goes through `approve()`, a spoken or ⌥Return yes (`everywhere.js:303`).
10. Replies are spoken through `tts:speak`: ElevenLabs Turbo v2.5, with the Mac voice as fallback (`main.js:288`).

## 2. What it can do today, and how

| Capability | How |
|---|---|
| Open an app | `open -a <name>` (`input.js:279`), only if the whole line is "open X" |
| Open a site | `open https://…` (desktop.js `site`), only for "go to x.com" |
| Volume, mute | AppleScript `set volume` (desktop.js) |
| Play/pause/next in Music or Spotify | AppleScript to the app, **only if it is already running** (desktop.js:176) |
| Window snap, center, other screen | JXA System Events (desktop.js:197) |
| Timers, reminders "in N min" | in memory, `setTimeout` (desktop.js:206) |
| Dark mode, lock, battery, screenshot, Wi-Fi, quit app | osascript / pmset / screencapture / networksetup |
| Files: find, open, reveal, move, rename | Spotlight `mdfind` (files.js) |
| Calendar add | from the **screen** only ("add this to my calendar"), read back and approved (calendar.js) |
| Daily brief | Calendar, Reminders, Mail, read-only (brief.js) |
| Any other UI | Sonnet computer-use agent with screenshots (slow) |
| Web: search, shop, play the Nth video, page Q&A | in-app browser pipeline |
| Answers | quick.js in code; Claude Haiku with web search (`main.js:323`) |

## 3. What it can't control yet

- **Several tasks in one command on the Mac path.** There is no splitter. The only splitter is the parallel "hive" one (`everywhere.js:616`).
- In-app commands: search inside Music, play a catalog song, send a Message, create a Note, add a calendar event from words, change a System Settings pane. None has a direct route; all of them need the screenshot agent.
- Media control when the app isn't open yet.
- Contacts lookup ("text my mom").
- Any app-specific action. The browser parser doesn't know Mac apps exist, so "Apple Music" becomes a website.

## 4. Where it is slow, fragile or wrong

| # | Problem | Where |
|---|---|---|
| 1 | Whole-sentence anchored fast paths: any compound misses them all and falls to the Sonnet agent | everywhere.js:683–747, desktop.js:32 (`^…$`) |
| 2 | `OPEN_APP` `^open (.+?)$` swallows "and search lo-fi beats": it opens the wrong name, or opens the app and silently drops the rest | everywhere.js:113, :745–747 |
| 3 | The Sonnet computer-use agent: 3–8 s per turn, a full screenshot after every action plus 300 ms waits, 40 turns max; simple app steps cost several round trips | everywhere.js:362–399 |
| 4 | A screenshot is taken before routing for anything that reaches the bottom of the chain | everywhere.js:750 |
| 5 | A new STT turn **aborts** the run in progress: a pause mid-command kills step 1 | voice.js:280, everywhere.js:638 |
| 6 | The browser parser's prompt is browser-only: "search lo-fi beats on Apple Music" → apple.com, and then the search runs somewhere else | interpret.js:36–68 |
| 7 | Shopping commands are planned by Sonnet (slow), and site resolution can fall back to a web search ("buy a bagel from Safeway" → Google search) | interpret.js:341–367, resolve.js |
| 8 | `splitClauses` misses ";" and "then" without a verb | interpret.js:84 |
| 9 | hold_key: down/delay/up in one osascript; a kill or crash leaves the key held (dixi-cf repro) | input.js `key()` |
| 10 | Flaky unit test: the merge gate is red 5 of 8 runs | test/unit/ingest.test.js:34 |
| 11 | The routing regexes (`ABOUT_SCREEN`, `DESKTOP_WORDS`) depend on window focus: the same words go to different pipelines | app.js:121 |

The fix plan is in [BOARD.md](BOARD.md) §6.
