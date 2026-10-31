# Dixi codebase inventory

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.

---

# Dixi: factual inventory (branch `feat/where-dixi-is-going`, clean tree, HEAD `8dac74a`)

I did not read `.env`. All paths are under `/Users/jaz/dixi`. "(inference)" marks my own reading, not something the repo states.

**Docs that disagree with the code.** Several docs describe an older stack:
- `README.md` and `electron/README.md` say the stack is Groq + Deepgram and that there's an "on-device model". `README.md` also mentions `test/e2e/cases.spec.js`. None of that is current.
- `electron/README.md` lists `siteActions.js` and `text.js`, which no longer exist.
- The Settings sheet (`electron/src/renderer/index.html:93-94`, `app.js:259-262`) still shows only "Groq (AI)" and "Deepgram (voice)" key rows.
- `ABOUT.md`, `ANALYSIS.md` and `.env.example` match the code: Cerebras + Claude + ElevenLabs, with Deepgram as fallback.
- `docs/PLAN.md` is marked historical (from the deleted Swift app).
- `docs/audit/*` audit the 2026-10-16 baseline, and many of its file references are now gone.

---

## 1. What it does today, end to end

Dixi is a desktop browser you talk to (`ABOUT.md`). The current flow:

1. **Mic.** The mic is always on.
2. **Speech to text.** Streaming, run in the main process.
3. **Wake word.** "Dixi", followed by a 10 s window where follow-ups don't need it.
4. **Splitting.** Speech is split into clauses while you talk, and finished clauses run in spoken order.
5. **Understanding.** A regex fast path, then the hard-coded demo lines, then a parse cache, then one strict-JSON LLM call. That call is checked against the actual transcript and escalated to a stronger model if it fails.
6. **Doing.** The deterministic executor (`execute.js`) acts on real sites through an isolated-world page toolkit (`pagekit.js`), and checks each step after it runs.
7. **Answering.** Answers are spoken through ElevenLabs TTS, with the system voice as fallback.

**What it can do:**
- open sites (name resolved by evidence) and search them
- shop: order, add to cart, options, cart, quantity, remove, checkout (stops at sign-in or payment)
- media controls, scroll, back/forward, tabs, zoom, click by name
- questions about the page (grounded with a verified quote) or the world (Claude + web search)
- a fallback tool-calling agent

**`plan.md`** (2026-10-24) is the forward plan:
- Target users: older adults, tremor, low vision, low mobility.
- Step 0: fix failures seen on unseen sites.
- Then: Guardian (scam/dark-pattern firewall in code), Skills (record once, replay with no AI, self-heal), Simple View (huge type, multilingual).
- Back pocket: Arduino "Dixi Puck", MCP server, offline models, caregiver co-pilot.
- None of these are implemented (grep finds nothing).

**`DEMO.md`** lists three verified demo scripts: Apple iPhone 18 + AirPods, YouTube lofi, Amazon earbuds.

---

## 2. Tech stack

- **Electron 44.7.2.** Plain ESM JavaScript: no TypeScript, no bundler, no linter.
- **Dependencies:** `dotenv` 18.0.8 and `ws` 8.18.3 only. Dev: `@playwright/test` 1.64.1 (`electron/package.json`).
- **Scripts:** `start` (`electron .`), `test` (`node --test test/unit/*.test.js`), `test:e2e` (playwright), `live`, `demo`, `eval`, `stt`, `refresh-apple-catalog`, `refresh-blocklist`.
- **No packaging:** no electron-builder, no signing, no Info.plist or mic entitlement.
- **Launch:** `cd electron && npm start`. Keys come from `.env` at the repo root or in `electron/` (`src/main/config.js:12`).

| Layer | Files |
|---|---|
| Main | `src/main/main.js` (window, IPC, TTS, web answer, search discovery, screenshots, traces, `dixi://`), `providers.js` (LLM router, spend), `stt.js` (ElevenLabs), `deepgram.js`, `resolve.js` (site resolver), `speakable.js`, `config.js` |
| Preload | `src/preload/preload.cjs`: a `window.dixi` bridge; no keys cross it |
| Renderer | `app.js`, `index.html`, `styles.css`; `core/` (`voice`, `interpret`, `execute`, `llm`, `agent`, `pageQA`, `catalog`, `demo`, `learn`, `prompts`); `ui/` (`tabs`, `pagekit`, `mic`, `mic-worklet`, `speaker`, `mascot`, `icons`) |

