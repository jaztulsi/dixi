# Dixi: Full Audit and Fix Prompt (for Claude Code)

**How to run:** open Claude Code in the Dixi Electron app repo and say:
`Read DIXI_AUDIT_PROMPT.md in full and follow it.`

---

## TASK

Perform an expert, end-to-end audit of the Dixi Electron app, then fix it. Goals:

1. Find the MAJORITY of the failure classes that make it misinterpret or mis-execute voice commands, not just the examples below.
2. Cut latency from about 6-7 seconds per command to the budget in Phase 3.
3. Make it genuinely general, not tuned to specific sites or phrases.
4. Find and fix the MAIN systemic causes behind the failures (not the individual symptoms), proven with a stage-by-stage attribution experiment (Phase 2B).
5. Upgrade the model that LISTENS (speech recognition and audio capture, Phase 2C) so it hears commands, names, and the wake word correctly.
6. Upgrade the LLMs that PROCESS the command (model choice, context, prompting, validation, Phase 2D) so interpretation and planning are measurably better.

Quality bar: excellent, not "good enough."

**COMPLETION CONTRACT (read first):**

- Do not stop at the first green test run. Loop: research, implement, test, analyze failures, improve, until every acceptance gate in Phase 6 passes or you have documented exactly why a gate cannot be met with the available models and keys.
- Do not hand control back for re-runs or "please try it now." I will run one final test myself, and it will be hard. Your job is to find and fix problems before I do. Start the research phase (2E) in parallel with the audit using subagents.
- Ask me questions only for: optional API keys and a spend cap (ask once, batched, at the very start), irreversible actions, or true product decisions. For everything else, decide, write the decision in a log, and continue.
- Guard against runaway loops and spend: at most 5 improvement cycles per workstream and my spend cap. If a gate still fails after that, stop that workstream and report plainly what is blocking it.
- Evidence rule: never write "works" or "passes" without showing the command you ran and its real output. Paste scoreboards. If you could not run something, say so.
- It is fine to report a limit honestly (e.g. CAPTCHAs, DRM, sites that block automation). It is not fine to hide a failure or to hard-code around it.

**SCOPE:** the app's logic and Electron architecture (main process, renderer, IPC, STT, interpretation, planning, page observation, actions, status reporting). Do NOT restyle or redesign the UI (truthfulness fixes to the status list are fine). Do NOT touch the website. Work on a new branch and tag the baseline commit first.

## KNOWN SYMPTOMS (examples only; each is a sample of a broader class)

1. "Search lo-fi beats on Apple Music" went to apple.com, then searched YouTube.
2. "Buy me a bagel from Safeway" went to Safeway, then searched Google.
3. "Find me a bagel on the Safeway website" returned "could not find it."
4. "Go to purchase" searched the word "purchase" instead of clicking a buy button.
5. The status list showed a misheard "Briegel menu" for Burger King, duplicated steps, and "Couldn't find that on this page."
6. "Open up Google Classroom" produced a Google search for "up classroom" (the status line read: Google: "up classroom"). Likely causes to verify: the verb "open" was stripped but the particle "up" leaked into the query; "Google" matched as a site/engine alias and swallowed the first token of the multi-word product name "Google Classroom"; the app searched instead of navigating to a known product. Treat this as a whole class: phrasal verbs, alias shadowing, and product-name resolution.
7. Average 6-7 seconds per command.

I already confirmed it is not simply hard-coded to Amazon/YouTube, so look deeper for the real causes.

**These seven symptoms are evidence, not the work item.** The work item is the root causes behind them. Success is measured on the held-out set and on failures nobody has reported yet, not on whether these seven now pass. A fix that only repairs one phrase or one site does not count.

## HARD-CODING POLICY (overrides anything else in this document)

- Nothing about specific sites, products, brands, or phrases may be hard-coded in logic or hand-written in data, with ONE sanctioned exception: the Apple product shortcut (Phase 2G).
- Anywhere this document says "registry," read it as a LEARNED RESOLUTION CACHE, not a hand-maintained list. Resolution works like this: the interpreter proposes a candidate site or product; the app validates it (DNS/HTTP reachability, page title and brand match, redirect checks, and a web search for unknown names); successful resolutions are cached locally with a timestamp and invalidated on failure. The cache may also be seeded, with my consent, from my own browser history and bookmarks. No hand-written seed list of sites.
- Every site, product, or phrase named anywhere in this document is an ILLUSTRATION of a class of problem. Never copy examples into code, prompts, few-shot examples, or tests as the only coverage. The goal is understanding, so a slightly different input (a similar-sounding but different product, or an invented name) leads to the correct, different outcome.
- The only hard-coded exception is the Apple catalog file, clearly headed SANCTIONED EXCEPTION. The CI scan must fail on any other site, brand, or product literal.
- Trade-off to measure, not hide: the first resolution of a site costs one extra model call; repeats come from the cache. Report this in the latency numbers.

