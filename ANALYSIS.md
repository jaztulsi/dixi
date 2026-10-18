# Dixi: analysis, fixes and measurements

Dixi is a hands-free, voice-controlled browser (Electron app in `electron/`). You say what you want ("buy me AirPods Pro", "make it two", "check out") and it acts on real websites while you talk. This file records how it works, what was broken, what was changed, and the measured results.

## How it works

```
mic → speech-to-text (ElevenLabs / Deepgram, main process)
    → voice.js       wake word, clause splitting, acts while you talk, asks short questions
    → interpret.js   code-only fast path for common commands; else one strict-JSON model call,
                     checked against the words actually said (validate) and escalated on failure
    → execute.js     deterministic mechanics per act (open, search, order, cart, quantity, remove,
                     checkout, ask_page...), each step verified against the page afterwards
    → pagekit.js     page toolkit in an isolated world: accessible names, stable element refs,
                     options/variants, cart lines, quantity steppers, the purchase gate
    → agent.js       fallback tool-calling browser agent for the long tail (typed tools only)
main process: keys, providers.js (models, router tiers, retries, spend caps), resolve.js (which site
a spoken name means, by evidence), Apple catalog, traces
```

- **State across steps:** the voice agent keeps a queue (commands run in spoken order), recent commands, a pending question, the parse cache and the learned site registry (search URL templates per host, verified before reuse and invalidated on failure).
- **Safety:** `pagekit.gate()` refuses to click place-order, pay, send and delete without a spoken yes. Private fields (passwords, card numbers, codes) are never typed. Checkout always stops at sign-in or payment.
- **Hard-coding policy:** no site, brand or phrase literals in the logic. The one sanctioned exception is the Apple catalog (`data/apple-catalog.json`), generated from Apple's live store.

## Phase 1: what was found

Checks run at the start:
- `npm test`: 40/40 passed.
- `node --check` on every source file: clean.
- No linter, type checker or build step is configured (plain ESM, no bundler); I added none.
- The last live run on real sites passed 27 of 31 steps.

Broken or fragile:

| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | **Every Claude call past Haiku failed.** Forced `tool_choice` returns a 400 on Sonnet 5.5 and Opus 5.5, so escalation and vision silently fell through. | API 400s; fixed path verified live | Fixed (structured outputs, `3a8dade`) |
| 2 | No mode switch, the agent loop never escalated, no local schema check, no prompt caching, no backoff on 5xx/529, a missing key silently dropped its provider, Cerebras model names hard-coded | code | Fixed (`3a8dade`) |
| 3 | **Apple refuses bag adds under the Playwright test launch** (`navigator.webdriver=true`). Dixi said "Added", but the bag was empty, so earlier Apple test passes were false. | same add: Playwright shows "Your bag is empty", plain launch shows "Review your bag" | Fixed (`--real` harness, `7c9f323`). The "Added" claim got a stricter check (cart count must rise). |
| 4 | "iPhone 18 Pro case" opened the iPhone 18 Pro buy page; Apple accessories were missing from the catalog | catalog unit cases | Fixed (`7c9f323`) |
| 5 | "AirPods with 200 GB" matched AirPods Max 2 (the "2" in "200"); "Magic Keyboard for iPad Air" matched iPad Mini | catalog unit cases | Fixed (`7c9f323`) |
| 6 | No remove-from-cart act; quantity couldn't target one cart line | code | Fixed by the parallel session (`898fabe`) |
| 7 | Answering Dixi's own question ("Which iPhone?" → "the iPhone 17") cancelled the task that asked it | live Apple run 1 | Fixed |
| 8 | Price and rating questions didn't get the price lines (the page excerpt keyed on the question's words) | live Apple run 1 | Fixed |
| 9 | "sign in on this page" parsed to a click on nothing; Apple's sign-in iframe wasn't recognised as a sign-in | live Apple run 1 | Fixed |
| 10 | Cookie banners got "Accept all" | `pagekit.dismissOverlays` | Open |
| 11 | Amazon "go to purchase" clicked "Go to Cart" and stopped (the CHECKOUT regex matched "go to cart") | live run | Fixed: now stops at Amazon's sign-in (`4f6080f`, `506d3d8`) |
| 12 | iPhone adds went in but were reported "the cart didn't change" (Apple takes about 3–4 s, then moves to a heavy page) | live demo runs | Fixed: proven from the bag (`17bab97`) |
| 13 | Remove reported success for an item not in the cart, and could fall back to clicking a guessed Delete button | live Amazon run | Fixed: the model matches words to the cart's line names, otherwise "I don't see it" (`506d3d8`) |
| 14 | A question the page couldn't answer was spoken back as "The page does not show…" | live Amazon run | Fixed: Claude answers with a web search (`548ed56`) |

## The model stack

