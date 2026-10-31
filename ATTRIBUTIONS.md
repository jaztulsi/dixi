# Attributions

Dixi's code is our own. The projects below shaped ideas only: we read them, then wrote our own version from scratch. **No code was copied from any of them.** Where a project is GPL, AGPL or unlicensed, that rule is strict; for permissive projects it is still how we worked.

| Project | License | What it gave us (ideas) |
|---|---|---|
| [Holmes Local](https://github.com/tryholmes/holmes-local) | GPL-3.0 | One screenshot only when called, then point or act; playbooks (do it once, replay it); an autonomy dial; risky actions blocked in code, not by the model; local full-text memory that keeps where each fact came from |
| [VisionOS (TreeHacks 2026)](https://github.com/ledaniel0/treehacks2026) | none (all rights reserved) | A liquid-glass assistant panel; spoken progress while it works; a memory lookup alongside the request |
| [Clicky](https://github.com/farzaa/clicky) (the "OpenClicky" idea) | MIT | A helper beside your cursor that sees the screen, talks, and points at where to click on the real screen |
| TreeHacks "Hive" (Claude Code swarm idea) | n/a | Several Claude Code workers on one task, each able to start its own helpers |
| [Progent](https://github.com/sunblaze-ucb/progent) | MIT | Safety rules as a small policy table checked in code; narrowing a rule is automatic, widening one needs approval |
| [Stagehand](https://github.com/browserbase/stagehand) | MIT | Replay a run that worked, and fall back to the AI for one step when the page changed |
| [browser-use](https://github.com/browser-use/browser-use) | MIT | Matching a saved step to the page by role and name, from strict to loose |
| [BrowserOS](https://github.com/browseros-ai/BrowserOS) | AGPL-3.0 | Steps saved as (role, name, position); a before/after check as proof a step worked |
| [screen-voice-agent](https://github.com/sambuild04/screen-voice-agent) | MIT | "That wasn't me" undo, hard-stop words, ignoring Dixi's own echo. (Its auto-approve after a timeout is what we refuse: silence means no.) |
| [pipecat](https://github.com/pipecat-ai/pipecat) | BSD-2 | Only reversible steps may run while you're still talking |
| [livekit/agents](https://github.com/livekit/agents) | Apache-2.0 | Ignore interruptions while echo cancelling warms up; resume after a false one |
| [Handy](https://github.com/cjpais/Handy) | MIT | One key that toggles listening |
| mem0, Letta, Graphiti | Apache-2.0 | Memory that supersedes old facts instead of overwriting them; a few core facts always in the prompt |
| [travel-agent](https://github.com/Prism-Shadow/travel-agent), [restaurant-cli](https://github.com/omarshahine/restaurant-cli) | Apache-2.0, MIT | Only the confirm step can mark something confirmed; never report a booking it can't see |
| Claude computer use (Anthropic) | API | The click-and-type loop on any Mac app |

Also read, for smaller ideas or lessons (again, no code copied):

| Project | License | Idea or lesson |
|---|---|---|
| [VoxStride](https://github.com/kellypiercelab/voxstride) | MIT | What Dixi says matches what it shows; a status changes only once it's confirmed |
| [echonav](https://github.com/AryamanSharma14/echonav) | none | Every state shown as colour, label and symbol; a panel that never steals focus |
| [voice-os-agent](https://github.com/benk-007/voice-os-agent) | MIT | Try a new routine as a dry run first; allow-lists decide, never model confidence |
| [Accessible-AI-Agent](https://github.com/Zatoichi420/Accessible-AI-Agent) | AGPL-3.0 | Confirm tiers (the yes repeats the amount); silence means no |
| [workflow-use](https://github.com/browser-use/workflow-use) | AGPL-3.0 | Find a step's target by visible text and role, not by page code |
| [Skyvern](https://github.com/Skyvern-AI/skyvern) | AGPL-3.0 | Sorting failures into "record again" vs "hand to the user"; page content is untrusted |
| [openbrowser-ai](https://github.com/billy-enrizky/openbrowser-ai) | MIT | Several agent actions in one step, each still checked |
| [dinner-reservagent](https://github.com/tylav03/dinner-reservagent) | GPL-3.0 | One attempt key so a booking is never made twice |
| [booking-agent](https://github.com/satyadesai9900/booking-agent) | none | Confirmations go only to your own typed email |
| [treehacks-amogus](https://github.com/samarth-bhargav/treehacks-amogus) | none | Confidence intervals when comparing two test runs |
| [PIC standard](https://github.com/pic-standard/pic-standard) | Apache-2.0 | Every checked action carries its intent and where each value came from |
| [buried-injections](https://github.com/rudratoshs/buried-injections) | MIT | No injection detector counts as a defence; its categories shape our tests |
| [agent-checkout-skill](https://github.com/selfxyz/agent-checkout-skill) | MIT | Saved routines mark known dead ends and hand-off points (card checks, CAPTCHAs) |
| [OpenAdapt](https://github.com/OpenAdaptAI/OpenAdapt), [rrweb](https://github.com/rrweb-io/rrweb) | MIT | "Show me once" recording |
| [E2E-Self-Heal](https://github.com/Lee-Dongwook/E2E-Self-Heal) | MIT | Repair a step, then run it again to prove the repair |
| [magentic-ui](https://github.com/microsoft/magentic-ui) | MIT | Read the plan back before a many-step task |
| [jev-cua](https://github.com/edgeteamio/jev-cua) | MIT | Speech → a typed decision → a checked desktop action |
| [blind-run](https://github.com/0xv3nm09/blind-run) | MIT | Test that a task can be done by ear alone |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | Apache-2.0 | Send only what changed after a step; skip unchanged screenshots |
| [cordum](https://github.com/cordum-io/cordum) | BUSL-1.1 | Its rule format, studied only |
| AgentDojo, InjecAgent, WebArena, Online-Mind2Web | various | Kinds of test cases, written again as our own |

Data used at runtime: [StevenBlack hosts](https://github.com/StevenBlack/hosts) (MIT), [Wikidata](https://www.wikidata.org) (CC0).

The full research, with links and what we chose not to take, is in [`research/`](research/) and [`plan/`](plan/).
