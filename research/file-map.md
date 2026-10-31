# File-level implementation map (milestones)

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.
>
> Written while dixi-5b’s gate work was still being edited. dixi-5b fixed the 4 bugs this report found in round 2 (see plan §6b).

---

## Dixi milestone plan: Step 0 through M5

Step 0a is already about 80% built, uncommitted, in the working tree. There are changes in `pagekit.js`, `tabs.js` and `agent.js`, plus a new `test/e2e/gate.spec.js`. Someone is still editing `pagekit.js` (it changed while I was reading it), so I've written 0a as "finish this and fix the gaps", not "build it".

### Where the code contradicts the brief, or has a bug

1. **"Order now" is now blocked, which breaks restaurant orders.** The in-progress gate adds `order now` to `IRREVERSIBLE`. But `execute.js:578` uses an "Order now" button to *start* a restaurant order, and `clickAndWait(start.ref)` ignores the `confirm:` it now gets back. Restaurant adds will quietly fail with "couldn't find an add-to-cart button". The fix is to only gate "order now" on a payment page (`paying()`). `do_checkout` already asks before pressing "Buy now".
2. **A page can fake the whole gate (pre-existing hole).** Some pages refuse Dixi's protected script world, so `tab:exec` (`main.js:233-240`) runs the toolkit in the page's own world instead. The toolkit starts with `if (window.__dx) return;`, so such a page can plant a fake `window.__dx` whose `clickRef` returns `'ok'`, and the gate never runs.
3. **There is no screenshot crop to remove.** `plan.md` says "retry without a crop", but `capturePage()` in `main.js:363` is called with no crop. The real problem: the IPC error passes through `Executor.visualPick` and the `run()` catch, so the whole step fails with that error as its message. That is exactly what happened on Death Wish Coffee.
4. **The Flash voice was turned down on purpose.** `main.js:265` says "Flash mumbles", which is why Turbo is the current default. Most of the speed comes from streaming, a pre-opened socket and sentence chunks, not the model. Keep `DIXI_TTS_MODEL` and only default to Flash after an A/B listen.
5. **800 ms for answers can't be hit with ElevenLabs speech-to-text as wired.** Questions only start on `EndOfTurn` (`voice.js:265-268` keeps `QUESTION` off the settle timer). ElevenLabs only ends a turn after 0.9 s of silence (`stt.js:17,39`). Getting there needs a speculative answer started at the first pause and played at settle (550 ms); otherwise report Deepgram Flux and ElevenLabs separately. Adaptive silence pushes the time the other way.
6. **Streaming answers conflicts with the "From this page" check.** `askPage` checks the quote only after the full JSON arrives, and the key order is answer, quote, found. Reordering to `{"found","quote","answer"}` lets the quote be checked before the first spoken word.
7. **There's also a stale-answer bug.** `do_ask_page` (`execute.js:1083`) doesn't pass the cancel signal to `askPage`, so a cancelled question is still spoken when it finishes.
8. **Push-to-talk can't be hold-to-talk.** `globalShortcut` only fires on key-down, so it can only open a listening window, like saying the wake word.
9. **Media keys need Accessibility permission.** Faking them (CGEventPost) isn't possible without it. Desktop Lite can still do system volume with `osascript 'set volume …'` (no prompt). Play/pause works only per app through AppleScript, which asks for Automation permission once per app, not Accessibility.
10. **"Volume up" and "louder" already mean the page's video** (`interpret.js` CONTROLS ~181). Desktop volume needs its own words ("computer/system volume").
11. **Memory can't reach commands as things stand.** `validate()` rejects any item or site word that wasn't in the transcript (`interpret.js:302-307`). The fact text sent to the model has to be added to the text `validate()` checks against.
12. **A mic gate can stop turns from ever ending.** Both speech services decide end-of-turn from the trailing silence. If the gate stops sending audio sooner, the turn never ends. The hangover (how long the gate stays open after speech) must be at least `silenceSecs` + 0.5 s, and at least 1.8 s for Flux, whose end-of-turn timeout is 1500 ms.
13. **Voice repeats already skip the AI.** `ParseCache` replays understandings with zero AI calls, and the executor is deterministic. The real M3 work is the "watch me" recorder; voice repeats only need a "Using your skill · no AI" label on cache hits.
14. **Nothing records `'eot'` traces.** `harness.js:150` reads them, but nothing emits them, which is why `overheadMs` is always null in `eval/out`.
15. **`node:sqlite` with FTS5 works** in Electron 44.7.2 (Node 24.21.0); I checked with an in-memory database.
16. **The gate can't write the audit log itself.** It runs inside the page and can't do file I/O. The first trusted point that sees every verdict is `main.js` `tab:exec`. Things that happen only on the webview (keys, mouse clicks, typing) and confirm answers need a small `audit:write` IPC.

