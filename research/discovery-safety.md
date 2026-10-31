# Discovery pass + safety guardrails

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.
>
> Source check 2026-10-29: AgentDojo 47.69% → 6.84% (GPT-4o 2024-05-13, important_instructions, tool_filter) matches agentdojo.spylab.ai/results. The buried-injections figures (319/629 at 2/97) match its README, but that benchmark is one author’s and has not been peer-reviewed.

---

**Prompt-injection and dark-pattern defenses for Dixi: research report (October 2026)**

## (1) Summary

**Discovery.** The most useful recent projects are code-level action gates and replay registries, not voice agents. The voice and accessibility repos are mostly hackathon-grade.
- **Guardian blueprints:** Progent checks every tool call against a privilege policy with a deterministic procedure. PIC makes an action carry its intent, the sources behind it and its evidence before the gate allows it.
- **Skills analogue:** `selfxyz/agent-checkout-skill` is a working registry of checkout recipes. Each recipe has a verified or unverified status, notes known dead ends, and hands off to a human on 3DS or CAPTCHA.
- **Why Guardian can't be a classifier:** `buried-injections` tested 10 open-source injection detectors against 629 AgentDojo attacks hidden in tool output. The best one caught 51% at a 2% false-alarm rate. Meta's Prompt Guard 2 caught 1% at its default threshold.
- **Closest architecture:** jev-cua turns speech into typed decisions, then into verified accessibility actions. It has 1 star.

**Safety.** By October 2026 the evidence agrees that prompt-based defenses and detectors only slow attackers down. "The Attacker Moves Second" (October 10, 2025) bypassed 12 published defenses, with attack success above 90% for most. The defenses that hold are code-enforced:
- the dual-LLM split
- CaMeL: 77% of AgentDojo tasks solved with provable security, against 84% for an undefended agent
- tool filtering: GPT-4o attack success fell from 47.69% to 6.84%
- privilege policies, as in Progent
- Meta's Rule of Two

The vendors mostly rely on training plus classifiers. Anthropic's own numbers fall from 23.6% (August 2025) to 1.4% for Opus 4.5 (November 2025), then to 0–0.3% with probes and an action classifier (August 2026). All of these are first-party evaluations. Dark patterns are a separate problem that nobody has solved: DECEPTICON steered agents in over 70% of tasks, against 31% for humans, and larger models were more susceptible.

**For Dixi.** Dixi's main path already has the CaMeL shape: a trusted plan made before the page is read, then a deterministic executor. There are two holes:
1. **Page-derived values reach the gate.** Tag where every value came from, and require gated values (amount, payee, date) to come from the utterance or from the spoken confirmation.
2. **The fallback agent has all three Rule-of-Two properties.** It reads untrusted pages, works inside logged-in sessions, and can submit. Remove its ability to pass the gate, limit it to the actions the plan allows, and have it return only typed values.

## (2) Appendix

**Discovery** (push date is the last push; all checked October 29, 2026)

| Repo | License | Push | Stars | Idea for Dixi | Flag |
|---|---|---|---|---|---|
| github.com/sunblaze-ucb/progent | MIT | 2026-10-26 | 59 | Deterministic per-tool-call policy. A solver auto-applies updates that narrow it; updates that widen it need approval. Model for Guardian. | active |
| github.com/pic-standard/pic-standard | Apache-2.0 | 2026-10-28 | 69 | The action proposal must carry intent, sources and signed evidence before the gate. Matches typed-value grounding. | active |
| github.com/cordum-io/cordum | BUSL-1.1 (not open source) | 2026-10-28 | 510 | Action firewall: policy plus human approval. Study the rule format only. | active, license caution |
| github.com/rudratoshs/buried-injections | MIT | 2026-10-24 | 30 | Detectors miscalibrated: Prompt Guard 2 goes from 1% to 97–100% caught (about 5% false alarms) at threshold 0.003. Calibrate before relying on one. | active |
| github.com/selfxyz/agent-checkout-skill | MIT | 2026-10-29 | 2 | Platform and merchant checkout recipes with status and dead-end types. Template for the Skills schema. | active (see section 3) |
| github.com/Basis-Theory-Labs/agent-checkout | MIT | 2026-10-13 | 0 | A tokenizing proxy fills the card, so the agent never holds the card number. Keeps card data out of the LLM and SQLite. | new, unproven |
| github.com/OpenAdaptAI/OpenAdapt | MIT | 2026-10-29 | 1,845 | A person shows the task once; it becomes a replayable automation. | active |
| github.com/rrweb-io/rrweb | MIT | 2026-10-28 | 20.3k | DOM snapshot and change recording, for capturing Skills and replaying audits. | active |
| github.com/Lee-Dongwook/E2E-Self-Heal (alternative: mdowis/anansi, Apache-2.0, 117 stars) | MIT | 2026-10-29 | 9 | Repairs broken selectors, then re-runs to verify. Pattern for Skill self-healing. | active, small |
| github.com/microsoft/magentic-ui | MIT | 2026-09-23 | 10.1k | Co-planning, approval before actions, plan reuse. Features are from memory; the repo now calls itself "MagenticLite". | active |
| github.com/edgeteamio/jev-cua (plus Ayushmaniar/jev-voice-computer-use) | MIT | 2026-09-29 | 1 | Speech, then typed decisions, then verified macOS accessibility actions. | quiet for a month |
| github.com/0xv3nm09/blind-run | MIT | 2026-10-27 | 0 | A virtual screen reader transcript proves a task can be finished by ear. Test harness for the blind-user phase. | hackathon |