**Window and tabs:**
- One BrowserWindow (1400×900) with `contextIsolation`, `sandbox` and `webviewTag` (`main.js:100-117`).
- Tabs are `<webview>` elements in partition `persist:dixi-tabs`, with no preload and no Node.

**Tests:**
- **Unit:** 11 files under `test/unit/`, 72 `test()` calls (several loop over cases), using `node:test`.
- **E2E:** `test/e2e/app.spec.js` with 8 Playwright `_electron` tests against live services. One plays `fixtures/voice-youtube-lofi.wav` as a fake mic.
- **Eval harnesses** in `electron/eval/`:
  - `run.js` runs a seeded fake web (`world.js` + `server.js`) in text/oracle/oracle-url attribution modes.
  - `live.js` runs on real sites.
  - `demo-voice.js` speaks lines with macOS `say`.
  - `audio.js` is the STT bake-off.
  - `harness.js` launches the app un-automated through an env-gated localhost control hook (`main.js:173-191`).

---

## 3. The voice loop

**Mic** (`ui/mic.js`, `ui/mic-worklet.js`):
- `getUserMedia` with echo cancellation, noise suppression and auto gain.
- A 16 kHz AudioContext; the worklet makes 1280-sample (80 ms) Int16 chunks. A comment says 100 ms, which is stale.
- Chunks go over IPC `deepgram:audio` to the main process.

**STT (streaming).** Picked in `main.js:52-56`:
- **Default when `ELEVENLABS_API_KEY` is set:** ElevenLabs Scribe v2 Realtime (`stt.js:39`):
  - `model_id: scribe_v2_realtime`, `commit_strategy: vad`, `vad_silence_threshold_secs: 0.9`, `language_code: en`.
  - Up to 50 keyterms of at most 20 characters each.
  - Its messages are translated into Flux-style `TurnInfo` events, but only `Update` and `EndOfTurn`. There is no Eager, StartOfTurn or TurnResumed.
  - Keyterms are fixed per connection (`stt.js:72`).
  - Falls back to Deepgram for the session if quota or auth fails.
- **Otherwise:** Deepgram Flux v2 (`deepgram.js:9-17`):
  - `flux-general-en`, `eot_threshold 0.7`, `eager_eot_threshold 0.4`, `eot_timeout_ms 1500`, keyterm "Dixi".
  - Live `Configure` keyterm updates are supported.
- **Keyterms** (`voice.js:162-166`): "Dixi", "Hey Dixi", Apple catalog names, learned site names, open tab titles.

**Wake word:**
- Matched by consonant skeleton, so "dixi", "dixie" and "dicksy" all become "dks" (`interpret.js:77-78`).
- Only counts at the start of what's heard or after a sentence break, after up to two greeting words (`voice.js:16-30`).
- Follow-up window is `followUpMS = 10000` (`voice.js:90`).
- Can be turned off in Settings (localStorage `dixi.requireWakeWord`).
- (inference) The skeleton could also match words like "decks" or "ducks".
- Speech that is mostly non-Latin script is dropped (`voice.js:206`).

**No push-to-talk or hotkey.** There is no `globalShortcut` anywhere. Controls are a mic toggle button, Esc (stop, then reset), and the caption's esc button.

**Acting while you talk** (`voice.js:236-273`, `progress`):
- `splitClauses` splits on "and/then/…" or punctuation followed by a command verb.
- Earlier clauses dispatch right away.
- The last clause runs after a 550 ms pause (`settleMS`) or at end of turn.
- Understanding starts speculatively at a 250 ms pause (`specMS`).
- Shopping clauses wait for the final transcript.
- Half sentences carry over to the next turn (1.2 s or 2.5 s timers).
- Known sites are preconnected (`net:preconnect`), and `executor.prefetch` resolves the site and finds its search URL early.
- A new command cancels the running one (`dispatch`, `voice.js:316`).

