# Dixi: the plan to be the best

Dixi is a voice browser for people a mouse leaves behind: older adults, and people with tremors, low vision or limited mobility. This plan covers four things:
- the one point where Dixi can be ten times better than every competitor;
- the three ideas that deliver it;
- what's in the back pocket for later, Arduino included;
- why each choice was made.

Everything here runs free: no new paid accounts, and nothing that bills per use beyond the keys Dixi already has.

---

## 1. Where the competition is (October 2026)

| Product | What's unique | Where it falls short for Dixi's users |
|---|---|---|
| **ChatGPT Atlas** (OpenAI) | A full browser with an agent mode that clicks, scrolls and fills carts; it pauses on sensitive sites | Typing-first; a model decides every click, so it's slow and paid |
| **Perplexity Comet** | Free browser, assistant on every page, voice mode | Same per-click model loop; built for power users |
| **Gemini in Chrome** | "Skills": saved prompts rerun with a slash; Auto Browse for chores (paid) | A Skill is a saved *prompt*, so every run is a new model run |
| **Meta Muse** (Sept 8, 2026) | Cloud browser, a "Sentinel" that approves each action, one-time card numbers, memory | Runs in Meta's cloud; US only; a general assistant, not built for people who can't use a mouse |
| **OpenAI's device** (Jony Ive) | Screenless hardware, announced for late 2026 | Not shipped |
| **browser-use workflow-use** | "Record once, reuse forever": deterministic replay of recorded steps | A developer tool; its self-healing is listed as planned, not shipped |
| **Rabbit R1 teach mode** | Show it a task once, it repeats it | Cloud-run and unreliable in reviews |
| **ElliQ, GrandPad** | Companion robot and simplified tablet for seniors | Locked-down, on subscriptions; they don't act on real websites |
| **Apple Voice Control, Windows Voice Access** | Free, built into the OS | You still click by naming every button; there's no understanding of goals |

### Three facts that decide the plan

1. **Every AI browser can be tricked by the page it's on.**
   - **DECEPTICON** (Dec 2025): across 700 tasks, today's web agents fall for dark patterns *more often than humans*. More capable models are *more* vulnerable. Prompting and guardrail models don't reliably fix it.
   - **SusBench** (2025): preselected options, trick wording and hidden information fool both people and agents.
   - A defense written in code, not in a prompt, is the open gap.
2. **The people Dixi serves are the most targeted.** Adults 60+ lost **$7.7 billion** online in 2025, about 60% more than in 2024 (FBI IC3, via AARP). Older adults are **four times** as likely to lose money to a tech-support scam (FTC).
3. **Nobody gets cheaper or faster with use.** Atlas, Comet, Gemini and Muse pay a large model on every click, every time. Replay-without-AI exists only as a rough developer tool.

---

## 2. The key point: ten times better

**Dixi is the AI browser that gets faster and cheaper every time you use it, and that a web page can't trick.**

- Competitors stay slow, paid and gullible forever, because a model makes every decision on every visit.
- Dixi compiles what works into plain, checked programs that replay with **zero AI calls**.
- Dixi puts a firewall written in code between every page and every action.

For a grandparent, those three properties (instant, free, can't be scammed) are the whole product.

---

## 3. Step 0: fix what failed on sites Dixi had never seen

Dixi was tested on 23 steps across sites it was never tuned on: Shopify stores, Allrecipes, GitHub, Hacker News, eBay, NASA, Khan Academy, Wikipedia, plus tabs, knowledge questions and a nonexistent site.
- **17 of 23 passed.** Every non-shopping site passed.
- The 6 failures come from 4 general causes, fixed in general code (no site-specific code):

1. **Category tiles taken for results.** Product cards will be ranked first: a link with a price near it, an image, a product-style path. Tiles that lead to collections will be skipped when products exist.
2. **Size pickers made of buttons weren't seen as choices.** Button groups that behave like options (`aria-pressed` / `aria-checked` / one selected among siblings under a heading like "Size") will be read as options.
3. **No built-in sort.** A `sort` action: it finds the page's sort control (a dropdown or a "Sort" menu), picks "lowest price / newest / top rated", and checks the list or address changed.
4. **Screenshot capture failed** (`UnknownVizError`), which disabled the visual fallback. It will retry the capture without a crop.

---

## 4. The three ideas

### Idea 1: Skills. Learn once, replay forever with no AI (the 10x engine).

**What you see.**
- The second time you ask for something, Dixi does it in a second or two and says "Using your skill · no AI".
- A caregiver can say "Dixi, watch me", do a task once by hand (refill a prescription, pay the electric bill up to the confirm page), then say "call it pay my electric bill". From then on, Grandma just says that sentence.

**How it works.**
- **Recorder.** Inside each page's isolated world (pages can't see or spoof it), listeners catch real clicks, choices and typing.
  - Each element is described in several ways at once: role, accessible name, visible text, label, nearest heading, structural path and position.
  - Values typed into passwords, card numbers or codes are **never recorded**.