## RULES AGAINST OVERFITTING

- No special-casing by site name, example phrase, or domain literal anywhere in logic. Site knowledge lives only in data (a registry file) and learned playbooks. Add a CI check that fails if domain literals appear in source outside the registry and test fixtures.
- Split the test corpus into dev (70%) and held-out (30%). Never tune against held-out. Report both. Include sites and phrasings the app has never seen.
- Do not game metrics: never fake completion, skip verification, or hide failures to look faster.

## TOOLS TO USE (check what is installed; do not invent anything)

- Use subagents in parallel for the independent audit lanes below (read-only), and have each report file/line evidence.
- Use any installed debugging, testing, and profiling skills or plugins (systematic debugging, TDD, Playwright/web-app testing). If none exist, proceed with built-ins.
- Profiling: Electron's contentTracing API, Chrome DevTools profiling via --inspect, Node perf_hooks marks/measures, and flame-graph tooling.
- Testing: Playwright's Electron support with traces.
- Evals: promptfoo or vitest with recorded model responses, plus an optional live-model run.

---

## EXPECTED BEHAVIOR (principles to guide the fix, not a checklist to memorize)

Every site, product, or phrase named in this document is an ILLUSTRATION of a class of problem. Do not encode, memorize, or special-case any of them. The goal is that Dixi UNDERSTANDS what was said, so a slightly different input leads to the correct, different outcome. For example, "Google Classroom," "AP Classroom," and "up classroom" sound alike but are different things and must not collapse into one another. A made-up product name the app has never seen must be handled by reasoning and lookup, never by snapping to the nearest known name.

**Principles**

1. **Understand first, act second.** For every command, determine: (a) the action wanted, (b) the target exactly as the user said it, not the closest thing the app already knows, (c) the query or object, (d) constraints, and (e) a confidence level.
2. **Separate language from content.** Action words, particles, politeness, and filler ("open up," "can you," "um") are not part of the target or the query. This is a general linguistic rule applied by the interpreter and generic normalization, not a list of phrases.
3. **Resolve by evidence, not memory or fame.** Gather candidates from the speech-recognition alternatives, the LLM's knowledge, validated web lookup, and the user's context (open tabs, history, current page). Rank them by evidence. Never snap to the most famous or most recently used entity just because it sounds similar.
4. **Conservative fuzzy matching.** Correcting an apparent mishearing (spacing, spelling, a dropped sound) is allowed only when the corrected candidate is clearly better supported than the literal one. Similar-sounding but distinct entities must stay distinct.
5. **Ambiguity policy.** When the top candidates are close or confidence is low, ask a short clarifying question (spoken, with on-screen choices) instead of guessing. When the evidence is clear, do not ask.
6. **Open-ended for the unknown.** For an entity the app has never seen, search, find the best official match, validate it (title, brand, domain), act, and say what it picked. If nothing credible exists, say so. Do not substitute something else.
7. **Verify the landing.** After navigating, check that the page matches the resolved entity. If not, recover or ask. Never report success on a mismatch.
8. **Explain decisions in the trace.** Log the candidates, scores, and the reason for the choice, so wrong decisions can be diagnosed.

**How to test this (procedurally generated, not a fixed list)**

- **Templates x randomized entities.** Generate commands from templates (verb, particle, politeness, filler, and constraint variations) crossed with entity names drawn from three pools: well-known real names, obscure real names (sampled from web search at test time), and invented names that do not exist. Invented names must be handled by lookup or reported as not found, never mapped to a known name. Use a fake search and validation backend in fixtures so this is deterministic.
- **Near-collision (minimal-pair) tests.** Automatically generate pairs of similar-sounding or similar-looking names that map to different destinations (differing by one word, one sound, or spacing). Each must reach its own destination. Genuinely ambiguous pairs must trigger a clarifying question.
- **Linguistic variants.** Phrasal verbs, politeness, fillers, self-corrections, and compounds ("class room" vs "classroom"), generated by template and by LLM paraphrase, then rendered through multiple TTS voices, speeds, accents, and noise levels, plus my own recordings.
- **Fresh seeds every run.** Seed for reproducibility, but never reuse generated cases in code, prompts, few-shot examples, or the example bank.
- **Metrics (on fresh seeds):** snapping-error rate (resolved to a different entity than the one said; target 0 wherever ground truth is determinable), near-collision discrimination accuracy, query-contamination rate (particles or filler leaking into queries; target 0), clarification appropriateness (asks when ambiguous, does not when clear), unseen-entity success rate, and landing-verification accuracy.
- **Regression seeds.** The real failures I reported may be kept as a small, clearly separated regression set. They must pass, but passing them proves nothing about generality. Acceptance depends on the fresh generated sets.

## EFFORT AND PRIORITY MAP (deliver as EFFORT_MAP.md right after the Root Cause Brief, before fixing)