Also noted:
- `Kevin-Liu-01/Jarhead` (MIT, 30 stars): wake word plus Touch ID before acting.
- `meta-llama/PurpleLlama` (pushed 2026-10-12): LlamaFirewall.
- `ethz-spylab/agentdojo`: last push 2026-06-02, outside the 90-day window.
- `facebookresearch/wasp`: archived.
- SusBench repo: no license, stale since 2025-10-11.

**Safety defenses**

| Defense | Type | Evidence (source, date) | Dixi mapping |
|---|---|---|---|
| Dual LLM | Code (architecture) | Simon Willison, April 2023. No benchmark numbers. | The planner that reads the utterance is the privileged model. Any model that reads the page is quarantined: it only fills typed slots by reference and never steers the plan. |
| CaMeL | Code: interpreter tracks capabilities and data flow | arXiv 2503.18813 (v1 March 24, 2025; v2 June 24, 2025). 77% of AgentDojo tasks with provable security vs 84% undefended. | The strict-JSON plan plays the role of CaMeL's program. Add source tags to values; the gate rejects a payee or amount that came from the page unless confirmed by voice. |
| Design patterns paper | Code (architecture) | arXiv 2506.08837 (June 10, 2025). Pattern names are from memory: action-selector, plan-then-execute, map-reduce, dual LLM, code-then-execute, context-minimization. | Dixi already follows plan-then-execute. The fallback agent breaks it. |
| Spotlighting / datamarking | Prompt | arXiv 2403.14720 (March 20, 2024): more than 50% down to under 2% in the authors' tests. AgentDojo's delimiting variant: GPT-4o only 47.69% to 41.65%. | Cheap extra layer for the fallback agent only. Never something to rely on. |
| Tool filter | Code-ish: allowed tools fixed before any untrusted data | AgentDojo results page: GPT-4o 47.69% to 6.84%. | Equivalent to the plan fixing the allowed actions before the page is read. Apply the same limit to the fallback agent. |
| Progent | Code (deterministic policy) | arXiv 2504.11703 (v3 May 14, 2026). The abstract gives no numbers. | Write Guardian's rules as a small policy language checked in code. |
| Rule of Two | Design rule, can be enforced in code | Meta, October 31, 2025. At most two of: untrusted input, sensitive access, state change. All three requires supervision. | The fallback agent has all three. Either remove its ability to change state or force every change through the gate. The spoken confirmation is the supervision. |
| "The Attacker Moves Second" | Evaluation | arXiv 2510.09023 (October 10, 2025). 12 defenses bypassed, most above 90%. 40 human red-team challenges in AgentDojo. | Count only code invariants as security. |
| OpenAI Atlas | Mostly model, some product code | October 22, 2025: logged-out mode; Watch Mode (the tab must stay active on sensitive sites); adversarial training. December 22, 2025: an automated attacker trained with reinforcement learning. No Atlas attack success rate published. | Run the fallback agent logged out where possible. Narrate aloud and pause when the user steps away. |
| Anthropic Claude in Chrome | Model plus classifiers (machine learning, not deterministic) | August 26, 2025: 23.6% to 11.2%; browser-specific attacks 35.7% to 0%. November 24, 2025: Opus 4.5 from 8.0% to 1.4% (Best-of-N attacker, 100 attempts). August 26, 2026: probes on tool results plus an action-vs-request classifier; Opus 5 3.8% to 0%; Fable 5 0.3%. | Their action classifier compares each action with the original request. Dixi can do that check in code against the JSON plan. |
| AgentDojo | Benchmark | arXiv 2406.13352 (June 2024): 97 tasks, 629 security cases. GPT-4o: 69.07% utility, 47.69% targeted attack success. Claude 3.5 Sonnet: 1.11%. | Port its banking and travel cases to test the fallback agent. |
| WASP | Benchmark | arXiv 2504.18575 (April 2025): attacks partially succeed in up to 86% of cases; agents rarely complete the attacker's goal. | Current agents are partly safe because they are bad at finishing attacks. That won't last as models improve. |
| InjecAgent | Benchmark | arXiv 2403.02691 (ACL Findings 2024): 1,054 cases. ReAct GPT-4 24%; a "hacking prompt" nearly doubles it. | Test cases for plugins and MCP tools. |
| DECEPTICON | Benchmark (dark patterns) | arXiv 2512.22894 (December 28, 2025): 700 tasks; over 70% steered vs 31% for humans; prompting and guardrail models don't consistently help. | Guardian's dark-pattern checks must run in code on the DOM, not in a model. |
| SusBench | Benchmark (dark patterns) | arXiv 2510.11035 (IUI 2026): 313 tasks, 55 sites, 9 pattern types. Preselection, trick wording and hidden information were the worst. No numbers in the abstract. | First Guardian rules: detect preselected checkboxes, compare the final total with the planned amount, flag wording. |

