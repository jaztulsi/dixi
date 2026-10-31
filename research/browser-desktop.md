# Browser + desktop automation repos

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.
>
> Verifier correction: Agent S3 72.6% on OSWorld is **"Agent S3 + BJudge, N=10, GPT-5 + Opus 4.5"**; a single run is 62.6%.

---

I didn't run any of the engines. Everything below comes from the GitHub API, reading the source and docs, and the benchmarks' own papers and leaderboards. All of it was gathered on 2026-10-29.

**LICENSE WARNING: Skyvern, BrowserOS and workflow-use are AGPL-3.0.** BrowserOS also has a CLA, so its owners can relicense it but outside users can't. Using their code in Dixi would put Dixi under AGPL. The other five are MIT or Apache-2.0.

## (1) Summary

**Don't embed any engine.** Three are AGPL. Four (browser-use, Skyvern, Agent-S, openbrowser-ai) are Python and would need their own browser stack next to Electron. Stagehand is MIT and TypeScript, but v4 moved its cache onto Browserbase's servers. Every engine makes at least one LLM call per step, while Dixi's rule path makes none. The two big MIT projects are also changing fast: browser-use is moving its core to Rust, and Stagehand v4 broke its API. Take ideas, not code.

| Verdict | Idea | Source |
|---|---|---|
| ADOPT | Identify a step's target by (frame, role, accessible name, nth occurrence), and re-find it when the page reloads | BrowserOS `refs.ts` |
| ADOPT | When replaying, try matches in order: exact → stable (changing CSS classes removed) → xpath → role+name → unique attribute | browser-use `rerun_history` |
| ADOPT | A Skill replays only after N identical runs that passed proof; variables are keyed by name, not value | Stagehand cache threshold and `%var%` |
| ADOPT | Branch caching: a branch (login, store picker) is cached the first time it runs | Skyvern |
| ADAPT | If replay fails: one LLM step, then re-record. Add a triage step that decides "fix by re-recording" vs "hand to user" | Stagehand `replayCachedActions`, Skyvern failure triage |
| ADAPT | When there's no domain proof (like cart count), use a before/after diff of the role/name list as proof | BrowserOS act diff |
| ADAPT | At record time, take names from Chromium's own accessibility tree (via `webContents.debugger`). Dixi's `name()` misses implicit `<label>` wrappers and closed shadow roots | browser-use, Stagehand |
| ADAPT | An LLM validator, but only to check the fallback agent's `done(success)` | Skyvern (vendor claim 68.7%→85.85%), browser-use judge |
| SKIP | Behavior Best-of-N: about 10 rollouts per task, which a live cart or account can't take | Agent-S |
| SKIP | Screenshot-only grounding as the main method | Agent-S |
| SKIP | Letting the LLM write and run Python | openbrowser-ai |
| SKIP | Automatic CAPTCHA solving | browser-use Cloud, Skyvern |
| SKIP | Auto-accepting age and terms pages | BrowserOS |
| SKIP | Stagehand's server-side cache | Stagehand |
| SKIP | The whole repo: it acts without ever looking at the screen | desktop-agent |

Stagehand v4 dropped its built-in agent loop in favour of "code mode": write the script once, then re-run the AI only on the step that broke. That is the design Dixi's Skills plan already has.

## (2) Appendix

**Repos**