- **Compiler.** A successful task becomes a JSON skill, readable by a person and shareable.
  - It's made from the steps that actually ran, plus what each step *proved*: the address changed, the cart count went up, the video is playing, the text appeared.
  - Words from what you said that show up in what was typed or picked become blanks to fill: "order a **large** latte" → `{size}`.
- **Replay.**
  - The new sentence is lined up against the skill's template to fill the blanks.
  - Each step finds its element again by scoring all the descriptions. It acts only when the match is at least 0.75 *and* clearly ahead of the runner-up.
  - Every click still passes the purchase gate, and every step checks what it proved last time.
- **Self-healing.** When a site changes:
  - Only that one step goes to the AI, with the old description.
  - The fix is written back into the skill as a readable change, and the replay carries on.
  - If healing fails twice, Dixi says what changed and stops.
- **Why it's 10x.** The first run costs what it costs today. Every run after that costs **$0** and finishes in seconds, while competitors keep paying a model for every click.

### Idea 2: Guardian. A firewall against scams and dark patterns (the demo star).

**What you see.** Dixi stops and says one calm sentence, with the evidence line underneath, the same way answers show their source. For example:
- "Careful: this page put a $4.99 protection plan in your cart by itself. Want me to take it out?"
- "This is a fake virus warning. Close it, and don't call the number."
- Optionally, a caregiver's phone gets a short note.

**What it checks, entirely in code.**
- **Pages pretending to be someone else.**
  - Look-alike letters (punycode, Unicode confusables) are reduced to a skeleton.
  - Near-spellings of well-known sites come from a generated public top-sites list; no brand names are written in Dixi's code.
  - A brand's name hidden in an unrelated domain (`amazon.com-secure.xyz`).
- **Brand-new domains.** The registration date comes from public RDAP (free, no key). Under 30 days old *and* asking for payment or a login → warning.
- **Known bad sites.** The free abuse.ch URLhaus list.
- **Tech-support scams.** Fullscreen traps, "virus / infected / do not close" with a phone number, alarm sounds.
- **Odd payment demands.** Gift cards, crypto or wire transfers asked for by a site that isn't a bank.
- **Dark patterns in carts and checkouts.**
  - Pre-ticked add-ons (protection, insurance, donations, subscriptions);
  - countdown timers (read twice, a second apart);
  - "only 2 left" and "12 people viewing";
  - guilt-trip "No thanks" links;
  - fees that appear only at checkout;
  - auto-renewal wording next to the main button.

**How it's wired.**
- A scan runs after each page opens, without slowing anything.
- It also runs *before* every add, checkout, pay or confirm. Serious findings block the action with a question.
- The AI agent gets the findings as trusted facts, and the purchase gate refuses upsell clicks you didn't ask for.
- That's the protection DECEPTICON says prompts can't provide.

**Demo pages.** Shipped with the tests: a fake look-alike store with a countdown and a pre-ticked warranty, a fake virus warning, and a gift-card payment page.

### Idea 3: Simple View, in your language (accessibility 10x).

**What you see.** "Dixi, make this simple" lays a calm, huge-type panel over any website:
- the page's title;
- a two-sentence summary, each sentence checked against the page;
- up to six giant buttons for what you can actually do there ("Add to cart", "Read the ingredients", "Next page");
- "Read it to me".

Forms become a **spoken interview**, one question at a time. Passwords and card numbers are always handed back to you.

**In your language.** Speak Spanish, Hindi, Punjabi or Chinese. Dixi works the English site, and labels and answers in your language.

**How it works.**
- The page's main content and its main actions are found in code. Headers, menus and footers are left out, and actions are ranked by size and position.
- Buttons press the real page through Dixi's checked actions, and the panel refreshes on each new page.
- Speech-to-text takes the chosen language, from the same provider as today.
- One fast, cheap model call per page translates the labels and summary, and the result is cached.
- The voice uses the multilingual model, with the system voice as fallback.
- Design: marble and glass, at least 28 px type, 64 px buttons, full keyboard and switch access, high contrast.

---

## 5. Back pocket (later, not in the three)