**TTS** (`main.js:257-272`):
- ElevenLabs REST `/v1/text-to-speech/{voice}`, model `eleven_turbo_v2_5` (override with `DIXI_TTS_MODEL`).
- Voice is Matilda `XrExE9yKIg1WjnnlVkGX` (override with `DIXI_VOICE`), `mp3_44100_128`, speed 0.95.
- Text is capped at 400 characters and passed through `speakable()`, which spells out numbers.
- **Not streamed:** the whole MP3 is fetched (8 s timeout), then played (`speaker.js:33-42`).
- Fallback is `speechSynthesis` at rate 0.95.

**Barge-in exists** (`voice.js:195-200`). While Dixi is speaking:
- "stop" or "cancel" cancels everything.
- The wake word, or any speech that isn't Dixi's own echo, stops the speaker.
- Echo means a longest-common-subsequence match of at least 75% with Dixi's last line (`isEcho`), plus a 1200 ms tail (`speaker.js:5`).
- This fixes audit item A7.

**Latency (measured):**
- `eval/out/live-full-1.json` (Oct 23, 97 steps): time to first navigation median 956 ms, p90 3.1 s. Step done median 4.2 s, p90 10.0 s. 20 of 97 steps used zero LLM calls.
- `live-unseen-1.json`: first navigation median 239 ms. Done median 3.2 s, p90 56 s.
- STT bake-off `stt-7.json` (Oct 16, 16 clips each): median endpoint 998 ms for Flux vs 5762 ms for Nova-3. I can't tell how its WER field is computed; the values (~0.5–0.67) look implausible, so don't rely on them.

---

## 4. LLM layer

**Every call goes through the main process.**
- Path: renderer `LLM` (`core/llm.js`) → IPC `llm:chat` → `providers.chat()` (`providers.js:186`).
- `llm:chat` checks a model allowlist and caps `max_tokens` at 2048 (`main.js:205-212`).
- Retries: 2 for 5xx/529/network errors, and 1 for a 429 whose retry-after is 2 s or less.
- Spend caps: default $25 total (`DIXI_SPEND_CAP`), plus optional per-provider caps.
- An optional record/replay cache exists for evals (`DIXI_LLM_CACHE`).

**Providers** (`providers.js:17-27`):
- **Cerebras** (OpenAI-shaped). Models come from `/v1/models` at startup; `ANALYSIS.md` lists `gpt-oss-120b` and `qwen-3.8-27b`.
- **Anthropic Messages API:** `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5`.
- **Groq:** only reachable through a tier override; no default tier uses it.

**Tiers (`DIXI_MODE=hybrid`, the default)** (`providers.js:40-56`):

| Tier | Models | Used where |
|---|---|---|
| plan | Sonnet 5.5 | Parsing shopping commands (`interpret.js:355-365`) |
| fast | Cerebras #1, #2 (hedged at 450 ms) | Parsing everything else; picking cart lines |
| strong | Sonnet | Parse failed its checks; agent escalation |
| hard | Opus 5.5 | Strong failed too (agent; shopping escalation) |
| agent | Cerebras ×2 | Fallback agent's next move |
| answer | Cerebras, then Haiku (hedged at 1500 ms) | Page Q&A (`pageQA.js:52`) |
| vision | Sonnet, Haiku (Haiku sorted first) | `visualPick` (`execute.js:117-137`) |
| check | Haiku | **Defined but never called.** `finalCartCheck` and `unexpectedPage` escalation flags are also unused. `.env.example`'s "Claude for cart verification" isn't wired up. |

**Other calls:**
- `answer:web` (`main.js:275-299`): Claude Haiku 5.5 with the `web_search_20250305` tool (`max_uses: 1`). Used when the page can't answer, or the question is timely or about specs.