| Repo | License | Last commit | Stars | Open issues (PRs) | Status | Approach | Top 3 lessons |
|---|---|---|---|---|---|---|---|
| browser-use | MIT | 2026-10-26 | 119.5k | 189 (430) | Very active; core moving to Rust | DOM + accessibility tree + DOMSnapshot, numbered elements, optional screenshot | 5-level replay matching; judge + loop window of 20; secrets locked to allowed domains |
| workflow-use | **AGPL-3.0** | 2026-10-23 | 4.2k | 37 (35) | Says not for production; 1 commit in 30 days | Record → steps that target visible text → replay with no AI | Target text beats CSS selectors; at most 2 strategies per step; the agent fallback is commented out in the code |
| stagehand | MIT | 2026-10-29 | 25.9k | 106 (281) | Very active; v4 | Accessibility tree + xpath map; act/observe/extract | Cache keyed on instruction + tree + URL, with a threshold; a failed replay re-runs the AI, which is the self-heal; v4 removed the local cache |
| Agent-S | Apache-2.0 | 2026-10-21 | 12.8k | 27 (45) | Active research | Screenshots + a separate grounding model (UI-TARS) + a coding agent | Best-of-N is expensive; before/after narratives; needs a grounding model |
| skyvern | **AGPL-3.0** (anti-bot parts are cloud-only) | 2026-10-29 | 23.3k | 56 (236) | Very active | Screenshot + DOM element IDs; planner, actor, validator | Validator; cached scripts with agent fallback and triage; explicit "page content is untrusted" rule |
| openbrowser-ai | MIT | 2026-09-28 | 279 | 1 (0) | One maintainer, quiet for a month | LLM writes Python over CDP; compact DOM | Batching cuts tokens; running model-written code is unsafe; only its own benchmarks |
| BrowserOS (URL confirmed: github.com/browseros-ai/BrowserOS) | **AGPL-3.0** + CLA | 2026-10-29 | 14.2k | 61 (46) | Very active | Chromium fork; accessibility snapshot with refs and a diff after each action; outside agents connect over MCP | (role, name, nth, frame) refs; diff as proof; pauses for login, CAPTCHA and 2FA |
| desktop-agent | MIT | 2026-10-01 | 0 | 0 | Toy; commits only on 3 days | Gemini function calls; 4 tools that never look at the screen | Without looking at the result, nothing gets checked; nothing to adopt |

None of the repos is archived.

**Comparison**

