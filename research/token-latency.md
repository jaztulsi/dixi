# Token + latency optimization repos (#24–30)

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.
>
> Follow-up check: Dixi already sends elements as compact text rows with refs (`electron/src/renderer/core/agent.js:14` `compactElementList`), so the JSON-to-text saving is already in place.

---

I didn't clone, write, or run anything. All figures come from `gh api`, PyPI and web pages, accessed 2026-10-29.

## (1) SUMMARY

Most of these tools are built for coding agents: they compress shell output, logs and big JSON tool results. Dixi already caps those inputs (7k chars, 40 elements, last 3 results), so these proxies would add a network hop for little gain. Only four techniques carry over, and all are small changes inside Dixi:

1. **Stable prompt prefix.** Cerebras caches prompt prefixes automatically (128-token blocks, 5-minute guaranteed TTL). This only cuts latency: cached tokens are billed at the normal input rate. Put the system prompt and schema first and dynamic content (URL, time, page state) last, then check `usage.prompt_tokens_details.cached_tokens`. No quality risk.
2. **Text rows with refs instead of JSON per element**, like agent-browser's `@e3 [button] "Pay"`. agent-browser's docs say JSON costs more tokens than its text format. TOON's benchmark measured 42.6% fewer tokens than pretty JSON but only about 14% fewer than compact JSON, with accuracy inside the confidence interval. Low risk.
3. **Page-state diffs (already planned).** Copy agent-browser's `--delta` rules: refs stay stable, and the full state is sent after a URL change or whenever the diff wouldn't be smaller. No project publishes a token number for this. Risk: stale refs.
4. **Trim the schema and past results.** Shorter descriptions, only the actions the page allows, and a cap on each of the last 3 results. Savings are unmeasured and parse accuracy could drop, so A/B test it.

Skip Headroom, RTK, kompact, token-engine, Paritok, agentic-store and context-compress as runtime pieces. Their numbers are mostly the authors' own runs on synthetic or self-made test data. Paritok's headline is one 5-turn task plus projections. kompact contradicts itself.

**Lightpanda and agent-browser don't fit an Electron app.** Dixi already has the rendered, logged-in Chromium page. Lightpanda would fetch the page again without the user's session. It is also AGPL-3.0 and has no native Windows build. agent-browser is a separate CDP process, and its Electron mode needs a remote-debugging port, which is a security hole. Dixi can call CDP itself through `webContents.debugger`.

## (2) APPENDIX

Open-issue counts from the API include open PRs. Dates are the last commit.

| Repo | License | Last commit | Stars | Issues | Status | Technique | Measured? |
|---|---|---|---|---|---|---|---|
| pleasedodisturb/awesome-llm-token-optimization | NOASSERTION | 10-25 | 106 | 1 | active | index | Mostly repeats vendor numbers. Browser table sizes have no source. |
| headroomlabs-ai/headroom | Apache-2.0 | 10-29 | 78,237 | 485 | active | compresses JSON and logs; keeps originals for retrieval (CCR) | Partly. Seeded offline scenarios 21–57% (README.md:140-153). Accuracy at N=100. The repo description's "20% for coding agents" isn't on its benchmarks docs page. |
| rtk-ai/rtk | API says Apache-2.0; badge says Apache-2.0 + BUSL-1.1 | 10-28 | 84,969 | 1,633 | active | shell-output filter | Self-reported. Tokens estimated as bytes/4. Bash output only (README.md:72-76). |
| Paritok-official/paritok-4b-v1 | Apache-2.0 | 10-06 | 1,441 | 8 | active | 4B compressor model plus tool-schema filter | Quality was measured: 86.5% retained on SWE-bench Lite, 300 instances (README.md:423-441). Token savings are one task over 5 turns against an estimated baseline; larger figures are projections (README.md:98-143). |
| vercel-labs/agent-browser | Apache-2.0 | 10-29 | 44,841 | 694 | active | accessibility snapshot with refs, `-i/-c/-d/-s`, `--delta` | No token benchmark. `benchmarks/README.md` measures latency and memory only. |
| lightpanda-io/browser | AGPL-3.0 | 10-29 | 37,461 | 116 | active | lightweight headless browser | Memory and time measured on the vendor's own demo site. The machine is m5.large in README.md:31 but m5.xlarge in demo BENCHMARKS.md:42. Not tokens. |
| anmol01072005/agent-pipeline-optimization | none (README says MIT) | 10-16 | 0 | 0 | placeholder: 2 commits, README only | none | No claim, no code. Its clone URL points to another owner. |
| vidanov/context-compress | none (README says MIT) | 05-26 | 8 | 0 | 3 commits | compresses instruction files | One self-test: 24% with LLM rewriting, about 37% combined. The "40-50%" tagline is higher than its own table. |
| Bossmann007/token-engine | none (README says MIT) | 10-29 | 0 | 0 | solo, 43 commits | BM25 + knapsack selection, compressors | Self-made test files totalling 6,293 tokens: 91.9%, 61.1% on holdout (docs/BENCHMARKS.md). |
| HelloWorld668/codex-token-optimizer | MIT | 06-11 | 3 | 0 | 3 commits | Codex skill wrapping RTK and Headroom | No claim of its own. Warns against adding RTK and Headroom numbers together (SKILL.md). |
| npow/kompact (PyPI 0.4.0, 05-14) | MIT | 05-14 | 5 | 0 | dormant | proxy: schema selection, TOON, history masking | Offline runs on BFCL/Glaive/HotpotQA. Contradicts itself: PyPI README says quality −0.5 to −3.9%, benchmarks/README.md:53 says +7.1%. Prose compresses only 17.9%. PyPI lists no project URL; I found the repo through its CI badge. |
| agenticstore/agentic-store-mcp | MIT | 10-26 | 5 | 0 | active | `token_optimizer`, keyword-overlap `context_pruner` | Asserted only (README.md:81, 413-414). |