---

### STEP 0

**0a. Finish the gate (S, what's left)**
- **`pagekit.js` PAGE_LIB:**
  - `IRREVERSIBLE`: drop bare `order now` and add it to the `paying()` rule.
  - `enterGate()`: when focus is on a frame Dixi can't read (`IFRAME`), it currently returns `null`, which lets Enter through. Return `'confirm: Enter inside a frame Dixi can't read'`.
  - `dismissOverlays()`: skip when `paying()`. The `ACCEPT` list includes continue/ok.
  - Raw `.click()` calls still skip `gate()`: `choose` ×3, `reveal`, `stepLine`, `stepQty`, the `findSearch` toggle. Send `choose()` and `reveal()` through `gate(el)` (verbs only). `PRICED_BUY` already needs a buy verb, so Apple's priced storage labels still pass.
  - Close the fake-toolkit hole (item 2): use a random name per launch, `const DX = '__dx_' + crypto.randomUUID().slice(0,8)`, spliced in as `${JSON.stringify(DX)}`. PAGE_LIB has no `${` today, so this is safe.
- **`main.js` `tab:exec`:** in the page-world fallback, prepend `var __dxUnsafe=1;`. `gate()` then treats such pages as `paying()`, which fails closed.
- **`execute.js`:**
  - `searchOn` (~335): use what `tabs.key('Return')` returns, and fail with its reason.
  - `addToCart` option loop (~523): when `choose()` returns `confirm:`, skip that value and try the next one. Never auto-pick "Subscribe & Save". If it's what the user actually said, ask first.
- **Test:** extend `test/e2e/gate.spec.js` with three cases:
  - a focused cross-origin iframe makes `enterGate` return `confirm:`;
  - "Order now" on a normal product page returns `ok`;
  - with `window.__dx={clickRef:()=>'ok'}` planted before PAGE_LIB, "Buy now" still returns `confirm:`.
- **Acceptance:** gate spec green. `eval/run.js --seed 7` has zero `order_placed`, the pass rate doesn't drop, and fixture restaurant adds don't change. The `live.js` Apple/Amazon checkout steps still pass. **Metric:** 0 irreversible presses without a yes.

**0b. Mic energy gate (S)**
- **`mic-worklet.js`:** wrap the processor in `if (globalThis.registerProcessor)`, and export `class Gate`:
  - RMS per 80 ms chunk; the noise floor is averaged only while the gate is closed.
  - Opens when RMS > `max(0.006, floor*3)`, then sends a 4-chunk (320 ms) pre-roll buffer first.
  - Stays open for `hangMs` of quiet, and posts `{edge:'end'}` the moment voice stops. That timestamp is reused for latency.
  - `port.onmessage` sets `hangMs`.
- **`mic.js` `start(onChunk, {hangMs, onEdge})`:** pass `ArrayBuffer` messages to `onChunk` and objects to `onEdge`.
- **`voice.js` `start()` (131):** pass `hangMs` = silence × 1000 + 500 (default 1800) and `onEdge` → `trace('speech_end')`.
- **What `stt.js` and `deepgram.js` need: nothing.** One keepalive in `main.js` covers both services and the fallback:
  ```js
  let heard = 0; const HUSH = new Uint8Array(2560);   // 80 ms of silence
  on('deepgram:audio', (c) => { heard = Date.now(); deepgram.sendAudio(c); });
  setInterval(() => { if (Date.now() - heard > 3000) deepgram.sendAudio(HUSH); }, 3000); // ponytail: keeps idle STT sockets open behind the gate
  ```
  Without it, Deepgram closes after about 10 s with no audio, and ElevenLabs has its own idle close. `handleClosed` then restarts the mic, which flickers the mic indicator and can lose the first word. `insufficient_audio_activity` is already ignored quietly.
- **Test:** `test/unit/mic-gate.test.js`:
  - 2 s of zeros produces nothing;
  - a 400 ms tone produces 4 pre-roll chunks, then the tone, then `hangMs/80` quiet chunks, then stops;
  - the edge event fires once.
- **Acceptance:** run `eval/mic-e2e.js` with 20 s of silence followed by "Hey Dixi, open YouTube". YouTube opens and "Hey" appears in the transcript.
- **Metric:** audio sent to speech-to-text over 60 s of idle is ≤ 5% of ungated (add a counter in the main handler), and `stt-wake.js` still gets 7/7. Check the provider dashboards: if ElevenLabs bills by session time rather than audio, the gate saves nothing there, and closing the socket when idle is the fix instead.

**0c. The four unseen-site fixes (where each goes)**
1. **Product-card ranking (S):** `pagekit.js results()` (165-215). Add a product-path signal (`/products?\/|\/p\/|\/dp\/|\/item|\/ip\/|\/itm\//`). Penalize groups whose links are all collection or category paths when product groups exist. Death Wish Coffee picked the "/collections/bagged" tile.
2. **Button-group options (M):** a third collector in `options()` (360-392): `[aria-pressed]`, `[aria-checked]`, `[role=option]`, `button[aria-selected]`, or 2+ short-named sibling buttons under a size/color/width label. `choose()` and `optionTarget()` use one shared selector constant, and "selected" also accepts `aria-pressed`, `aria-selected` and a selected/active class.
3. **Sort (M):**
   - `interpret.js`: add `sort` to ACTS, add `VALUES.sort=['price_asc','price_desc','newest','rating']`, one prompt line, and CONTROLS regexes.
   - `voice.js describe()`: a case for it.
   - `execute.js do_sort()` plus a `pagekit sortBy(re)` that uses a select labelled /sort/, else presses a "Sort" button and then the option.
   - Proof: the URL changes or the first result changes (reuse `stableResults`).
4. **Screenshot (S):** one `capture(wc)` helper in `main.js`, shared by `tab:screenshot` (360) and `trace:shot` (377). Try `capturePage()`; on failure wait 150 ms and try `capturePage(undefined, {stayHidden:true})`; otherwise return `null`, which `visualPick` already handles.
- **Tests:** a `world.js` `results:'tiles'` quirk and an `options:'buttons'` quirk, plus `interpret.test.js`: `fastPath('sort by lowest price')` gives `sort/price_asc`.
- **Acceptance:** the unseen live set goes from 17/23 to at least 21/23.

---

### M1. Voice latency (L overall)

**Streaming TTS (M)**
- **New `src/main/tts.js` `TTSStream`** (built like `stt.js`, using `ws`):
  - Connects to `ENDPOINTS.elevenlabs.tts/{voice}/stream-input?model_id=…&output_format=pcm_24000`. Add the endpoint in `providers.js`.
  - First message: `{text:' ', voice_settings}`. Then `push` sends `{text: speakable(s)+' ', flush:true}`, and the end sends `{text:''}`.
  - Audio is forwarded to the window as `tts:audio(id, bytes)`, then `tts:end`.
  - `warm()` opens a socket early, on `StartOfTurn`.
- **`main.js`:** add `tts:open`, `tts:push`, `tts:end`, `tts:cancel`, `tts:warm`. The REST `tts:speak` (257-272) stays as the fallback.
- **`speaker.js`:**
  - `stream()` returns `{push, end, cancel}`, tied to the current utterance number (`seq`).
  - Playback uses one 24 kHz `AudioContext`, queuing audio chunks back to back. The first chunk to play fires `onFirstAudio`.
  - `stop()` stops every queued chunk and calls `tts.cancel`. `say()` becomes `stream().push(text).end()`.
  - `lastText` collects the whole utterance, because the echo check (`isEcho`, `voice.js:198`) needs it.
  - Barge-in (195-200) needs no change; it already calls `speaker.stop()`.
- **Test:** `test/unit/tts.test.js` with a fake WebSocket server, same pattern as `stt.test.js`:
  - the first message carries the voice settings;
  - a push sends `flush`;
  - two audio frames produce two forwarded chunks;
  - after cancel, the socket is closed and nothing else is forwarded.

**Streaming page answers (M)**
- **`providers.js` `streamChat()`:** only for OpenAI-style providers, which covers Cerebras. Stream with usage included, parse the server-sent events, and record spend from the final usage. For Anthropic, or when the eval record/replay cache is on, it returns `null` and the caller falls back to non-streaming.
- **`main.js` `llm:stream`:** uses the same allow-list as `llm:chat` and sends text pieces as `llm:delta`.
- **`llm.js` `LLM.stream()`:** returns the full text, the same contract as `json()`.
- **`prompts.js`:** reorder the answer keys to found, quote, answer.
- **`pageQA.js askPage({onSentence, signal})`:**
  - `answerSoFar(buf)` reads the answer string out of half-finished JSON (about 10 lines).
  - Speak only once the quote is confirmed on the page. If the answer isn't from the page and the question is about something recent (`TIMELY`) or specs (`SPECS`), don't stream; go to the web answer as today.
  - Otherwise hold the first sentence until it's complete and check it against `NON_ANSWER` before speaking.
- **`execute.js do_ask_page`:** wire this into the speaker stream and pass `this.signal`, which also fixes item 7.
- **Test:** new `test/unit/pageqa.test.js`:
  - `answerSoFar` handles partial input and escapes;
  - with the quote on the page, `onSentence('Hello.')` fires before the stream ends;
  - with the quote missing and a "latest" question, it never fires.

**Hotkeys (S)**
- `main.js` `globalShortcut.register(DIXI_TALK_KEY||'Alt+Space')` and `DIXI_STOP_KEY` (default `Cmd/Ctrl+Shift+Escape`). Unregister everything on quit.
- Preload gets `onHotkey`.
- `app.js`: "stop" calls `escape()` (270). "talk" calls `speaker.stop()` and `voice.set({isAwake:true, awakeUntil:+followUpMS})`, and starts listening if it isn't.

**Adaptive end-of-turn silence (S)**
- **`voice.js`:** an EMA (a running average that favours recent turns) of how often a turn ended too early. Early means a carry-over happened (252-260), a `TurnResumed` arrived (202), or the user corrected themselves ("no wait / actually / I mean"). Store it in localStorage.
- `openParams()` returns `silenceSecs = 0.6 + 0.8p`, kept within 0.6 to 1.4.
- If the value moves by 0.15 or more while idle, reconnect, the same way `updateKeyterms` does.
- **`main.js` `deepgram:open` (355):** pass it through. **`stt.js` (39):** use `opts.silenceSecs ?? this.silenceSecs`. The gate's `hangMs` follows it.
- **Test** (`voice.test.js`): 3 carry-over turns push it above 0.9; 10 clean turns bring it back to ≤ 0.9.

**Progress phrases (S)**
- `voice.js` `handleText` loop (395-413): start a 1200 ms timer before `executor.run` that speaks `describe(step)`. Skip it if the speaker is busy, Dixi is waiting for an answer to a question, or the last phrase was under 5 s ago.
- **Test:** a 1.5 s step says "Opening Zentora"; a 10 ms step says nothing; two slow steps inside 5 s say only one phrase.

**Latency measurement (S)**
- New trace events: `speech_end` (the gate edge), `first_audio` (`speaker.onFirstAudio`), and `eot` (emitted in `handleTurn` on `EndOfTurn`, which fixes item 14).
- `harness.js say()` reports `firstAudioMs = first_audio.t − end`. `live.js` prints p50/p90 split by answer-from-page, fast-path command (`step_start − end`) and web answer.
- **Acceptance:**
  - p50 ≤ 800 ms for page answers (Flux style) and for fast-path commands;
  - ElevenLabs reported separately;
  - barge-in silences the speaker within 150 ms.

---

### M2. Guardian (L)
- **New `src/main/guard.js`:**
  - `skeleton()`: `domainToUnicode`, NFKD and a small table of look-alike letters.
  - `lookalike()` and `brandInside()`, which catches cases like `amazon.com-secure.xyz`.
  - `domainAge()` from `rdap.org`, cached in `userData/guardian/rdap.json`. A stray file with exactly that shape already exists in userData; reuse the format.
  - `badHost()` against the URLhaus list.
- **New `scripts/refresh-guardian.js`** (same pattern as `refresh-blocklist.js`) writes `data/topsites.generated.txt` (Tranco top 10k) and `data/urlhaus.generated.txt`.
- **`main.js`:** load both lists at startup, next to the blocklist (149-160). Add `handle('guard:domain')`. A URLhaus match on a top-level page load is cancelled in the existing `onBeforeRequest` (153).
- **`pagekit` `guardScan({twice})`** reads the page itself:
  - pre-ticked add-ons with a price;
  - countdowns, read twice 1 s apart and only on the page-open scan;
  - "only 2 left" and "people viewing" text;
  - guilt-trip decline links;
  - fees that appear at checkout;
  - auto-renew wording near the main button;
  - tech-support traps: fullscreen, virus wording plus a phone number, alarm audio;
  - gift card, crypto or wire payment requests;
  - `paying()` and `loginWall()`.
- **New `src/renderer/core/guardian.js`:** `onPage(tab)` runs without being awaited. `before(kind)` returns `{block, say, evidence, fix}`.
- **Hooks:**
  - `tabs.js` dom-ready (41) calls `this.onReady?.(tab)`, and `app.js` sets `tabs.onReady` for visible tabs.
  - `execute.js`: `pressAdd` (before the click), `do_checkout`, and `confirmThen` (which covers pay, place and confirm).
  - `agent.js` loop (89): one trusted system message with the findings.
  - The gate also refuses "protection/warranty/insurance + price" upsell buttons.
- **Where findings show:** `voice.set({answer:{text, quote:evidence, guardian:true}})` plus `speaker.say`, and one new branch in `renderCaption` (167-177).
- **Demo pages:** `eval/server.js` gets three hosts: a look-alike store with a countdown and pre-ticked warranty, a fake virus warning, and a gift-card payment page. The test host rules already send every host to the fixture server; `DIXI_TOPSITES` supplies a fixture top-sites list.
- **Test:** `test/unit/guard.test.js`:
  - `skeleton` of a Cyrillic-а "amazon.com" equals "amazon.com";
  - "arnazon.com" is flagged as a look-alike of amazon.com;
  - "amazon.com-secure.xyz" is caught and "amazon.co.uk" is not;
  - age is read from a saved RDAP response;
  - top sites never flag themselves.
- **Acceptance:** a new `eval/guardian.js` finds 3/3 demo pages and blocks pay/checkout until a yes.
- **Metric:** 0 serious findings across the 23 unseen sites plus the Apple/Amazon chains; the page-open scan adds 0 ms to steps; the pre-action scan is ≤ 150 ms p90.

---

### M3. Skills (L)
- **Storage:** `userData/skills/<slug>.json` files, readable and shareable. `main.js` gets `skills:list/save/delete` with slug cleaning like `trace:shot` (382).
- **Recorder (`pagekit`):**
  - `record()` adds capture listeners for click, change and submit inside Dixi's protected script world.
  - `takeRecorded(ms)` is a long-poll through the existing `tab:exec`; no new IPC.
  - `describeEl()` records role, `name()`, text, label, nearest heading, a 5-level structural path (generated-looking ids dropped), position, and link path.
  - Fields that `SENSITIVE()` matches are saved as `{secret:true}` with no value.
  - It refuses to record on pages running in the page world (item 2).
- **New `src/renderer/core/skills.js`:**
  - **Recorder:** re-attaches on each `onReady` and saves what each step proved (path, `cartCount(cartSignal())`).
  - **`compile()`:** produces `{v:1, name, template, slots, autonomy:'confirm', steps:[{act, el, value|{slot}, proved}], healed:[]}`. Typed or chosen values whose words appear in the skill's name become blanks named after the field label, e.g. `{size}`.
  - **`match()` and slot filling:** reuse `findSpan` and `tokens` from `interpret.js`.
  - **Replay:** `findLike` acts only when the score is ≥ 0.75 and at least 0.1 ahead of the runner-up, always through the gated dx calls, then checks the saved proof.
  - **Heal:** `llm.decide` on the agent tier with `compactElementList` and `PICK_SCHEMA`. A successful fix is written into `healed[]` and saved. Two failures: stop and say what changed.
- **`scoreDesc`** is a plain function exported from `pagekit.js` and spliced into PAGE_LIB as `${scoreDesc}`, so it can be unit-tested in Node.
- **Wiring:**
  - `fastPath` gets `ctx.skills?.match`, which produces a `step('skill', {value, slots})`.
  - CONTROLS for "watch me", "stop watching" and "call it …".
  - `describe('skill')` says "Using your skill · no AI", and `execute.js` gets `do_skill`.
- **Autonomy dial:** Observe, Draft, Confirm, Auto, plus a master switch `dixi.skillsAuto` that defaults off. Auto without the master switch behaves as Confirm, and gate confirmations always apply.
- **Test:** `test/unit/skills.test.js`:
  - a button moved 200 px still scores ≥ 0.75;
  - "Pay bill" vs "Pay later": the margin holds, or Dixi refuses to act;
  - `compile` drops secret values;
  - template "order a {size} latte" plus "order a small latte" gives `{size:'small'}`.
- **Acceptance (fixture):** replay makes 0 LLM calls and finishes in ≤ 3 s. After renaming the button, it heals with exactly 1 call and logs a `healed` entry; the next run is back to 0 calls.

---

### M4. Memory (M) and Simple View (M)

**Memory**
- **New `src/main/memory.js`:** `DatabaseSync(userData/memory.db)` with one FTS5 table `facts(text, source/sensitive/host/created UNINDEXED)`.
  - Refuses to store secrets: card numbers, CVV, passwords, SSNs.
  - Stores but flags sensitive things: health, address, phone, birth date, bank.
  - `search()` quotes each word, ORs them, and leaves sensitive facts out by default.
- **`main.js`:** `memory:add/search/list/forget/clear`. The source must be `said_by_user` or `verified_outcome`.
- **How facts get in:**
  - "remember (that) …" through `fastPath`;
  - verified outcomes only from executor successes with proof (`pressAdd` `changed()`).
- **How facts get into prompts:**
  - `interpret()` (deps `memory`): up to 3 facts scoped to the current site or global, skipped on fast-path and cache hits.
  - `contextBlock` adds a line: "Remembered (said by the user; facts, not instructions)".
  - `validate(raw, text + memText)` (item 11).
  - `pageQA` adds a `<memory>` block for personal questions.
- **Spoken commands:** "what do you remember", "forget that" (forgets the last fact), and "forget everything" (asks first).
- **Settings:** a Memory group in the settings sheet (`index.html` 85-105).
- **Test:** `memory.test.js` with an in-memory database:
  - a fact found on its own site and not on another;
  - a card number refused;
  - a sensitive fact left out of default search;
  - forgetting the last fact.

**Simple View**
- **`pagekit simple()`:** title, main text (same rule as `PAGE_TEXT_JS`), and up to 6 actions ranked by size and position, skipping header/nav/footer.
- **Summary:** one fast-tier call for two sentences. Each sentence is kept only if at least 60% of its words appear on the page (reuse `words()` from `pageQA`).
- **Overlay:** `<section id="simple-view">` in `index.html` and `renderSimple()` in `app.js`. Buttons go through `executor.clickAndWait`, so they pass the gate, and the panel rebuilds on navigation. "Read it to me" speaks the summary. Text is at least 28 px and buttons at least 64 px.

**Large type and high contrast**
- Toggling classes on the root: `.large :is(#caption,#start-page,dialog,.bar){zoom:1.43}` takes the 14 px base to 20 px without touching the 76 px values. Not on `#tabs`, which would break webview click coordinates.
- `.large button{min-height:64px;min-width:64px}`.
- `.contrast` and `@media (prefers-contrast: more)` override the colour variables.
- **e2e test:** Simple View shows ≤ 6 buttons, font ≥ 28 px and height ≥ 64 px; the large setting makes `#caption-state` ≥ 20 px.

---

### M5. Plugins (M-L) and Desktop Lite (S)

**Plugins**
- **Layout:** `userData/plugins/<id>/`:
  - `SKILL.md`: front matter with name, description and triggers; the body is the agent's task text.
  - `dixi.json`: `{id, version, hosts:[…], tools:{name:"read"|"write"}, env}`.
  - Optional `mcp.json`: `{command, args}`.
- **New `src/main/plugins.js`:** approval is stored keyed by the sha256 of `dixi.json` + `mcp.json`, so any change needs approving again.
- **New `src/main/mcp.js`:** an MCP client in about 50 lines with no SDK. It speaks newline-delimited JSON-RPC 2.0: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, with a 15 s timeout. The server is spawned with only PATH, HOME and the manifest's env, never Dixi's API keys.
- **Enforcement in `main.js` `plugins:call`:**
  - the tool must be declared in the manifest, and the host must match;
  - a tool counts as read-only only if the manifest says "read" **and** the server's `readOnlyHint` is true (server hints aren't trusted);
  - a write tool returns `confirm:` until the user says yes;
  - output is wrapped as untrusted and capped at 2 KB;
  - every call is audited.
- **`agent.js`:** tools from approved plugins whose hosts match the page are added as `plug__id__tool`. On `confirm:`, call `executor.confirm` and re-call with confirmed. Triggers go through `fastPath`, which runs `agentTask(SKILL body)`.
- **Test:** `mcp.test.js` against a fake MCP server: tools are listed, the read tool works, the write tool returns `confirm:`, and undeclared tools and wrong hosts are refused.

**Desktop Lite**
- **New `src/main/desktop.js`:**
  - **Open an app:** `openApp` matches `*.app` in /Applications, /System/Applications and ~/Applications, then runs `execFile('open',['-a',path])` with no shell.
  - **Volume and mute:** `osascript 'set volume output volume n'` and `'set volume with output muted'`, with the number clamped.
  - **Play/pause and next:** Music or Spotify only, and only if the app is running.
- `desktop:do` handler plus audit.
- `interpret.js`: a `desktop` act whose phrases require "app/computer/system/mac" (item 10).
- **Test:** with `execFile` injected:
  - "Calculator app" runs `open -a` on `/System/Applications/Calculator.app`;
  - an unknown app makes no call;
  - 150 is clamped to 100.

---

### Audit log (S)
- **`main.js`:** an `audit(o)` that appends one JSON line to `userData/audit.jsonl`, always on.
- **Where it's called:**
  - `tab:exec` (228-243) logs results that start with `ok: ` or `confirm: `, with the host. Have `click()` return `ok!:` when forced; existing `/^ok/` checks still pass.
  - A new `on('audit:write')` covers the confirm question and answer, Enter verdicts, Guardian findings, skill runs and heals, and memory changes.
  - `desktop:do` and `plugins:call` call it directly.
- No rotation for now: about 100 bytes per action; rotate at 10 MB if it ever matters.
- **e2e check:** after "place the order" and then "no" on the fixture, `audit.jsonl` has a `confirm: Place order` line and the "no" answer.

### Order and effort
Step 0 first (0a S, 0b S, 0c 2×S + 2×M), with `audit()` built there. Then:

| Milestone | Effort | Reuses |
|---|---|---|
| M1 | L | — |
| M2 | L | `tabs.onReady`, `speaker.stream`, `audit` |
| M3 | L | `onReady`, `${fn}` splicing, the gate |
| M4 | M + M | — |
| M5 | M-L + S | `audit`, the gate |

### Critical Files for Implementation
- /Users/jaz/dixi/electron/src/renderer/ui/pagekit.js
- /Users/jaz/dixi/electron/src/main/main.js
- /Users/jaz/dixi/electron/src/renderer/core/voice.js
- /Users/jaz/dixi/electron/src/renderer/core/execute.js
- /Users/jaz/dixi/electron/src/renderer/ui/speaker.js