`DIXI_MODE=hybrid|cerebras|claude` (default `hybrid`). Models are discovered from each provider's `/v1/models` at startup; Cerebras currently lists `gpt-oss-120b` and `qwen-3.8-27b`.

| Tier | Used for | hybrid | cerebras | claude |
|---|---|---|---|---|
| plan | understanding a shopping command | Sonnet 5.5 | Cerebras | Sonnet 5.5 |
| fast | other commands, picks, checks | Cerebras (both models, hedged) | Cerebras | Haiku 5.5 |
| strong | a fast answer that failed its checks | Sonnet 5.5 | the other Cerebras model | Sonnet 5.5 |
| hard | the strong tier failed too | Opus 5.5 | none | Opus 5.5 |
| agent | next click or type in the fallback agent | Cerebras, then Sonnet, then Opus | Cerebras | Sonnet 5.5 |
| answer | spoken answers | Cerebras, hedged with Haiku | Cerebras | Haiku 5.5 |

**Escalation policy** (`DIXI_ESCALATE`, JSON):
- A schema failure escalates, and so does a failed transcript check (`validate`). So does a confidence below 0.6.
- The agent escalates after two failed moves, on a repeated move that changed nothing, or when it reaches a checkout, payment or sign-in page.
- Each escalation's reason is recorded on the model call and appears in the traces.

**Plumbing:**
- Retries happen in one place, `providers.chat()`. 5xx, 529 and dropped connections get 2 retries with backoff and jitter. A 429 with a `retry-after` of 2 s or less gets one retry; a longer one moves to the next model.
- The system prompt and the tools are cached. A repeat command reads 1,738 tokens from the cache.

Measured single calls (interpret prompt, live):

| Model | Latency | Note |
|---|---|---|
| Cerebras qwen-3.8-27b | 0.36 s | |
| Claude Sonnet 5.5 | 1.5–1.8 s | 1,738 tokens from cache on the 2nd call |
| Claude Haiku 5.5 | 3.0 s | cold (cache write) |
| Claude Opus 5.5 | 6.4 s | |

## Live results

Each run uses the real app, launched normally with a throwaway profile, on the real site. Every step is checked against the page's own state (bag lines and quantities, the header count, URL, page numbers). Nothing is ever ordered.

### Apple Store
| Run | Result | Notes |
|---|---|---|
| Apple run 1 | 7/12 | Failures were rows 7–9 above, plus two bugs in my own checks |
| Apple run 2 | 4/12 | Exposed the remove false positive, the empty-cart checkout message, and the harness resetting a pending question |
| Demo run 1 (scripts 1 + 2) | 14/16 | "…right now" was ignored; iPhone add reported as failed |
| Demo run 2 | 16/16 | |
| Demo run 3 | 15/17 | Resolver chose applestore.com for "Apple Store"; iPhone add falsely reported as failed (it was in the bag). Both fixed in `17bab97` |
| iPhone adds, one at a time | 4/4 added and proven | After the fix, bag count 4 |
| **Final demo run** (scripts 1 + 2) | **17/17** | $0.026. The battery-life answer came from model memory and was wrong ("4.5 h", where Apple says 8 h). Spec questions answered from memory aren't reliable yet; open item. |

### Amazon
| Run | Result | Notes |
|---|---|---|
| Amazon run 1 | 5/9 | Quantity and remove false positives, a help link taken for checkout, a "black one" choice parsed as a click |
| Demo run 2 | 5/9 | "Go to my cart" stayed on the "Added to cart" page (`/cart/smart-wagon`) |
| Demo run 3 | 6/9 | Same cart-page issue (a skip link); fixed in `0eab794` |
| Demo run 4 | 1/9 | Amazon put the session behind `/checkpoint` (its human check). Now detected and handed over, never worked around. |

Cost per full run: about $0.01–0.02 for Cerebras and $0.01–0.02 for Anthropic.

The verified demo phrases are in `DEMO.md`.

## Improvements ranked (impact ÷ effort)

| Idea | Impact | Effort | Done |
|---|---|---|---|
| Fix the Claude request shape (structured outputs) | high | low | yes |
| Plain-launch test harness (honest Apple results) | high | low | yes |
| Accessory-aware Apple catalog (Apple first) | high | low | yes |
| Router with escalation + mode switch + discovery | high | medium | yes |
| Remove from cart, per-line quantity | high | medium | yes (parallel session) |
| "Which iPhone?" question for ambiguous families | medium | low | yes |
| Say what the page doesn't offer ("no 200 GB option") | medium | low | yes |
| Prompt caching | medium (cost) | low | yes |
| Failure screenshots in traces | medium | low | yes |
| Cookie banners: reject non-essential first | medium | low | |
| Streaming answers | low (answers are 1–3 sentences) | medium | measured, skipped |