**Format:**
- Parsing uses strict JSON schema output (`INTENT_SCHEMA`, `interpret.js:16-33`). It's mapped to Anthropic `output_config.format` (`providers.js:295-296`).
- Agent tools are OpenAI function tools with `strict: true` (`llm.js:20-28`): click, type_text, scroll, search_site, go_back, wait, done. They're converted to Anthropic tools with `cache_control`.
- Forced `tool_choice` is used only on Haiku, because Sonnet and Opus 5.5 return 400 on it (`providers.js:260, 301`).
- Thinking is kept minimal: Sonnet `between_tools`, Opus `effort: low`, Haiku disabled.
- Cerebras `reasoning_effort`: qwen `none`, gpt-oss `low`.
- Prompt caching is on for the system prompt and tools.

**No streaming anywhere.** `ANALYSIS.md` says streaming was "measured, skipped".

**Routing:**
- There is no LLM classifier.
- Routing is the `SHOPPING` regex (`interpret.js:339`) plus the `LLM.decide()` escalation router (`llm.js:138-158`).
- `validate()` (`interpret.js:276-329`) rejects names or queries that weren't actually said.

**Paths that skip the LLM:**
- `fastPath()` (`interpret.js:221-256`): about 33 control regexes (media, scroll, nav, tabs, zoom, cart, checkout, sign in, quantity), "buy/add/remove it", "add the first one", "make it N", nth result, "open <learned name>", and multi-clause commands where every clause is fast.
- A plain question goes straight to `ask_page`, which skips parsing but still calls the LLM to answer.
- Hard-coded demo lines (`core/demo.js`), including a canned iPhone 17 vs 16 answer.
- `ParseCache` (`core/learn.js`): host + normalized text, 300 entries in localStorage, stores only parses whose steps all succeeded.
- Apple catalog shortcut (`core/catalog.js`).
- Learned site registry and search templates.

---

## 5. Browser automation

**No Playwright or CDP in the app.** It drives Electron `<webview>` tabs (`ui/tabs.js`).

**Page scripts:**
- Run via the main-process handler `tab:exec`, which calls `webContents.executeJavaScriptInIsolatedWorld(1001, …)` with an 8 s timeout (max 15 s) (`main.js:228-243`).
- **Pages whose CSP refuses the isolated world fall back to the page's own world**, where the page can see and tamper with `window.__dx`.
- `dxCall()` prepends the whole ~40 KB `PAGE_LIB` to every call; it returns early if already injected (`pagekit.js:576`).

**Real input:**
- Typing uses `webview.insertText`.
- Clicks and keys use `sendInputEvent`, so they arrive as trusted events (`tabs.js:166-192`).

**Finding elements** (`ui/pagekit.js`):
- Role plus accessible name (aria-labelledby, aria-label, label[for], alt, title, placeholder, innerText).
- Walks open shadow roots and same-origin iframes.
- Stable numeric refs via a WeakMap.
- Generic helpers: `findSearch`, `results`, `findButton(regex)`, `cartLines`, `options`/`choose`, `media`, `identity`, `loginWall`, `botWall`, `storePicker`, `elements` (up to 70, viewport first, for the agent).
- Executor vocabulary is English-centric regexes (`execute.js:18-53`).

**Purchase gate** (`pagekit.js:52-67`):
- Every toolkit click runs `gate()`. An `IRREVERSIBLE` regex on the element's accessible name returns `confirm: <name>`. It covers place/submit/complete order, confirm and pay, pay, 1-click, send, delete, transfer, and a few Spanish words.
- The executor's `confirmThen` then asks "Should I press X?" out loud and waits for a spoken yes (`execute.js:932-938`; `voice.confirmAction`, 25 s timeout).
- Remove-from-cart bypasses the gate (`force=true`, `execute.js:792`).
- (inference) Plain "Buy now" is not in `IRREVERSIBLE`. `do_checkout` asks before pressing it (`execute.js:713`), but an agent or `do_click` press of "Buy now" would get through.
- `SENSITIVE` fields (password, `cc-*`, one-time-code, card/cvv/otp names) are never typed into (`pagekit.js:54, 556-560`; `agent.js:132`).