1. A ranked table of workstreams with: expected share of failures fixed (from the attribution experiment), engineering effort (S/M/L with rough hours), risk, dependencies, and whether it improves accuracy, latency, or both.
2. **Where I should spend MY effort:** the short list of things only I can do or decide, each with a time estimate and why it matters. Include at least: API keys and a spend cap; recording about 30 phrases in my real voice on my real microphone (generate the script: varied commands including near-sounding names and phrasal verbs, said normally, fast, and quietly); confirming the Apple catalog scope; signing into the sites I use in the app so logins persist; running the final hard test.
3. **Where to spend the model's effort:** which workstreams need the deepest reasoning (root-cause attribution, interpreter and prompt design, the anti-hard-coding review, red-team analysis) vs mechanical work (scaffolding, renames, CI wiring). Where the environment supports per-subagent model choice, assign the strongest model to the reasoning-heavy lanes and faster models to the mechanical ones.

## PHASE 0: SETUP

Branch, baseline tag, make the app and tests runnable, and add structured tracing behind a debug flag: interim and final transcripts, parsed intent (verb, target, query, constraints), plan, every tool call, page URL/title, DOM-extraction size and time, LLM call count and per-call latency, and result. Never log secrets. No page content or personal data in logs by default.

## PHASE 1: PARALLEL AUDIT (read-only subagents) producing AUDIT.md

Each lane returns findings with: ID, symptom, root cause, file/line evidence, severity, effort, proposed fix.