## (3) Confidence and what I could not verify

**Confidence:** high for repo metadata and arXiv dates and numbers. Medium for vendor numbers.

**Not verified:**
- OpenAI's December 22, 2025 Atlas post returned a 403, so I only have secondary coverage. ChatGPT agent's "99.5%" figure is also secondary only.
- The Opus 5 system card numbers come only from secondary coverage. The model names Fable 5, Mythos 5 and Opus 4.8 are newer than my training data; I took them from claude.com as fetched.
- From memory, not checked this session: WASP's "0–17%" figure, Progent's AgentDojo numbers, the design-pattern names, and Magentic-UI's features.
- Human success rates in "The Attacker Moves Second".
- Atlas-specific attack success rates: none found.

**Text aimed at AI agents:** nothing in the repos tried to instruct me. The only match was a sample attack string in the `buried-injections` README, shown as a dataset example. Separately, `agent-checkout-skill` tells the agent using it to query a live third-party API and send findings back to it. That is a supply-chain risk if you adopt it.

Sources: [CaMeL](https://arxiv.org/abs/2503.18813), [Attacker Moves Second](https://arxiv.org/abs/2510.09023), [Meta Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/), [Anthropic, November 2025](https://www.anthropic.com/research/prompt-injection-defenses), [Claude in Chrome GA](https://claude.com/blog/claude-in-chrome-generally-available), [Claude for Chrome 2025](https://www.anthropic.com/news/claude-for-chrome), [Atlas hardening](https://openai.com/index/hardening-atlas-against-prompt-injection), [Willison on Stuckey](https://simonwillison.net/2025/Oct/22/openai-ciso-on-atlas/), [Opus 5 coverage](https://the-decoder.com/opus-5-may-have-solved-browser-based-prompt-injection-the-biggest-security-flaw-haunting-ai-agents/), [AgentDojo](https://arxiv.org/abs/2406.13352), [AgentDojo results](https://agentdojo.spylab.ai/results/), [WASP](https://arxiv.org/abs/2504.18575), [InjecAgent](https://arxiv.org/abs/2403.02691), [DECEPTICON](https://arxiv.org/abs/2512.22894), [SusBench](https://arxiv.org/abs/2510.11035), [Spotlighting](https://arxiv.org/abs/2403.14720), [Progent](https://arxiv.org/abs/2504.11703), [Design Patterns](https://arxiv.org/abs/2506.08837).