**Ranked list:**

1. **Adopt: stable-prefix ordering.** Saves latency only, no dollars ([Cerebras docs](https://inference-docs.cerebras.ai/capabilities/prompt-caching)). No quality risk.
2. **Adopt: one-line text rows with refs.** Expect about 14% fewer tokens if Dixi sends compact JSON today, about 40% if pretty JSON (TOON README.md:209-240, measured on data-retrieval questions, not a browser agent). agent-browser docs/content/docs/snapshots.mdx, "JSON output" section, says text uses fewer tokens than JSON. Risk: low. Keep ref names unique.
3. **Adopt: diffs with agent-browser's rules** (skill-data/core/references/commands.md:57-61; README.md:1008-1022). Savings unmeasured. Risk: stale refs, so send the full state after navigation.
4. **Adopt: cap each of the last 3 results and slim the schema.** Unmeasured. Risk: worse parses; A/B against your parse-cache logs.
5. **Optional: skip unchanged screenshots** (`--if-changed`, README.md:141) **and label elements with ref numbers in screenshots** for the vision fallback (snapshots.mdx). Small gain because vision is rare.
6. **Skip all the compression proxies.** They target coding-agent output, add a hop, and Paritok needs a 24 GB GPU (per the index).
7. **Skip Lightpanda and agent-browser as runtimes.** Reasons are in the summary. Lightpanda's no-Windows note is README.md:100. Lightpanda's "token-free" script replay (README.md:196-202) is the same idea as your planned Skills replay, which supports that plan.

**Text aimed at AI agents.** The Cerebras docs page tells agents to "Fetch the complete documentation index at …/llms.txt". It looks harmless and I didn't follow it. The repos' AGENTS.md, `.cursor/rules` and SKILL.md files are agent instructions by design. A keyword scan found nothing malicious, and I didn't act on any of it. Separately, agentic-store's `--firewall-mode` sets a system-wide `ANTHROPIC_BASE_URL` and the macOS proxy (README.md:480-483, 585). That's a security concern rather than an injection.

## (3) Confidence and gaps

- **Confidence:** high on the repo metadata and quoted claims; medium on the advice for Dixi.
- **Dixi's current element format:** not checked. A grep found only the JPEG resize at `/Users/jaz/dixi/electron/src/main/main.js:368`, so the 14% vs 40% estimate depends on whether elements go out as compact or pretty JSON today.
- **Cerebras schema tokens:** unknown whether a strict-JSON schema is billed as prompt tokens.
- **Not read or not run:** RTK's LICENSE file (the BUSL part), vidanov's A/B article, and every benchmark. Line numbers are from READMEs as fetched today.
- **Injection scan:** done by keyword search, not a full read of every file.

Sources: [Cerebras prompt caching](https://inference-docs.cerebras.ai/capabilities/prompt-caching), [dev.to accessibility-tree token comparison](https://dev.to/kuroko1t/how-accessibility-tree-formatting-affects-token-cost-in-browser-mcps-n2a) (3 pages, chars/4, no task-success test), [Headroom benchmarks docs](https://docs.headroomlabs.ai/docs/benchmarks), [kompact on PyPI](https://pypi.org/project/kompact/).