1. **Audio and STT:** endpointing and utterance-end settings, interim vs final handling, proper-noun/number/homophone errors, disfluencies ("um, like"), mid-sentence corrections, long commands, noisy audio, mic permission and device switching, echo from the app's own TTS, wake-word false triggers, vocabulary boosting.
2. **Interpretation:** multi-intent commands, pronouns and relative references ("that one," "the cheaper one," "the second"), use of current-page context, negation, quantities, ambiguous targets, questions vs commands, small talk, out-of-scope requests, missing info, confidence handling. Also check **phrasal verbs and filler** ("open up," "pull up," "bring up," "go ahead and open," "can you launch," "take me to") and make sure verb particles never leak into queries.
3. **Entity and alias resolution:** greedy or prefix alias matching that shadows longer names (Google vs Google Classroom/Docs/Drive/Maps/Meet, Apple vs Apple Music, Amazon vs Amazon Prime Video, YouTube vs YouTube Music, Microsoft vs Teams/Outlook). Resolution must prefer the longest, most specific multi-word match. Check that "open/launch/go to/pull up + known product" navigates directly and never searches. Check what happens to unresolved names (the fallback query must preserve the user's whole phrase, not a stripped fragment). Check brand-name homophones and STT errors (fuzzy and phonetic matching). Check engine-vs-product confusion ("Google" the search engine vs "Google Classroom" the product).
4. **Planning and agent loop:** over-planning, appended/duplicated steps, no replan on page change, ignored constraints (sort, filter, price), no step/time caps, no loop detection, no cancellation or "stop," no barge-in handling when the user speaks mid-task, races between speculative and final dispatch, retries and idempotency.
5. **Page observation:** shadow DOM, iframes, canvas UIs, virtualized and lazy-loaded lists, infinite scroll, overlays, modals, cookie banners, sticky headers occluding targets, hidden duplicate elements (mobile vs desktop), dynamic IDs, SPAs that change without navigation events, popups and new windows, PDFs, downloads, CAPTCHAs and bot walls, login walls and paywalls, non-English or regional layouts, element-index staleness after DOM changes, prompt bloat from oversized DOM dumps.
6. **Action execution:** covered or off-screen elements, typing into React-controlled and contenteditable inputs (needs real input events), Enter vs submit button, autocomplete dropdowns stealing Enter, native selects, date pickers, hover menus, scroll containers, file inputs, keyboard shortcuts, cross-origin iframes, post-action verification.
7. **Navigation and state:** load-wait strategy (fixed sleeps vs events), redirect chains, new-tab bookkeeping, back/forward semantics, URL normalization, TLS/offline errors, session and cookie persistence so logins survive restarts (persistent partition), login-wall detection after navigating to a product that needs sign-in (tell the user instead of failing silently), URL validation (allow only http/https from model output).
8. **Media and platform:** YouTube play/pause/seek, ads, autoplay-gesture policies, and DRM. Stock Electron lacks Widevine, so web players like Apple Music, Spotify, and Netflix may fail to play. Verify and report options. Also check whether "Electron" in the user agent triggers bot detection or blocked pages, and report trade-offs rather than silently spoofing.
9. **Electron architecture and security:** main-thread blocking, synchronous IPC, large IPC payloads, webContents.executeJavaScript overhead, WebContentsView/BrowserView/webview choice and leaks with many tabs, memory growth, MutationObserver CPU cost, contextIsolation/sandbox/nodeIntegration, IPC sender validation, CSP, will-navigate and window-open handlers, permission handlers, API keys exposed to the renderer, the evaluate_js tool risk, prompt injection from page content, macOS entitlements for mic and accessibility, crash handling.
10. **Latency:** see Phase 3.
11. **Status UI truthfulness:** duplicate steps, vague errors, "done" without verification, status lines that show a wrong parse (as in the Google Classroom case).
12. **Test and observability gaps.**

Synthesize AUDIT.md ranked by frequency x severity / effort. List suspected causes you checked and ruled out.

## PHASE 2: CORPUS AND BASELINE

- Generate a seeded, reproducible corpus of 300-500 commands across at least 30 categories and 15 kinds of sites and apps (shopping, grocery, food delivery, video, music, maps, email, calendar, search, news, social, travel, docs, school tools like Google Classroom, banking read-only, settings), with variations: disfluencies, phrasal verbs ("open up," "pull up," "bring up"), mishearings, pronouns, relative references, corrections, multi-step, ambiguous, and out-of-scope.
- Illustrative seed commands (do NOT treat as a fixed list): phrasal-verb and filler variants of opening a known web product, product search on a named music service, grocery and food ordering on a named store, "go to purchase" on a product page, and multi-step restaurant orders. Expand these into hundreds of generated variants per the EXPECTED BEHAVIOR section, using randomized, obscure, and invented entity names.
- Mine real failures from the app's existing local logs and task history if present (local only, redacted).
- Build local fixture sites reproducing the hard cases above (iframes, shadow DOM, virtualized lists, overlays, autocomplete, React inputs, login walls, store pickers). Never place real orders, enter real payments, or automate real accounts. Any live-site smoke tests are read-only and stop at the confirmation gate.
- Add property tests for invariants:
  - A site or product named in the utterance is never replaced by another registrable domain without explicit resolution.
  - "open / launch / go to / pull up + known product" never results in a search.
  - No verb or particle token ("open," "up," "go," "to," "the") ever starts a search query.
  - The longest matching entity wins over a shorter prefix match.
  - Plans contain no duplicate steps.
  - Irreversible actions are always gated.
  - Every task ends with a truthful status.
  - No action repeats more than twice.
  - The final transcript overrides earlier partials.
  - Fuzzing transcripts (drop words, add fillers, swap homophones) keeps the target intact.
- Run the baseline. Cluster failures by root cause using the traces, and publish the failure taxonomy with counts.

## PHASE 2B: ROOT-CAUSE ATTRIBUTION (do this BEFORE fixing anything)

Goal: answer "why is it doing this?" with data, not guesses. Run the corpus through isolated stages:

- **A. Gold-text run:** feed the correct transcript text straight into interpretation, planning, and execution (bypass speech recognition). Failures here are interpretation, planning, or execution faults.
- **B. Oracle-parse run:** feed the gold structured intent straight into the planner and executor. Failures here are executor and page-handling faults.
- **C. Audio run:** synthesize speech for every command with multiple voices, accents, speeds, and noise levels (TTS plus noise mixing; add real recordings if available), run it through speech recognition, and compute word error rate and entity error rate (site, product, and brand names, numbers, wake word). Then run the resulting transcripts through the pipeline. Failures beyond the gold-text run are caused by speech recognition.
- **D. Timing:** attribute latency per stage using the Phase 0 traces.

Output a one-page **Root Cause Brief** at the top of AUDIT.md: the top 3-5 systemic causes, each with the percentage of failures attributed to it, representative examples, and the single architectural change that addresses it.

Suspects to confirm or reject (do not assume): rule-based string manipulation in front of the LLM (regex stripping, alias prefix matching) instead of semantic parsing; acting on partial transcripts; weak handling of proper nouns, numbers, and the wake word in speech recognition; an undersized or under-prompted interpretation model; an agent loop doing open-ended reasoning where deterministic mechanics would do; no verification feedback after actions.

**Rule for every later fix:** it must name which systemic cause it addresses and how many corpus failures it resolves on dev AND held-out. Reject per-symptom patches that do not generalize.

## PHASE 2C: LISTENING MODEL UPGRADE (speech recognition and audio capture)

Make the model that hears me better, and make the app use it better.

1. **Benchmark with data.** Build an audio test set (synthesized plus real recordings; varied accents, speeds, noise, mic distance) with command vocabulary: brand, product, and site names, numbers, quantities, and the wake word. Metrics: word error rate, entity error rate, wake-word false accept/reject rate, endpoint latency (end of speech to final transcript), and command-level accuracy through the full pipeline. Compare: the current model and settings; the newest model tier of the current provider; at least one alternative streaming provider; an on-device option (e.g. Apple's on-device speech APIs or a local Whisper-class model) for latency and privacy; and a fast hosted Whisper-class option (e.g. on Groq) with chunked streaming. Check current docs, pricing, and rate limits instead of assuming capabilities. Recommend with data, including a fallback chain.
2. **Configure for short commands.** Correct language and model, sample rate and encoding, 20-100ms audio chunks via AudioWorklet (not the deprecated ScriptProcessor), no unnecessary buffering. Tune endpointing and utterance-end (measure truncation vs latency). Use interim results, and handle is_final/speech_final semantics and transcript revisions correctly.
3. **Dynamic vocabulary biasing.** Use the provider's keyword/keyterm boosting (per current docs) with: registry names and aliases, the user's frequent sites, titles of open tabs, and salient words visible on the current page. Refresh per session and per page.
4. **Wake word.** Treat "Dixi" with a dedicated local wake-word component (evaluate options) and phonetic variants ("Dixie," "Dixy") instead of relying on transcript text. Measure false triggers.
5. **Audio capture quality in Electron.** getUserMedia constraints (echoCancellation, noiseSuppression, autoGainControl) tested with and without the app's own TTS playing, device selection and hot-swap, macOS mic permission flows, and voice-activity detection so silence is not streamed.
6. **Pass uncertainty downstream.** Send n-best alternatives and word-level confidence to interpretation, along with candidates from fuzzy and phonetic matching against the registry and page text, so the LLM can fix mishearings (e.g. "Briegel" vs "Burger King") using context. Low-confidence entities lead to a short spoken clarifying question or an on-screen transcript with quick correction.
7. **Error UX.** Show the interim transcript and support voice corrections ("no, I said ...").

## PHASE 2D: LLM UPGRADE (the models that process the command)

Make the reasoning layer measurably better, with evals driving every change.

1. **Tiered model bake-off.** Tiers: (a) a fast interpreter (structured parse), (b) planner/agent step, (c) escalation for hard or low-confidence cases. Test the candidate models available today on Groq (check the current list and limits; do not assume names) and, only with my approval, one or two outside providers for the hardest tier. Metrics: parse accuracy, schema validity, tool-call reliability, adherence to hard constraints (named target respected), time-to-first-token, total latency, cost, and rate-limit headroom. Choose per tier with data and add an automatic escalation ladder (validator failure or low confidence escalates to a stronger model).
2. **Give the model the right context** instead of one giant prompt: final transcript plus speech-recognition alternatives and confidences; current URL, title, and open tabs; last N actions; registry candidates for mentioned entities (top fuzzy matches with scores); page affordances (is there a search box, which buttons exist, by accessible name); relevant user preferences; and concise rules. Retrieve few-shot examples dynamically from an example bank (nearest verified examples from the corpus and successful traces) instead of a static list.
3. **Constrain and validate outputs.** JSON-schema-constrained output where the provider supports it, typed arguments, and a validator for business rules (named target must be in the resolved set; no verb or particle token in a query; no irreversible action without a confirmation flag). Retry or escalate on validation failure. Temperature 0. No long reasoning on the fast tier; allow a short rationale field in debug builds only.
4. **Division of labor.** The LLM decides semantics (what, where, which element). Deterministic code does mechanics (URL building, search-box discovery, waits, verification). Replace many low-level tools with fewer high-level typed tools (open_product, search_site, add_to_cart, click_by_name, read_page) with precise descriptions, so the agent makes fewer and safer calls.
5. **Verification loop.** After each action, compare the new page state to the expected outcome. On mismatch, run a bounded recovery strategy.
6. **Prompt-injection hygiene.** Page text is delimited as untrusted data and never treated as instructions.
7. **Speed.** Smaller prompts, caching of identical parses (key: normalized transcript plus context hash), prompt caching where supported, and streaming.
8. **Eval-driven development.** Every prompt or model change runs against dev and held-out sets. Version the prompts. No change merges if held-out regresses. Record results in a table.
9. **Optional stretch (only if the bake-off plateaus below targets).** Build a training set from verified, redacted, local traces and evaluate fine-tuning or distilling a small interpreter model. Keep it only if it beats prompt-only on held-out. Check provider support first.

Targets (report actuals, do not hide misses): held-out interpretation accuracy of at least 95% on gold text and at least 90% end-to-end from audio; wrong-site rate of 0 on held-out.

## PHASE 2E: RESEARCH AND METHOD TRIALS (find better ways, then prove them)

Use web search and fetch to research current best practices and state of the art for:

- Voice-controlled and LLM-driven web agents (open-source agent frameworks and their design choices; published benchmarks and failure analyses such as WebVoyager, Mind2Web, and WebArena-style evaluations; verify what exists now).
- Page observation (accessibility tree vs DOM vs screenshot/set-of-marks hybrids), planner/executor splits, verification and recovery loops, and memory or playbooks.
- Streaming speech recognition for short commands (contextual biasing, endpointing, two-pass recognition, wake-word engines).
- Structured output and constrained decoding for intent parsing.
- Latency techniques for LLM apps (streaming, prompt caching, speculative execution, small-model routing).
- Turn-taking and barge-in for voice agents.
- Fact-checking and grounding approaches.

Write RESEARCH.md: for each method, the source link, date, claim, why it might help Dixi, expected effect, and trial status. Prefer primary sources (papers, official docs, engineering blogs) and note where evidence is weak. Do not adopt a method because it is popular.

Trial every promising method behind a feature flag. A/B it on dev, confirm on held-out, and keep it only if it improves accuracy or latency without regressions. Record all results, including negative ones, in RESEARCH.md. Candidates to consider (not required, not exhaustive): accessibility-tree-first observation with a vision fallback only for canvas or image-only UIs; two-pass recognition (fast pass for speculative reversible actions, accurate pass for confirmation); dual-model parsing with a verifier for low-confidence or risky commands; self-consistency voting on ambiguous parses; verify-then-act on purchase-like flows; per-domain playbook memory; contextual biasing from page text; speculative preconnect and pre-warm; clarifying-question policies. Look for methods I have not thought of.

## PHASE 2F: PROVIDERS AND KEYS (add power only where the data says it is needed)

- Build a provider abstraction (interface, config file, environment variables) so models and services can be swapped without code changes. No provider names, model IDs, or keys hard-coded in logic.
- At the very start, ask me ONE batched question listing which optional keys I can provide: (1) a stronger LLM for the hard tier, escalation, and verification (e.g. an Anthropic, OpenAI, or Google key); (2) ElevenLabs; (3) an alternative or upgraded speech-to-text provider; (4) a web-search or grounding API for fact-checking and entity resolution; (5) a spending cap. Proceed with whatever I provide. If I provide none, keep working with Groq only.
- Decision rule: add an extra provider only where the bake-off shows Groq-tier models miss the targets. Keep Groq for the fast tier.
- **ElevenLabs is a voice provider (text-to-speech and speech-to-text), not a fact-checking or reasoning model.** Use it for (a) low-latency streamed spoken replies (start speaking the first sentence early, cache common phrases), and (b) its speech-to-text as one candidate in the Phase 2C benchmark. Check current model names and latency in its docs.
- **Fact-checking and grounding:** when the app answers a question aloud (e.g. "how many subscribers does this creator have?"), answer only from page content or search results, show the source on screen, and run a verification pass (a second model or a search-grounded check) before speaking. If sources disagree or are missing, say so instead of guessing. Also use a second-opinion model to verify risky or low-confidence interpretations (purchases, sends) before the confirmation card appears.
- Keys only via environment variables or the OS keychain. Never commit them, log them, or expose them to the renderer. Respect the spend cap, log estimated cost per run, and prefer recorded responses for repeat test runs.

## PHASE 2G: APPLE PRODUCT SHORTCUT (the ONE sanctioned hard-coded exception)

Behavior: when the utterance contains an explicit Apple hardware or accessory product name and no other site or retailer is named, go to the Apple online store and start the order for that product (e.g. "buy me AirPods"). In every other case, the normal rules apply.

1. **Catalog.** A single data file (e.g. `data/apple-catalog.json`) headed SANCTIONED EXCEPTION, generated by a refresh script (`npm run refresh-apple-catalog`) from Apple's live store and product listing pages. Do not rely on memory: today's lineup may include products you do not know. Contents: product FAMILIES (iPhone, iPad, MacBook Air, MacBook Pro, iMac, Mac mini, Mac Studio, Mac Pro, Apple Watch, AirPods, AirTag, Apple TV, HomePod, Apple Vision Pro, Apple Pencil, Magic Keyboard, Magic Mouse, Magic Trackpad, Studio Display, chargers and cables, cases, bands, other accessories, AppleCare, and any other hardware the live store lists, including Beats products if the store sells them), each with aliases, common spoken variants and speech-recognition mishearings ("air pods," "AirPod," "mac book," "i pad," "I phone"), and model-qualifier patterns. Match by FAMILY plus wildcard qualifiers so new models and generations are covered without editing the list. Record the refresh date and warn in logs and UI if the catalog is older than 30 days.
2. **Scope rules.** Hardware and accessories go to the Apple store. Apple services and apps (Apple Music, Apple TV+, iCloud, Apple Arcade, Apple One, Apple Pay, the App Store) are NOT hardware and go through normal generic resolution. "Apple TV" is ambiguous (hardware vs service): purchase verbs mean hardware, watch/play verbs mean the service, otherwise ask. The bare word "apple" or "apples" is not a trigger ("buy me apples from Safeway" must not go to Apple). Compatibility phrasing ("a charger for my iPhone," "a case for my MacBook") is ambiguous: ask whether I want Apple's own accessory or any brand.
3. **Named-target override.** If I name another retailer or site ("buy AirPods from Amazon," "AirPods at Best Buy"), obey it. The Apple default applies only when no other site is named.
4. **Intent handling.** "Buy, order, get me, I want, purchase" + Apple product means store plus ordering flow. "Show me, how much is, look up, compare" + Apple product means open the product page only, with no ordering.
5. **Ordering flow.** Open the Apple online store and let the site route to the correct regional storefront (hard-code no country and no URL paths). Find the product by navigating the site's own menus or search, resolving paths dynamically. Handle required configuration (model, size, color, storage, carrier, trade-in) by asking me a short spoken question for each required choice, or use the page's defaults if I said "any." Add to Bag and go to Checkout. If I am not signed in, pause and tell me (logins persist in the app's session). STOP at the final review step and read back the order (item, configuration, price, delivery, address). Place the order only after my explicit confirmation (voice or click). NEVER type card numbers, CVVs, passwords, or verification codes; hand those to me. Enforce this in code through the ApprovalGate, not through the prompt.
6. **Tests.** Positive: "buy me AirPods," "order AirPods Pro," "get me a MacBook Air," "I want an Apple Watch," "buy me an iPhone," "buy me AirTags," "order me an Apple Pencil," "buy me a Magic Keyboard," spoken and misheard variants ("air pods," "mac book air"), and a new model that matches a family but is not in the catalog by name. Negative: "buy me apples," "buy me a phone," "buy me headphones" (generic, no Apple default), "buy AirPods from Amazon" (Amazon wins), "play Apple Music" and "search lo-fi on Apple Music" (service, not store). Tests use a local fixture store with the same flow (the destination is read from the catalog file, and tests point it at the fixture). Real-store checks are read-only up to the review step and never place an order.

## PHASE 3: LATENCY PROGRAM

First measure. Produce a waterfall for at least 20 representative tasks with p50/p95 per stage and the top contributors. Then check at least these suspects:

- LLM calls made sequentially (classifier, then planner, then per-step agent)
- Large models used for easy parsing
- No streaming (waiting for full completions)
- Huge prompts from full-DOM dumps
- No prompt caching where supported
- Extra backend-proxy hops
- Cold TLS/connection setup per request
- STT endpointing delay
- Debounce and "stable transcript" windows
- Fixed sleeps and long polling
- Timeouts that wait for elements that never appear
- Serial work that could be parallel
- Sync IPC and large serialization
- Per-step DOM re-extraction
- TTS start latency

**Budgets** (reported separately so third-party page load is not blamed on the agent):

- Agent overhead from end of speech or clause to first action issued: p50 under 400ms, p95 under 800ms.
- Simple tasks (navigate, navigate+search) show results within 2.0s p50 after end of speech on the local fixture sites. For live sites, report agent overhead and site load time separately.
- Multi-step tasks: per-step agent overhead p50 under 700ms.

**Likely fixes:**

- Tiered routing: a conservative registry-driven deterministic tier (under 50ms) for clear "open/go to <known product>" commands, then a small fast Groq model with constrained JSON output, then the full agent loop only when needed. Check current Groq model options instead of assuming names.
- Stream, and begin executing the first tool call as soon as it parses.
- Abort stale in-flight calls when the transcript updates.
- Keep connections warm (keep-alive, HTTP/2). Use a thin streaming proxy or short-lived tokens instead of a slow hop.
- dns-prefetch and preconnect (and pre-warm a tab) the moment a target site is recognized, even from interim speech.
- Replace fixed sleeps with event-based waits and a short DOM-settle window.
- Send compact, viewport-prioritized DOM indexes and diffs instead of full dumps.
- Parallelize independent work.
- Learned per-domain playbooks: successful action sequences with resilient role/name locators, verified on replay, invalidated on failure, stored locally with no credentials or personal data, so repeat tasks skip the LLM entirely.

## PHASE 4: FIX IN RANKED WAVES

For each wave: write failing tests, fix at the root-cause level, get them green, re-run the full corpus and latency suite, and commit (one fix per commit, with a note on the root cause). Include these design fixes:

- A structured interpreter that separates verb, target (product/site/app), query, and constraints. A named site or product is a hard constraint. Verb and particle handling is explicit ("open up" is "open").
- A data-driven site/app/product registry with longest-match resolution, fuzzy and phonetic matching, and resolution for unknown names (search plus LLM with a confidence check). No silent fallback to a default search engine, and any fallback query preserves the user's full phrase.
- Generic search-box and button discovery by accessible role and name.
- Incremental dispatch only for complete, high-confidence, reversible fragments, with one command session whose plan is reconciled, never appended.
- Post-action verification (did the page land where intended?), alternate-strategy retries, and specific, honest failure messages.
- Confirmation enforced in code for orders, sends, and deletes.
- "Stop" and barge-in support.
- Electron hardening and performance fixes from the audit.

Continue through waves until the remaining failures show diminishing returns. Stop and ask me only for irreversible or product-level decisions.

## PHASE 5: REPORT AND LEAVE IT BETTER

- Deliver REPORT.md with: the Root Cause Brief and which systemic causes were fixed (with failures resolved per cause), the stage-attribution results before and after, word and entity error rate before and after for speech recognition, and the model bake-off table per tier. Then a before/after table on dev AND held-out sets: intent accuracy, end-to-end success, wrong-site rate (target 0), query-contamination rate (verb/particle in query, target 0), duplicate-step rate (target 0), steps per task, LLM calls per task, and agent overhead p50/p95. Include honest notes on what still fails and why.
- Add `.claude/skills/dixi-command-qa/SKILL.md` (how to run the evals and add cases).
- Update CLAUDE.md with architecture notes and the no-hard-coding rule.
- Wire the suite into CI: a perf gate on fixtures and a nightly live-model job.
- Show `git diff --stat`.

## PHASE 6: THE GAUNTLET (prove it works and is not hard-coded)

Build one command (`npm run gauntlet` or equivalent) that runs everything below and prints a scoreboard with real numbers. Update REPORT.md with the results.

1. **Real pipeline end to end.** Launch the real Electron app and feed WAV audio through the real speech path (Chromium's fake-audio-capture flags, e.g. `--use-fake-device-for-media-stream` and `--use-file-for-fake-audio-capture`; verify they work with this Electron version). Use synthesized speech in multiple voices, speeds, accents, and noise levels, plus any real recordings I provide.
2. **Anti-hard-coding proofs.**
   - **Static scan:** fail if domain literals, brand or product names, example phrases, or site-specific branches appear in source or hand-written data outside (a) test fixtures and (b) the single sanctioned Apple catalog file. Also fail if any hand-maintained list of sites exists.
   - **Alias-swap test:** serve the fixture sites under made-up domains and brand names that cannot exist in any list, and empty the registry. The generic strategies (search-box and button discovery, resolution fallback) must still complete the tasks.
   - **Registry-removal test:** delete the registry. The app must degrade gracefully, never crash, and never silently fall back to a default search engine.
   - **Paraphrase test:** each held-out command rephrased at least 5 ways. Results must be stable.
   - **Contamination check:** no held-out item (or near-duplicate) may appear in few-shot examples, prompts, the example bank, or any training data.
   - **Independent code review:** a separate subagent that has not seen your changes hunts for special cases (branches on site names, regexes keyed to example phrases, magic strings, test-detection) and reports findings. Fix everything it finds.
3. **Non-tautological assertions.** Tests assert on fixture-backend ground truth (server-side event logs such as "item added to cart" or "search submitted with query X") and on final page state. Never assert on internal function calls or on the app's own claims of success.
4. **Hard cases (the kind of test I will run).** Long compound commands; mid-sentence corrections; interruptions and "stop" mid-task; follow-ups and pronouns; ambiguous requests (it should ask); out-of-scope requests (it should say so); unfamiliar sites; login walls and CAPTCHAs (it must pause and tell me); cookie banners and popups; sites in other languages; slow pages and timeouts; rapid-fire back-to-back commands; switching tabs; asking a question about the page mid-task and getting a spoken, sourced answer; noisy audio and accented speech; the wake word said casually in conversation (should not trigger); purchases (must stop at confirmation).
5. **Red team.** A subagent that has seen only the spec (not the code) writes at least 100 new hard commands the team never saw, runs them, and files failures. Fix, then repeat with a fresh batch. Do at least 3 rounds, or until a fresh batch passes at the target rate.
6. **Soak and stability.** 100 consecutive commands in one session with no memory growth, hung steps, or crashes.
7. **Independent verification.** A separate agent re-runs the gauntlet from a clean checkout and confirms the numbers. Report any discrepancy.
8. **Acceptance gates (report actuals):** zero snapping errors and at least 95% correct discrimination on freshly generated near-collision pairs and invented-name tests (fresh seeds, every audio variant and typed text); the small regression seed set passes; held-out end-to-end success of at least 90% on fixtures; wrong-site rate 0; query-contamination rate 0; duplicate-step rate 0; zero irreversible actions without confirmation; agent overhead and simple-task latency within the Phase 3 budgets; all anti-hard-coding checks pass; and a clearly listed set of known limits (e.g. CAPTCHAs, DRM) with how the app behaves in each.
9. **Deliver HARD_TEST_GUIDE.md:** at least 40 commands (easy to brutal) I can speak to test it myself, the expected behavior for each, the known limits, and a one-page pre-flight checklist (permissions, keys, mic, network, persistent logins) so nothing trips on test day.

## GUARDS

No secrets in commits or logs. No real purchases or payments. Keep API keys in environment variables, the OS keychain, or the main process only, and ask me once, up front, for any optional keys and a spend cap. Respect site terms in any live checks. Do not claim anything works without showing the real command output. List everything you could not verify.