**Checkout and sign-in handoff:**
- `do_checkout` → `atCheckout()` (`execute.js:918-929`) stops at sign-in (`SIGNIN_PATH` or `loginWall`), or before a "Place order" button, or "before payment", and says so.
- "sign in" takes you to the sign-in page, then hands control to you (`execute.js:1059-1070`).
- Bot walls (captcha, PerimeterX, DataDome, Arkose, `/checkpoint`) are handed over, never solved (`execute.js:76-78`, `pagekit.js:519-523`).
- Store and location pickers are also handed over.

**Proof-of-action checks:**
- **Open:** the page's identity (title, og:site_name, app name, logo, host) must match, and the result is recorded against the registry (`land`, `execute.js:181-205`).
- **Search:** the URL must carry the query (`searchLanded`).
- **Add to cart** (`pressAdd`, `execute.js:599-665`): the cart count goes up, an "added to cart" message appears, a cart page shows lines, or the cart text changes. Failing those, the cart is read in a hidden background tab (`inCart`).
- **Remove:** the count drops, a "removed" message appears, or the line is gone (`lineGone`).
- **Quantity:** the header badge or count moves the right way.
- **Play:** a `<video>` is no longer paused.
- Upsells are declined ("No thanks"). Product options are answered for up to 16 rounds, defaulting to "no paid extras".

**Visual fallback** (`execute.js:117-137`, `visualPick`):
- Sends a screenshot (`capturePage`, ≤1280 px, JPEG q50) plus a numbered element list with coordinates to the vision tier, with a 5 s cap.
- Used for search box, add button, cart, checkout, quantity, and click.
- Known failure: `UnknownVizError` (`plan.md` §3; `live-unseen-1.json`).

**Site resolution** (`main/resolve.js`):
- Order: learned registry → model URL guesses + `www.<name>.com` → Brave Search (if keyed) or DuckDuckGo HTML → Wikidata "official website".
- A candidate is accepted only if the page itself names the site. Two equal fits → ask the user.
- Sites that refuse background fetches are loaded in a hidden BrowserWindow (at most 2 at once).

**Search:** learned URL template → OpenSearch or GET-form template read from the home page HTML (900 ms race) → type into the page's search box.

**Ad blocking:** StevenBlack hosts list (73,631 lines) blocks subresources (`main.js:149-160`).

---

## 6. Memory, desktop control, plugins

**Persistence:**

| What | Where |
|---|---|
| Learned sites (name, aliases, URL, host, search template, ok/fail; 2 failures evicts) | `userData/registry.json` |
| Parse cache (300) | localStorage `dixi.parseCache.v2` |
| Wake-word setting | localStorage `dixi.requireWakeWord` |
| Spend ledger, discovered models | `appData/Dixi/spend.json`, `models.json` |
| Traces (JSONL) and failure screenshots | `userData/traces/`, only with `DIXI_DEBUG` |
| Cookies and logins | `persist:dixi-tabs` partition |

- There's no memory of user preferences (sizes, stores) or browsing history. `recent` is the last 5 steps, in memory only.
- **Desktop control:** none. The only OS action is `shell.openExternal` for "Open in Browser".
- **Plugin or skill mechanism:** none in the app. "Skills" exists only in `plan.md`. `electron/claude-lessons-learned/` and the `.claude-flow/` folders are developer tooling, not app features.

---

## 7. External services and env keys