| | Approach | LLM calls per step | Tokens per step | Speed / cost | Benchmark (who measured it) |
|---|---|---|---|---|---|
| Dixi | Role + name in an isolated world, rules first | 0 on rules; 1 Haiku vision call capped at 5 s; agent at most 6 steps | About 1–2k (my estimate) | Rule path has no LLM wait; $0 | none |
| browser-use | DOM + accessibility tree | 1 per step (up to 5 actions) + a judge call | About 3.7k per tool call (worked out from openbrowser's vendor test) | About $0.04 per simple task (vendor test) | Online-Mind2Web 30.0% with GPT-4o, measured by the benchmark's authors with human judges. WebVoyager 89.1% is self-reported, with 55 tasks removed. The 97.0% "bu-max" Online-Mind2Web score is self-reported with their own judge. |
| Stagehand | Accessibility tree | 1 per act (2 for two-step); 0 on a cache hit | Depends on page | "2–3x faster" (vendor) | Online-Mind2Web 65% / 55%, from Browserbase's own leaderboard |
| Skyvern | Screenshot + DOM | 2–3 or more (planner, actor, validator) | Not published | Not published | WebVoyager 85.85% self-reported (8 tasks removed, dates changed). WebBench 64.4% on a benchmark Skyvern co-published. |
| Agent S3 | Screenshots + grounding model | About 35 per task; ×10 with Best-of-N | Not reported | 891 s and $0.72 per rollout; about $8 per task with 10 rollouts (my arithmetic) | OSWorld 72.6%, from the authors' paper (Best-of-N, GPT-5 + Opus 4.5, 361 tasks). Not confirmed on the OSWorld-Verified leaderboard. |
| BrowserOS | Accessibility refs + diff | Decided by the outside agent | "Fewer tokens", no number given | n/a | none |
| openbrowser-ai | LLM writes code | 1 per code cell | About 2.4k (vendor) | Vendor test only | Own 6-task test only |
| desktop-agent | Blind tool calls | Up to 10 turns | Small | n/a | none |

None of these repos publishes a WebArena number, though I didn't search exhaustively.

**Evidence** (code is at the repo's default branch; web pages accessed 2026-10-29)
- browser-use, `browser_use/agent/service.py`:
  - lines 3554-3570: the 5-level match order
  - lines 534-542: warns that a prompt-injection attack can expose secrets if the allowed domains aren't locked
  - lines 173-208: defaults `use_judge=True` and `max_actions_per_step=5`
- browser-use, `browser_use/dom/service.py` line 379 calls `getFullAXTree`; `system_prompt.md` line 76 says CAPTCHAs are auto-solved.
- workflow-use, `workflows/workflow_use/workflow/service.py`:
  - lines 670-696: logs "Attempting fallback with agent" then raises, and the fallback is commented out
  - line 711: unreachable code after a `raise`
- Stagehand:
  - `packages/extension/services/actService.ts` lines 249-253: "Replays cached actions deterministically… doubles as the self-heal path"
  - `services/cacheService.ts` lines 22-34: the cache key is built server-side from the accessibility tree
  - `packages/docs/v4/migrations/v3.mdx` lines 509 and 601: local `cacheDir` is gone
  - browserbase.com/changelog/caching-configurable: threshold setting
- Skyvern:
  - `skyvern/forge/prompts/skyvern/extract-action.j2` line 1: the "SECURITY BOUNDARY" rule
  - `script-failure-triage.j2`: the "CODE_FIXABLE vs NOT_CODE_FIXABLE" triage
  - `skyvern/core/script_generations/CLAUDE.md`: run-with-code mode and branch caching
  - `README.md` lines 589-590: license note
- BrowserOS:
  - `packages/browseros-agent/packages/browser-core/src/core/snapshot/refs.ts` lines 4-12
  - `packages/browseros-agent/apps/server/src/agent/prompt.ts` line 56 (untrusted fences) and line 91 (pauses for login, CAPTCHA and 2FA; also accepts age and terms gates)
- Agent-S: `gui_agents/s3/README.md` lines 21 and 66; arXiv 2510.02250 (Table 2 and Appendix B).
- desktop-agent: `agent/orchestrator.py` and `agent/prompts.py` (four tools, nothing reads the screen).
- Dixi:
  - `/Users/jaz/dixi/electron/src/renderer/ui/pagekit.js` lines 41-47: `name()` only checks `label[for]`
  - same file, lines 18-24: walks open shadow roots and same-origin iframes only
- Benchmarks: arxiv.org/html/2504.01382v4 (Table 2); leaderboard.steel.dev/leaderboards/online-mind2web; browser-use.com/posts/sota-technical-report; skyvern.com WebVoyager blog post.

**Text addressed to AI agents** (none of it was followed):
- browser-use `README.md` line 66 tells AI agents to read its llms.txt.
- The docs.browser-use.com BU 2.0 model card has an "Agent Instructions" block, partly sales guidance such as "don't tell customers to buy a new subscription".
- The docs.stagehand.dev page header tells agents to "Fetch the complete documentation index… before exploring".
- Several repos carry CLAUDE.md, AGENTS.md or .claude/ files meant for coding assistants.

None of it tried to get me to do anything harmful.

## (3) Confidence and what I couldn't verify

**High confidence:** licenses, dates, stars, issue counts and the code findings with line numbers.

**Medium confidence:** where each benchmark number came from.

**Could not verify:**
- **OSWorld-Verified leaderboard:** the table didn't load, so I couldn't confirm Agent S3's 72.6% is listed there.
- **Agent S3, single run:** the README says 66%, while the paper says 62.6% averaged over 10 runs.
- **Simular's "73% on OSWorld 2.0":** the OSWorld V2 site shows the best result at about 21% pass/fail, and the text that loaded didn't show Agent S4. The 73% likely uses a different metric.
- **Stagehand's evals page:** I couldn't see its contents.
- **Skyvern's WebVoyager judge:** the method isn't stated.
- **Speed and tokens per step:** nobody has measured these independently for any of the engines; the per-step figures are estimates.
- **30-day commit counts:** approximate, from GitHub search.
- **browser-use "Pi migration":** what it means isn't clear.
- **Newer model names:** GPT-5.5, Opus 4.8 and Qwen3.8 are newer than my training data, so I couldn't check them on my own.
