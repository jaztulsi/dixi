# Verification pass (22 of 22 claims)

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.

---

I checked all 22 claims and re-opened each source on 2026-10-29. Most hold. Three need a correction or a wording change (#6, #20 and the "Holmes not found" report), and nothing is fully unverifiable.

## (1) Verdict table

| # | Verdict | Correct value / note | Source |
|---|---|---|---|
| 1 | VERIFIED | The license endpoint returns 404. There are 50 commits on main, the first at 2026-02-13T19:28Z and the last at 2026-02-15T17:26Z. | `gh api repos/ledaniel0/treehacks2026/{license,commits}` |
| 2 | VERIFIED | It is a scripted food-poisoning scenario with an "allergic to Aspirin" thread. It prints fake console lines such as "Commerce agent calls Elasticsearch tool". | `server/src/test/responses.ts` lines 42-87 |
| 3 | VERIFIED | `handler.ts` lines 2 and 4 import `../tts/openai.js` and `../stt/openai.js`. On main, `tts/` contains only `cartesia.ts` and `stt/` contains only `deepgram.ts`. | `gh api .../contents/server/src/{tts,stt}` |
| 4 | VERIFIED | The repo exists and is GPL-3.0 (last push 2026-10-01). README line 71 reads: "Tested against ~57 adversarial prompts designed to bypass this. All blocked." | `gh api repos/tryholmes/holmes-local` |
| 5 | VERIFIED | Shared Inference lists only `gpt-oss-120b` and `qwen-3.8-27b`. The image-inputs page says qwen-3.8-27b takes images on Shared and Dedicated, and calls the feature "Public Preview". The overview page itself does not mention images. | inference-docs.cerebras.ai `/models/overview`, `/capabilities/image-inputs` |
| 6 | CORRECTED (small) | The tier is named "Free Trial", not "Free". The limit is 5 RPM per model, plus 30K uncached TPM, 90K total TPM and 1M tokens per day. Images are capped at 2 per request with a 10 MiB payload. | `/support/rate-limits` |
| 7 | VERIFIED | Shutdown is Jan 6, 2027 for both gpt-4o-mini-tts snapshots. It was announced 2026-10-01. tts-1 and tts-1-hd shut down the same day, and the named replacement is `gpt-realtime-2.1-mini`. | developers.openai.com/api/docs/deprecations |
| 8 | VERIFIED (stale) | A commenter (chrbsg, 2020) wrote: "the only audio that is cancelled is audio received on the RTCPeerConnection audio track." In 2022 the same person said Chrome does "*not*" cancel Web Audio. These are 2020-22 user comments; a `chrome-wide-echo-cancellation` flag was reported then. | github.com/webrtc/samples/issues/1243 |
| 9 | VERIFIED | The Browser Use row shows 30.0 under Human SR. The row does not say "GPT-4o"; the appendix names GPT-4o as its backbone. | arXiv 2504.01382 HTML, Table 2 |
| 10 | VERIFIED | Skyvern, BrowserOS, workflow-use and Accessible-AI-Agent are AGPL-3.0. browser-use and stagehand are MIT. | `gh api repos/*` license field |
| 11 | VERIFIED | SETUP.md line 8: "You, an AI assistant, will follow this file to set up the agent…" | `gh api .../contents/SETUP.md` |
| 12 | VERIFIED | The block happened the night of Sept 20, 2026. The SEJ article is dated 2026-09-29, by Slobodan Manic, and is republished from No Hacks. | searchenginejournal.com/…/590494 |
| 13 | VERIFIED (medium confidence) | The panel vacated the injunction on 2026-08-04 (Cooley, Leagle). The en banc denial is dated Sept 10, 2026 per a search summary and the court PDF's creation metadata. I could not read the FILED stamp in the PDF. | courthousenews.com PDF; Cooley 2026-08-06; Mealey's 2026-09-29 |
| 14 | VERIFIED | The FTC voted 3-0 on April 22, 2025 to approve the final order, which includes the $1M payment. | ftc.gov press release, 2025/04 |
| 15 | VERIFIED | The interim final rule was published April 20, 2026. Entities with 50K+ population move from 2026-04-24 to 2027-04-26. Those under 50K and special districts move from 2027-04-26 to 2028-04-26. | LMC, UNC SOG, Jackson Lewis |
| 16 | VERIFIED | 78.3% default, 41.67% keyboard-only, 28.3% magnifier. Source is the A11y-CUA paper (Mohanbabu et al., 2026-02-10). | arXiv abs/2602.09310 |
| 17 | VERIFIED | 89% internet use for 65+ comes from a survey run Jan 30 to Jun 18, 2026, down from 90%. 23% chatbot use comes from a different survey, run Feb 17-23, 2026. | Pew internet fact sheet; Pew 2026-06-17 report |
| 18 | VERIFIED | KEYT republished a CNN piece on 2026-09-23. The Resy quote was originally given to Restaurant Business. | keyt.com/?p=1478857 |
| 19 | VERIFIED (stale) | 123 test cases across 29 scenarios: 23.6% without mitigations, 11.2% with them. The post is from Aug 25, 2025 (1,000-user pilot) and the URL now redirects to claude.com/blog. | claude.com/blog/claude-for-chrome |
| 20 | CORRECTED | 72.6% is "Agent S3 w/ BJudge (N=10)" using GPT-5 plus Opus 4.5, at 100 steps (v2, Feb 2026). With GPT-5 alone it is 69.9%. v1 of the paper reported "bBoN" at 69.9%. Agent S3 on a single run is 62.6% (average of 10 runs). | arXiv 2510.02250 v1 and v2 |
| 21 | VERIFIED | `main.js:356` reads `on('deepgram:audio', (chunk) => deepgram.sendAudio(chunk))`. The renderer side (`voice.js:131`, `mic.js`) has no VAD or silence gate either. `name()` (pagekit.js lines 41-47) only looks up `label[for]`; wrapping labels are handled only in the radio helpers (lines 363-462). `main.js:147` strips tokens matching `/\s(Electron\|dixi\|Dixi)\/\S+/`. | Local files |
| 22 | VERIFIED | MIT license. `default_hold_threshold_ms()` returns 300 (settings.rs line 576), and the UI falls back to 300 too. | `gh api` and code search |

## (2) Contradictions and stale data

- **Holmes:** the report that said it couldn't be found is wrong. The repo exists, is GPL-3.0 and was active as of 2026-10-01.
- **#20:** reports mixing "Best-of-N" with 72.6% are blending two paper versions. Cite it as "Agent S3 + BJudge, GPT-5+Opus 4.5, 72.6% (surpasses human 72.36%)", or 69.9% if only GPT-5 is meant.
- **#17:** the two Pew numbers come from separate surveys, so don't present them as one dataset.
- **#5 and #6:** model availability and tier names on Cerebras change often. Re-check both before the plan ships.
- **Stale:** #8 (2020-22 forum comments, and Electron behaviour should be tested rather than assumed), #9 (April 2025 benchmark that predates current agents), #19 (Aug 2025 pilot numbers, never updated on that page), #14 (April 2025).
- **#12:** Amazon's stated reasons come through GeekWire and Amazon itself. Meta's side is a single denial.

## (3) Coverage and what to mark UNVERIFIED

I checked 22 of 22 claims (100%). None needs to be marked UNVERIFIED. Three should be qualified in the plan:
- **#13:** keep the Sept 10 date but label it medium confidence until someone reads the FILED stamp on the order.
- **#20:** replace with the corrected wording above.
- **#8:** label it as historical behaviour that needs testing in Electron.

Sources: [Cerebras models](https://inference-docs.cerebras.ai/models/overview), [Cerebras image inputs](https://inference-docs.cerebras.ai/capabilities/image-inputs), [Cerebras rate limits](https://inference-docs.cerebras.ai/support/rate-limits), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [webrtc/samples#1243](https://github.com/webrtc/samples/issues/1243), [arXiv 2504.01382](https://arxiv.org/html/2504.01382), [arXiv 2602.09310](https://arxiv.org/abs/2602.09310), [arXiv 2510.02250v2](https://arxiv.org/html/2510.02250v2), [Claude for Chrome](https://claude.com/blog/claude-for-chrome), [SEJ Muse](https://www.searchenginejournal.com/amazon-blocked-metas-muse-and-robots-txt-had-nothing-to-say/590494/), [CHN en banc PDF](https://www.courthousenews.com/wp-content/uploads/2026/09/amazon-perplexity-no-rehearing.pdf), [Cooley](https://www.cooley.com/news/insight/2026/2026-08-06-ninth-circuit-rules-on-ai-agent-access-to-third-party-websites-under-cfaa), [Mealey's](https://www.mealeys.com/mealeys/mealeys-artificial-intelligence/articles/2531276/9th-circuit-won-t-rehear-perplexity-agentic-ai-vacated-injunction-ruling), [FTC accessiBe](https://ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million), [LMC DOJ](https://www.lmc.org/news-publications/news/all/doj-extends-web-accessibility-compliance-deadlines-for-local-governments/), [Pew fact sheet](https://www.pewresearch.org/internet/fact-sheet/internet-broadband/), [Pew AI by age](https://pewresearch.org/internet/2026/06/17/how-opinions-and-use-of-ai-differ-by-age), [KEYT](https://keyt.com/?p=1478857).

Local files checked: `/Users/jaz/dixi/electron/src/main/main.js`, `/Users/jaz/dixi/electron/src/renderer/ui/pagekit.js`, `/Users/jaz/dixi/electron/src/renderer/core/voice.js`, `/Users/jaz/dixi/electron/src/renderer/ui/mic.js`.