| Key / service | Powers |
|---|---|
| `CEREBRAS_API_KEY` (Cerebras chat + `/v1/models`) | fast, agent and answer tiers |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (Messages + `/v1/models` + web_search tool) | plan, strong, hard, vision, answer fallback; web answers |
| `ELEVENLABS_API_KEY` | STT (Scribe v2 Realtime WebSocket) **and** TTS (turbo v2.5) |
| `DEEPGRAM_API_KEY` | Flux STT (default when there's no ElevenLabs key; otherwise fallback) |
| `GROQ_API_KEY` (commented out in the example) | optional, only through a tier override |
| `BRAVE_API_KEY` (**code only**, `providers.js:21`) | resolver web search |
| Keyless | DuckDuckGo HTML (resolver), Wikidata API; build time: StevenBlack hosts, Apple Store (catalog) |
| Settings in `.env.example` | `DIXI_MODE`, `DIXI_ESCALATE`, `DIXI_SPEND_CAP`, `DIXI_CAP_CEREBRAS`, `DIXI_CAP_ANTHROPIC` |
| Settings in code only | `DIXI_STT`, `DIXI_VOICE`, `DIXI_TTS_MODEL`, `DIXI_WEB_MODEL`, `DIXI_SEARCH_URL`, `DIXI_FAST/PLAN/STRONG/HARD/AGENT/ANSWER/VISION/CHECK`, `DIXI_DEBUG`, `DIXI_EVAL`, `DIXI_LLM_CACHE(_DIR)`, `DIXI_FAKE_AUDIO`, `DIXI_USER_DATA`, `DIXI_CONTROL_PORT/TOKEN` |
| Website (`website/.env.example`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `NEXT_PUBLIC_ADMIN_EMAIL` (waitlist); hosted on Vercel |

---

## 8. UI

**The window (`index.html`, `styles.css`):**
- Webview tabs fill the window.
- **Start page:** marble background, the mascot with live SVG eyes that follow the cursor, a "Dixi" wordmark (88 px / weight 800), "Just say what you want.", and three example commands.
- **Live caption:** a black "Dynamic Island" docked **at the bottom**, above the bar (`bottom: 84px`). `ABOUT.md` says "top". It has `pointer-events: none` except the esc button, and is `role=status aria-live=polite`.
- **Bottom bar:** "more" menu (AI Agent, Settings, New Tab, Open in Browser, next/previous tab), back, a typed command/URL pill, mic toggle (red when listening), send/stop.
- Agent log sheet, Settings sheet, and a result toast at the top.

**States shown:**
- Caption text: "Voice off" / "Say 'Dixi' + a command" / "Listening to you" (pulsing red waveform) / "Listening".
- Live transcript in 24 px bold, greyed when the words weren't addressed to Dixi.
- Step list: queued dot, running spinner, done green check, failed grey arrow (deliberately no red ✕).
- Answer card with a source badge ("From this page" / "From a web search" / "General knowledge" / "Not confirmed") and the quote.
- Mascot poses: sleep / curious / happy / nod (`app.js:111-117`).
- **There's no dedicated "confirming" or "thinking" visual.** A confirmation is a spoken question shown as the activity line (`voice.ask`).

**Visual language: "marble and glass"** (`styles.css:1-30`):
- Grayscale: bg `#f5f5f7`, ink `#1d1d1f`, secondary `#58585c` (AA contrast).
- Red `#ff453a` only for recording; green `#30d158` only for done.
- Light glass `rgba(255,255,255,.55)` with blur 24 / saturate 180; 28 px radius.
- SF system font stack; marble webp textures.
- Mascot is a marble figure with a laurel wreath.

**Branding (`branding/`):**
- `linkedin-square.jpg` and `linkedin-vertical.jpg`: the marble mascot, "Dixi", "The web, hands-free."
- `Branding_iOS/iPad_Preview.png` (+ `.xcf`): the **old dark Swift-era UI** ("Where to?", "Search, URL, or ask AI…", Agent pill).

**Accessibility already present:**
- `prefers-reduced-motion` and `prefers-reduced-transparency` fallbacks, 2 px focus-visible rings.
- ARIA labels, roles and `aria-pressed` on controls.
- Esc to stop or reset; typed input as an alternative to voice.
- Numbers spoken the way people say them.

**Missing for the target users** (my assessment):
- Base font is 14 px, icon buttons are 36 px, plan text is 15 px.
- No text-size, high-contrast or large-type setting.
- No switch access.
- English only.

---

## 9. website/ and congressionalappchallenge/

- **`website/`**:
  - The marketing site: Next.js 15.5 static export, React 19, TypeScript, Tailwind v4, Motion, shadcn Button. Hosted on Vercel; README gives dixiai.vercel.app.
  - Content: intro animation, hero with a dark-glass demo window, a self-shuffling use-case deck, "How it works", and a **waitlist** writing to an insert-only Supabase table (`supabase/waitlist.sql`), with a password-gated `/admin` page.
  - Playwright contrast and a11y checks; Python scripts cut the mascot sprites (`DESIGN.md`).
- **`congressionalappchallenge/`**:
  - A near-copy of the site (`dixi-cac-website`, port 3001) for the 2026 Congressional App Challenge.
  - It drops Waitlist, Intro and Admin, and adds `LaunchButton` (a `dixi://open` deep link that only prefills) and a "Why it matters" impact section. Same stack.
  - Its `.vercel/project.json` names the project "dixiai". I didn't check which deployment that is.
- `runic-website/` holds only a leftover `.next` build cache from the rename.

---

## 10. Known weaknesses

**Doc and code drift:** see the top note. `README.md` also claims "an on-device model", but `learn.js` is only a cache.

**Open items in `ANALYSIS.md`:**
- Cookie banners get "Accept all" (`pagekit.js:70-82`).
- Spec answers from model memory are unreliable.
- Amazon `/checkpoint` bot wall (Amazon demo run 4 scored 1/9).
- Streaming was skipped.

**`plan.md` Step 0 (unseen sites, 17/23):**
- Category tiles taken for results.
- Button-group size pickers not seen as choices.
- No sort action.
- Screenshot `UnknownVizError` disables the visual fallback.

**Latest live run (`live-full-1`, Oct 23): 75/97.**
- Amazon shopping 4/9, Chain 4 (Amazon) 0/2, Safeway 1/3, Target 1/3.
- Three "WRONG SITE" results on Apple, including `secure*.store.apple.com`.
- Apple cart remove and quantity checks failed.

**Slow paths:**
- No streaming for the LLM or TTS.
- Shopping waits for the final transcript, then a Sonnet call (1.5–1.8 s measured; Opus 6.4 s).
- Many polling waits: `waitFor` every 150 ms, `pickResult` up to 2.5–6 s, `stableResults` up to 12 s, `pressAdd` up to ~12 s, `waitForDom` quiet up to 1.5 s.
- One serial queue per command.
- ~40 KB of page library re-sent with every toolkit call.
- p90 done time is 10 s (56 s on unseen sites).

**Fragile spots:**
- The gate and executor rely on English name regexes. Gate gap: plain "Buy now" (see §5).
- CSP fallback runs page scripts in the page's own world.
- Hard-coded demo lines and Apple product URLs (`demo.js`) will rot when Apple changes its store.
- The ElevenLabs path has no Eager end-of-turn event and can't update keyterms live.
- The wake-word skeleton could match similar words (inference).
- Background throttling is disabled app-wide (`main.js:23-24`).
- No installer, signing or mic entitlement.
- E2E tests run only against live services (flaky, per audit T1).
- The `check` tier is unused.

**Code markers:** three `ponytail:` notes and no TODOs:
- `pagekit.js:13` (ref map grows for the life of the page)
- `execute.js:680` (`inCart` counts items already in the cart)
- `resolve.js:259` (only tries `.com`)

---

## 11. Size

- **`electron/src`:** 28 files, 5,516 lines, ~357 KB. The code is dense: 99 lines are over 200 characters.
- **Largest files:**

| File | Lines | Size |
|---|---|---|
| `core/execute.js` | 1,102 | 74.7 KB |
| `ui/pagekit.js` | 576 | 40.5 KB |
| `core/interpret.js` | 388 | 29.5 KB |
| `core/voice.js` | 483 | 26.7 KB |
| `main/main.js` | 385 | 25.8 KB |
| `main/providers.js` | 315 | 20.0 KB |
| `main/resolve.js` | 285 | 18.7 KB |
| `app.js` | 309 | 16.7 KB |

- Everything else is under 13 KB.
- **Elsewhere:** unit tests ~800 lines, eval ~2,000 lines, scripts 126 lines.
- **Data:** `apple-catalog.json` 5.6 KB (refreshed 2026-10-18); `blocklist.generated.txt` 1.5 MB.