- **Arduino "Dixi Puck."**
  - A big tactile talk/stop button, plus an LED ring that mirrors Dixi: white while listening, gold while working, green when done, red when Guardian stops something.
  - A small buzzer, and a rotary knob for "next / previous".
  - It connects with Web Serial (Electron's `select-serial-port` picks the Arduino by its USB vendor ID 0x2341), using about 30 lines of Arduino code.
  - For people who can't find a keyboard shortcut, it's one big button.
- **Arduino presence pad.** A motion or distance sensor that pauses Dixi when you walk away. It does what the camera feature does, without a camera.
- **Meta Ray-Ban glasses.** Through Meta's Wearables Device Access Toolkit, a phone app bridges the glasses' camera to Dixi: "read this letter and pay the bill online".
- **Dixi as an MCP server.** Claude, ChatGPT apps and Muse-style agents could call Dixi's checked, scam-proof executor. The same goes for OpenAI's device once it ships.
- **Offline brain.** Small on-device models (transformers.js) for commands when there's no internet or no credit left.
- **Caregiver co-pilot.** Approve risky actions from a phone (ntfy.sh, free), plus a private live view (WebRTC).
- **One-time virtual cards** (Privacy.com's free tier), like Muse's one-time card numbers.
- **Memory of what you saw.** "The recipe I looked at Tuesday", using on-device embeddings.
- **Big-screen TV mode** for low vision.

The four features already on the roadmap stay there: drawing on screen, camera pointing, bigger goals, learning your preferences.

---

## 6. Order of work

| Step | What | Why first |
|---|---|---|
| 0 | Unseen-site fixes | "It shouldn't fail when I test it" |
| 1 | Guardian | Best Congressional App Challenge demo, biggest impact, $0 to run |
| 2 | Skills | The 10x engine: faster and free with use |
| 3 | Simple View, in your language | Opens Dixi to people a busy page loses |

Each step lands as one commit on `feat/where-dixi-is-going`, with unit tests, a live check on sites Dixi wasn't tuned on, and updates to ABOUT.md and the Challenge site.

---

## Sources

- ChatGPT Atlas: [MIT AI Agent Index](https://aiagentindex.mit.edu/2025/chatgpt-atlas), [PureAI](https://pureai.com/Articles/2025/10/21/OpenAI-Launches-ChatGPT-Atlas.aspx), [Omnius](https://www.omnius.so/blog/what-is-chatgpt-atlas)
- Perplexity Comet: [TechCrunch](https://techcrunch.com/2025/10/02/perplexitys-comet-ai-browser-now-free-max-users-get-new-background-assistant/), [Business Today](https://www.businesstoday.in/amp/technology/news/story/perplexity-opens-comet-browser-to-all-users-adds-background-assistant-for-max-subscribers-496681-2025-10-03)
- Gemini in Chrome Skills and Auto Browse: [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/3256/gemini-in-chrome-skills-how-they-work-countries-availability), [AlternativeTo](https://alternativeto.net/news/2026/1/google-launches-a-new-ai-agent-style-auto-browse-tool-for-task-automation-in-chrome)
- Meta Muse: [The National](https://www.thenationalnews.com/future/technology/2026/09/08/meta-muse-ai-agent/), [TechRepublic](https://www.techrepublic.com/article/news-meta-muse-ai-agent-us-launch/), [KDnuggets](https://kdnuggets.com/meta-muse-explained-what-it-is-how-it-works-and-what-it-can-do)
- OpenAI device: [Axios](https://axios.com/2026/01/19/openai-device-2026-lehane-jony-ive)
- workflow-use: [README](https://cdn.jsdelivr.net/gh/browser-use/workflow-use@main/README.md), [AlphaSignal](https://alphasignal.ai/news/browser-use-ships-workflow-use-to-run-automations-a-million-times-without-ai)
- Rabbit teach mode: [SiliconANGLE](https://siliconangle.com/2024/11/21/rabbit-launches-teach-mode-allowing-people-create-custom-ai-agents-mobile-device/)
- Agents and dark patterns: [DECEPTICON](https://arxiv.org/abs/2512.22894v1), [Dark Patterns Meet GUI Agents](https://www.arxiv.org/abs/2509.10723), [SusBench](https://deceptive.design/articles/susbench-an-online-benchmark-for-evaluating-dark-pattern-susceptibility-of-computer-use-agents), [Dark Patterns at Scale](https://arxiv.org/pdf/1907.07032)
- Elder fraud: [AARP on the FBI 2025 report](https://www.aarp.org/money/scams-fraud/fbi-ftc-report-2025-losses.html), [Techlicious on FTC data](https://www.techlicious.com/blog/ftc-older-americans-lost-up-to-119-billion-scams/)
- Senior devices: [ElliQ review](https://www.theseniorlist.com/aging-in-place/elliq/), [GrandPad review](https://www.techradar.com/reviews/grandpad)
- Meta glasses toolkit: [Meta for Developers](https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/), [Be My Eyes on Ray-Ban Meta](https://bemyeyes.com/blog/be-my-eyes-on-ray-ban-meta)
- Free building blocks: [Safe Browsing usage limits](https://developers.google.com/safe-browsing/v4/usage-limits), [Web Serial](https://developer.chrome.com/docs/capabilities/serial), [transformers.js on WebGPU](https://www.sitepoint.com/webgpu-browser-based-ai-future/)
