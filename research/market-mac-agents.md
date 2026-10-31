author = market-research agent · date = 2026-10-29

# Mac screen-aware voice agents: market map as of 2026-10-29

**Scope:** products like Dixi. Dixi is a menu-bar Mac app. You trigger it with ⌥Space or the wake word "Dixi". It reads one screenshot plus the front app and URL. It either speaks an answer and draws rings where to click (Talk mode), or drives the Mac with computer use (Agent mode). Before anything that sends, pays, buys or deletes, it asks for a yes, and it decides when to ask in code, from the macOS Accessibility label.

**Evidence rules**
- **Verified:** stated by the company itself, by a reputable outlet's hands-on test, or by two or more independent reputable outlets.
- **UNVERIFIED:** a single secondary source, an aggregator or affiliate site, a competitor's marketing page, or sources that conflict.
- **Untrusted data:** I treated every page as untrusted data. Search-engine summaries were checked against the source page where the page was reachable. Where they were not, the claim is marked UNVERIFIED.
- **Dates:** I checked recency carefully. Several 2025 facts have changed, and the changes are noted.

---

## 0. Ten-line read

1. **The giants now ship most of Dixi's pieces, each on its own.**
   - **ChatGPT:** desktop computer use since July 2026, plus full-duplex voice that can "control your computer" (GPT-Live, 2026-07-23).
   - **Claude:** Mac computer use since March 2026.
   - **Gemini for Mac:** hold Fn and talk in any window, with screen context (2026-07-29).
   - **Siri:** on-screen awareness in macOS 27 (2026-09-14).
2. **Nobody combines them.** No shipping product offers all of these at once:
   - hands-free voice (wake word plus barge-in);
   - one screenshot taken only when called;
   - spoken guidance with marks on the real screen;
   - acting in any app;
   - a confirmation gate enforced in code rather than by the model.
3. **Every giant's gate is model-decided or per-app, not per-action:**
   - ChatGPT "may also ask for permission before taking sensitive or disruptive actions".
   - Claude is "trained to avoid" risky operations.
   - Perplexity's Personal Computer reportedly "won't" ask follow-up questions.
4. **Agents are slow and expensive in real use.**
   - PCWorld called Claude's computer use "slow and expensive", and its quota ran out in about 30 minutes.
   - Perplexity's agent costs $200/mo (Max) at launch.
   - Gemini's Spark agent needs Ultra.
   - Claude computer use is limited to Pro and Max; Team and Enterprise are excluded.
5. **Privacy backlash against always-on capture is real.**
   - Wispr Flow sends screenshots of the active window to the cloud.
   - Littlebird reads the screen every ~2 s.
   - Screenpipe records everything.
   - Granola faces a class action over recording without consent.
   - Rewind's capture was switched off after Meta bought it.
6. **The closest clones are tiny.**
   - **Holmes** (try-holmes.com): same ⌥Space, Talk/Agent modes and "never sends" rule; 2 GitHub stars.
   - **Clicky** (7.8k stars): talks and points, but does not act.
7. **Accessibility players describe but do not act.** Be My Eyes for Mac (July 2026) describes the screen and nothing more. Voice Control does no planning.
8. **Hotkey collision:** Gemini for Mac uses Option+Space, and so do Holmes and Dixi.

---

## 1. Platform giants

### 1.1 Apple: Siri AI / Apple Intelligence on macOS 27 "Golden Gate"

**Verified**
- **Release:** macOS 27 shipped 2026-09-14; 27.0.1 followed on 2026-09-28. [mac.install.guide](https://mac.install.guide/macos/macos27)
- **Status:** Siri AI ships labeled beta, in English only, with daily usage limits. It is partly powered by a Gemini model on Apple's Private Cloud Compute. [mac.install.guide](https://mac.install.guide/macos/macos27), [Tom's Guide](https://www.tomsguide.com/ai/apple-intelligence/siri-is-finally-getting-smarter-and-apple-is-set-to-lean-on-google-gemini-for-it)
- **Where it shows up:** merged with Spotlight, plus an "Ask Siri" item in context menus. [Six Colors review, Sep 2026](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/)
- **On-screen awareness:** in the beta it "works consistently enough", but it "won't suddenly take more complicated actions on your behalf". [Gizmodo, 2026-07-15](https://gizmodo.com/thank-god-macos-golden-gates-siri-is-a-terse-idiot-2000785982)
- **Acting in apps:** depends on developers adopting App Intents. [heise](https://heise.de/-10008604)
- **Natural-language Voice Control:** "tap the purple folder" was previewed for OS 27 in English. iPhone and iPad are confirmed; the Mac is not. [MacRumors, 2026-05-19](https://macrumors.com/2026/05/19/new-accessibility-features-with-apple-intelligence/), [heise](https://heise.de/-11303900)

**Price / platform / traction:** bundled free on Apple Silicon Macs, so the installed base is every recent Mac.

**Biggest weaknesses (from reviews)**
- **Cannot act across arbitrary apps or websites.** Six Colors: "Some third-party apps aren't tied into the Spotlight index", and Describe a Shortcut can't handle third-party app actions. [Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/)
- **Shallow, one-shot model.** "Built around a transactional model: you give a command, it executes a short task, and the loop closes". It also "quickly loses track of earlier nuances". [Christechno, 2026-09-22](https://christechno.com/2026/09/22/siri-macos-27-vs-gemini/)
- **Flaky voice and search.** Voice "failed to load the voice at all". Email search "would miss the specific messages". Shortcuts creation is "still buggy". [Gizmodo](https://gizmodo.com/thank-god-macos-golden-gates-siri-is-a-terse-idiot-2000785982)
- **Privacy routing is opaque.** "Apple will still process some data externally" [Gizmodo](https://gizmodo.com/thank-god-macos-golden-gates-siri-is-a-terse-idiot-2000785982). The system, not the user, picks cloud or on-device. [Voibe, a vendor](https://www.getvoibe.com/resources/siri-ai-dictation-wwdc-2026/)
- **Restricted:** beta, English only, with usage caps.

**UNVERIFIED:** whether natural-language Voice Control shipped on the Mac in 27.0 (only a secondary source says so). [lavx](https://news.lavx.hu/article/apple-s-ios-27-voice-control-upgrade-teases-agentic-siri-features)

**Distribution:** preinstalled in the OS, with surface area in Spotlight, the Services menu and context menus.

### 1.2 OpenAI: ChatGPT desktop "super app" (Chat + Work + Codex), computer use, GPT-Live voice, Atlas

**Verified**
- **Super app (2026-07-09):** the old desktop app became "ChatGPT Classic", joined by ChatGPT Work (an office agent) and Codex. Mac came first; Windows followed days later.
- **Plans:** Free and Go get only the Terra model for Work and Codex. Plus ($20) gets GPT-5.6 Sol; Pro gets Sol Pro. [PCWorld, 2026-07-09](https://pcworld.com/article/3188176/the-new-chatgpt-superapp-takes-aim-at-claude-desktop.html)
- **Computer use (official docs):** "available on macOS and Windows with ChatGPT Work and Codex" in supported regions. [OpenAI docs](https://learn.chatgpt.com/docs/computer-use)
  - It asks per-app permission ("Always allow" is an option).
  - It "may also ask for permission before taking sensitive or disruptive actions".
  - On Windows it runs in the foreground only; on macOS it can run in the background.
  - It "can't approve security or privacy prompts".
- **Codex computer use (2026-04-16):** reads the Accessibility tree and drives parallel background cursors, built from the Sky acquisition. It is "not as fast as a skilled human". EU and UK users were excluded at launch. [MacStories](https://macstories.net/notes/openais-new-codex-app-has-the-best-computer-use-feature-ive-ever-tested/), [Maginative on Sky](https://www.maginative.com/article/openai-acquires-sky-to-bring-a-mac-native-ai-interface-into-chatgpt/)
- **ChatGPT Voice on desktop (2026-07-23, v26.715):**
  - Platforms and plans: macOS and Windows; Plus, Pro, Business, Edu and Enterprise.
  - Model: GPT-Live "can speak, listen, and coordinate work in the app at the same time".
  - Scope: "Control your computer and direct multiple agents running in ChatGPT Work or Codex, using just your voice".
  - Screen: on macOS it sees the frontmost window via AppShot once Screen context is on.
  - Sources: [Android Authority, 2026-07-24](https://www.androidauthority.com/openai-chatgpt-voice-desktop-rollout-3691031/), [AlternativeTo](https://alternativeto.net/news/2026/7/chatgpt-voice-comes-to-desktop-app-for-voice-control-and-agent-management/)
- **Hands-on (PCWorld, 2026-07-14):** played chess in under 3 minutes with per-app approval. "I don't recommend letting it dive into your sensitive files and apps". [PCWorld](https://www.pcworld.com/article/3190769/chatgpt-can-now-control-your-whole-desktop-i-tested-it-with-chess.html)
- **Atlas browser (Mac first):** agent mode is a paid preview, can't download files, and asks permission on sensitive sites such as banks. Reviewers cite "slow carts and incomplete bookings". [eesel](https://eesel.ai/blog/chatgpt-atlas-reviews), [TechRadar](https://www.techradar.com/ai-platforms-assistants/chatgpt/i-tried-chatgpt-atlas-for-24-hours-and-if-youre-happy-to-give-sam-altman-unadulterated-control-over-your-life-youre-going-to-love-it)

**Biggest weaknesses**
- **Safety gate is model-discretionary.** It "may" ask (official wording); the docs name no code-level rule for send, pay or delete. [OpenAI docs](https://learn.chatgpt.com/docs/computer-use)
- **Complexity and quota.** "It's all pretty confusing"; "how quickly will all this new functionality burn through our ChatGPT usage windows?" [PCWorld](https://pcworld.com/article/3188176/the-new-chatgpt-superapp-takes-aim-at-claude-desktop.html)
- **Desktop app quality complaints:** "catastrophically poor" (a single user on the OpenAI forum). [OpenAI community](https://community.openai.com/t/desktop-browser-experience-critically-undermines-power-users/1264704)
- **Accessibility regressions:** a July 2026 AppleVis thread reports regressions with VoiceOver and NVDA (title only seen, so UNVERIFIED). [AppleVis listing](https://applevis.com/search?page=358)
- **No wake word reported.** Voice is gated to paid plans.

**UNVERIFIED:** the exact free-tier limits for computer use, and the user count of the desktop app.

**Distribution:** ChatGPT subscription tiers (Free, Go, Plus, Pro, Business, Edu, Enterprise); the desktop app download; enterprise sales.

### 1.3 Anthropic: Claude desktop (Cowork / Claude Code computer use)

**Verified**
- **Launch:** computer use on macOS shipped 2026-03-24 as a research preview, inside Cowork and Claude Code. Claude prefers connectors and controls the screen only as a fallback. Users can dispatch tasks from their phone. [Thurrott](https://thurrott.com/a-i/334111/anthropics-claude-can-now-control-and-complete-tasks-on-a-mac), [MacRumors](https://macrumors.com/2026/03/24/claude-use-mac-remotely-iphone)
- **Official help article:**
  - Beta for Pro and Max; "Team and Enterprise plans don't have access".
  - macOS and Windows.
  - Claude asks permission before each app.
  - Trading and crypto apps are blocked by default.
  - On macOS 15+ it works in background windows.
  - The desktop must be awake and the app open.
  - Claude is "trained to avoid" risky operations such as fund transfers and deletes; no separate per-action confirmation is documented.
  - Source: [Claude Help Center](https://support.claude.com/en/articles/14128542)
- **Acquisition:** Anthropic bought Vercept and shut its Vy agent on 2026-03-25. [Siècle Digital](https://siecledigital.fr/2026/02/26/anthropic-rachete-vercept-pour-muscler-les-capacites-de-claude/)
- **Voice on desktop:** Quick Entry dictation (Caps Lock, macOS 14+), which does not talk back. [Claude support](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac)

**Biggest weaknesses**
- **Slow and expensive.** "slow and expensive"; the 5-hour quota was gone in about 30 minutes; it "got hung up trying to move a single chess piece"; privacy is "fairly worrying"; prompts were typed. [PCWorld, 2026-03-24](https://www.pcworld.com/article/3097542/claude-controlled-my-mac-for-half-an-hour-it-was-a-wild-worrisome-ride.html)
- **Real-world speed:** an accountant on Reddit found Cowork "super slow" and that it "took almost as long" as doing the work by hand. [Reddit snapshot](https://reddit.sentinel-team.org/posts/1s2h1h6/snapshots/2026-03-28T02%3A57%3A41.238011Z)
- **Not voice-first on the Mac.** It needs typing or dictation, and gives no spoken answers on desktop (see UNVERIFIED below).
- **Plan restrictions:** consumer Pro and Max only.

**UNVERIFIED**
- Whether conversational Voice Mode works in the Mac desktop app. Sources conflict. [LumeVoice (competitor)](https://lumevoice.com/use-cases/claude/), [VoiceDash](https://voicedash.ai/?p=13702)
- A 10 GB Cowork VM that slows Macs (single report). [devbytes](https://devbytes.co.in/news/claude-feature-creates-10gb-vm-bundle-that-degrades-performance-on-mac)

**Distribution:** Pro and Max subscriptions; Claude Code's developer base. Dixi builds on Claude's computer-use tool, so Anthropic is both a supplier and a competitor.

### 1.4 Google: Gemini for Mac (voice + Spark), Gemini in Chrome auto browse; Project Mariner is gone

**Verified**
- **Gemini for Mac (2026-04-15):** free, macOS 15+.
  - Option+Space opens a mini overlay; Option+Shift+Space opens the full app.
  - It can share a window or a file.
  - At launch it had no computer use.
  - Sources: [MacDailyNews](https://macdailynews.com/2026/04/15/google-launches-native-gemini-app-for-mac/), [AlternativeTo](https://alternativeto.net/news/2026/4/google-launches-new-desktop-gemini-app-for-mac-with-screen-sharing-to-see-your-activity/)
- **Voice (2026-07-29, v1.88):**
  - Hold Fn to "speak naturally into any window"; cleaned-up text goes in at the cursor.
  - Opt-in screen reasoning: "can understand the context on your screen to help you execute complex tasks".
  - Available to all users, in English.
  - Neither source describes clicking in other apps or spoken replies.
  - Sources: [Google blog](https://blog.google/innovation-and-ai/products/gemini-app/speak-naturally-gemini-app-mac-os/), [MacRumors](https://www.macrumors.com/2026/07/29/gemini-for-mac-dictation/)
- **Gemini Spark for macOS (2026-06-30):**
  - Beta, Google AI Ultra, US, 18+.
  - Local file tasks, such as sorting Downloads or turning invoices into Sheets, on files you permit.
  - Phone-assigned tasks are "coming soon".
  - Sources: [Google blog](https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/), [Engadget](https://www.engadget.com/2205605/google-gemini-spark-macos-app/)
- **Chrome auto browse (2026-01-28):**
  - US only; AI Pro gets 20 tasks a day, Ultra 200.
  - "Before it buys anything or posts to social media, Auto Browse stops and asks you".
  - Sources: [9to5Google](https://9to5google.com/2026/01/28/chrome-gemini-auto-browse/), [TestingCatalog](https://www.testingcatalog.com/google-releases-chrome-auto-browse-for-ai-pro-and-ultra-users)
- **Project Mariner:** shut down 2026-05-04 and folded into Gemini Agent and AI Mode. [Gigazine](https://www.gigazine.net/gsc_news/en/20260507-google-shuts-down-project-mariner), [Android Headlines](https://www.androidheadlines.com/2026/05/google-shuts-down-project-mariner-ai-agent.html)

**Biggest weaknesses**
- **Can't click in Mac apps.** Voice writes text and Spark works on files. The real agent (Spark) is paywalled behind Ultra, US-only beta, and runs on Google Cloud VMs. [Engadget](https://www.engadget.com/2205605/google-gemini-spark-macos-app/), [iPhone in Canada](https://www.iphoneincanada.ca/2026/05/19/google-is-bringing-huge-gemini-spark-and-voice-upgrades-to-your-mac/)
- **Privacy:** Spark requires trusting Gemini with your files [Engadget](https://www.engadget.com/2205605/google-gemini-spark-macos-app/). The Mac app has drawn "privacy scrutiny since launch for installing background helpers" (UNVERIFIED). [ithinkdiff](https://www.ithinkdiff.com/gemini-spark-mac-voice-control-summer-2026/)
- **Auto browse is web-only and quota-capped.**

**UNVERIFIED:** Engadget prices Ultra at "$100 a month", which conflicts with the older $249.99. [Engadget](https://www.engadget.com/2205605/google-gemini-spark-macos-app/), [eesel](https://eesel.ai/blog/chrome-auto-browse-how-to-use-geminis-new-ai-agent-feature)

**Distribution:** free app download; AI Pro and Ultra subscriptions; Chrome's install base (the side panel is pushed to all users). [The Register](https://www.theregister.com/2026/01/29/chrome_gemini_pane/)

### 1.5 Microsoft: Copilot (Vision, Actions, "Hey Copilot"). Windows only for the agent features

**Verified**
- **Vision and wake word:** Copilot Vision is generally available on Windows 11, and "Hey Copilot" is a wake word. [Windows Central](https://www.windowscentral.com/microsoft/windows-11/microsoft-dubs-windows-11-pcs-the-computer-you-can-talk-to-as-it-launches-new-agentic-ai-voice-input-mode-that-lets-your-pc-do-things-for-you)
- **Copilot Actions:**
  - Runs in a contained "Agent Workspace".
  - Off by default.
  - Windows Insiders only, and not in the EEA.
  - No general availability found as of Oct 2026.
  - Sources: [Windows Report](https://windowsreport.com/microsoft-previews-copilot-actions-for-local-files-in-windows-11/), [AlternativeTo](https://alternativeto.net/news/2025/10/microsoft-expands-copilot-on-windows-with-ai-agent-capabilities-vision-and-voice-wake-up), [Petri](https://petri.com/windows-11-new-copilot-agentic-ai-experiences/)
- **Mac:** a Copilot app for Mac has existed since Feb 2025 (chat and voice, Apple Silicon, macOS 14+). I found no evidence of Vision or Actions on the Mac. [MacRumors](https://www.macrumors.com/2025/02/27/microsoft-launches-copilot-app-for-mac/.)

**Biggest weaknesses**
- **No Mac agent.** Actions is still a preview, and launch coverage says Microsoft acknowledges agents "will make mistakes with complex apps" (exact article not confirmed, so UNVERIFIED; candidates: [Tom's Guide](https://www.tomsguide.com/ai/copilot/copilot-is-getting-a-big-upgrade-heres-the-biggest-new-features-coming-to-windows-11), [Petri](https://petri.com/windows-11-new-copilot-agentic-ai-experiences/))
- **Privacy pushback:** "letting the bots rummage through some of your files". [PC Gamer](https://www.pcgamer.com/software/windows/apparently-windows-11-becoming-agentic-ai-means-letting-the-bots-rummage-through-some-of-your-files)

**Distribution:** preinstalled in Windows 11; Microsoft 365 bundles; the Mac App Store app.

### 1.6 Perplexity: Personal Computer (Mac app) and Comet

**Verified**
- **Personal Computer:**
  - Launched 2026-04-16 for Max ($200/mo, 10,000 agent credits); later opened to Pro and Enterprise. "Access... still requires a paid subscription".
  - Press both Command keys; works by text or voice.
  - Works across native apps (iMessage, Mail, Calendar) and files; pairs with Comet for the web.
  - Files are made in a sandbox, and actions are "auditable and reversible".
  - macOS 14+.
  - Sources: [MacRumors, 2026-04-16](https://www.macrumors.com/2026/04/16/perplexity-personal-computer-for-mac/), [MacRumors, 2026-05-07](https://www.macrumors.com/2026/05/07/perplexity-mac-app-personal-computer/)
- **Comet:** free worldwide since Oct 2025. [Gigazine](https://www.gigazine.net/gsc_news/en/20251003-perplexity-comet-available-everyone)
- **Comet security:** prompt-injection research by Brave and LayerX ("CometJacking"). Perplexity said it was "unable to identify any security impact". [The Hacker News](https://thehackernews.com/2025/10/cometjacking-one-click-can-turn.html)

**Biggest weaknesses**
- **Price.** "Perplexity priced me out of its OpenClaw clone" [PCWorld](https://www.pcworld.com/article/3117459/perplexity-priced-me-out-of-its-openclaw-clone.html). "a v1.0 product at a v2.0 price", and credit burn is hard to predict. [Gadget Hacks](https://apple.gadgethacks.com/news/perplexity-personal-computer-for-mac-explained-features-cost-and-trust-questions/)
- **Acts without asking.** "Personal Computer won't" ask follow-up questions, unlike Claude or ChatGPT (secondary, so UNVERIFIED). [Gadget Hacks](https://apple.gadgethacks.com/news/perplexity-personal-computer-for-mac-explained-features-cost-and-trust-questions/)
- **Bugs (Reddit):**
  - "immediately tells me I don't have enough credits"; "slower, buggier than the App Store version". [snapshot](https://reddit.sentinel-team.org/posts/1u0ibyp/snapshots/2026-06-10T17%3A42%3A25.157691Z)
  - Requests that just say "'thinking' and never comes back". [snapshot](https://reddit.sentinel-team.org/posts/1t6nd35/snapshots/2026-05-15T21%3A30%3A10.456073Z)

**UNVERIFIED:** about 3M Comet MAU in Q1 2026 (Similarweb via a newsletter) [index.dev](https://index.dev/blog/perplexity-statistics); company valuation and revenue (see [market.md](market.md)).

**Distribution:** the most deal-driven player:
- Snap ($400M, Perplexity as Snapchat's default AI) [The Decoder](https://the-decoder.com/snap-partners-with-perplexity-ai-in-a-400-million-deal-to-bring-ai-search-to-snapchat-by-2026/)
- Airtel bundling in India [Inc42](https://inc42.com/features/airtel-rethinks-telecom-bundling-perplexity-deal-ott-streaming)
- SoftBank in Japan, and Firefox default search (both UNVERIFIED, from the search summary)
- Comet free

### 1.7 Amazon: Alexa+ on the web (Alexa.com)

**Verified**
- **Product:** Alexa.com is the browser version of Alexa+. It acts through Amazon integrations (lists, calendar, smart home, reservations). [Amazon](https://aboutamazon.com/news/devices/alexa-plus-web-ai-assistant/)
- **Price:** included with US Prime since 2026-02-04, with a free tier with quotas for non-Prime users. [WebProNews](https://www.webpronews.com/amazons-free-ai-alexa-upgrade-for-prime-enhancements-vs-glitches)

**Weaknesses**
- No screen awareness and no Mac app; it does not act on your computer.
- "far too slow" (Reddit), hallucinations, and a buggy app. [WebProNews](https://www.webpronews.com/amazons-free-ai-alexa-upgrade-for-prime-enhancements-vs-glitches), [TechRadar](https://www.techradar.com/ai-platforms-assistants/were-definitely-beta-testing-this-technology-is-alexa-really-bad-or-are-our-expectations-for-free-services-too-high)

**Distribution:** the Prime bundle and Echo devices.

---

## 2. Mac screen-aware overlays and assistants

### 2.1 Raycast AI
**Verified (official pricing page):**
- Free plan has no AI. Pro is $10/mo (500 AI credits, plus Dictation). Plus is $20 (3,000 credits). Max is $50 (7,500 credits). Teams start at $15 per user.
- The page lists "Screen Awareness", "Agents" and "AI Extensions". [raycast.com/pricing](https://www.raycast.com/pricing)
- Moved from rate limits to credits on 2026-09-10 and dropped the $8 Advanced AI add-on. [Raycast blog](https://www.raycast.com/blog/changing-how-raycast-ai-is-priced), [AlternativeTo](https://alternativeto.net/news/2026/9/raycast-shifts-ai-plans-to-credits-and-adds-max-for-heavy-use/)

**Weaknesses**
- Keyboard and launcher first, with no spoken answers.
- Acts through extensions, not by driving any app's UI.
- The credit change "annoyed users" (headline: "Raycast verärgert Nutzer mit neuem KI-Preismodell"). [ifun.de](https://www.ifun.de/raycast-veraergert-nutzer-mit-neuem-ki-preismodell-288857/)

**Distribution:** a free launcher used by developers, upsold to AI credits and Teams.

### 2.2 Highlight AI
**Verified**
- The official site says Beta, "The AI multitasker for work".
- It captures screen context, with exclusions for apps, sites and windows.
- It handles meetings, and drafts and stages work in Gmail, Slack, Linear and Claude Code.
- "Nothing happens without your approval". Apple Silicon download. [highlightai.com](https://highlightai.com)
- Spun out of Medal with $10M (Oct 2024). [TechCrunch](https://techcrunch.com/2024/10/22/desktop-ai-assistant-app-highlight-spins-out-of-medal-with-10m-in-funding)

**UNVERIFIED:** a $40M Series A led by Khosla (Mar 2026) and a claim of 500k+ users (aggregators only). [Simplify](https://simplify.jobs/c/Highlight-AI), [tooldirectory](https://tooldirectory.ai/tools/highlight-ai)

**Weaknesses**
- Continuous screen capture is a privacy cost, though it is "not permanently stored" (UNVERIFIED).
- No voice assistant and no spoken output.
- Acts only through integrations, not any app's UI.
- I found no real-user reviews, so its traction is unclear.

**Distribution:** work integrations, SOC 2 for business buyers, and an MCP footer link.

### 2.3 Cluely
**Verified**
- The official site pitches an AI meeting assistant: "completely undetectable", Cmd/Ctrl+Enter for help with what's on screen, desktop and iOS apps. [cluely.com](https://cluely.com)
- The CEO retracted the $7M ARR claim (Mar 2026). [TechCrunch](https://techcrunch.com/?p=3024917), [Villpress](https://villpress.com/?p=9200)
- Funding was a $15M a16z Series A.

**UNVERIFIED:** about $5.2M revenue (Stripe screenshot, reported second-hand); a $149.99/mo undetectable tier; a 2025 breach of 83k users' data (competitor page). [aceround](https://www.aceround.app/blog/cluely-alternative/)

**Weaknesses**
- Trust: the founder lied about revenue, and its brand is built on "cheating".
- No actions and no voice output.
- Detection claims are contested.

**Distribution:** founder-led rage-bait content and UGC creators on TikTok and Instagram (roughly 50–60 "growth interns" or creators; UNVERIFIED). [AI Native GTM](https://ainativegtm.substack.com/p/cluely-can-you-cheat-your-way-to), [Benzinga](https://benzinga.com/z/46133986)

### 2.4 Clicky / HeyClicky (Farza). "OpenClicky" not found under that name
**Verified**
- The open-source repo is MIT-licensed with 7.8k stars and 1.6k forks.
- A menu-bar "buddy next to your cursor" that sees the screen, talks (AssemblyAI in, Claude for reasoning, ElevenLabs voice out) and points the cursor with `[POINT:x,y]` tags.
- New work since 2026-04-27 is private, in the official HeyClicky app (free download). [GitHub](https://github.com/farzaa/clicky)
- Forks include a Windows port [rickkdev](https://github.com/rickkdev/clicky) and a local "LocalClicky" [chatgate](https://chatgate.ai/post/localclicky).

**UNVERIFIED:** Clicky Pro at $20/mo with "150 agent messages" [EveryDev](https://www.everydev.ai/tools/hey-clicky); Windows on a waitlist [usecarly](https://www.usecarly.com/blog/cluely-vs-clicky/).

**Weaknesses**
- Points but does not act (in the open repo).
- Push-to-talk, no wake word.
- Uses three cloud vendors.
- No safety gate is needed, because it doesn't act.

**Distribution:** viral open source (Farza's audience), then the hosted app.

### 2.5 Holmes (try-holmes.com, by "Sentira"). The nearest clone
Name collision: tryholmes.com is a New York apartment-rental company, not this product. [tryholmes.com](https://tryholmes.com)

**Verified**
- **Product:** "your personal macos ai agent"; "you press ⌥ + Space"; "talk mode explains and guides, agent mode executes"; "reads your screen once, only when called"; free and open source; on-device inference. [try-holmes.com](https://www.try-holmes.com/)
- **Repo** ([GitHub](https://github.com/tryholmes/holmes-local)):
  - GPL-3.0, 2 stars, beta.
  - Ollama `qwen3-vl:4b`; push-to-talk on Fn.
  - Automations: meeting join, Gmail draft, Downloads sorter.
  - "This is enforced in code, not by prompting the model to behave": mutating tools are filtered out.
  - Requires Apple Silicon and 16 GB RAM recommended.

**Weaknesses**
- "Each action takes 3 to 15 seconds"; "First launch pays a 20 to 40 second model load"; "Local models misclick more than hosted ones on busy screens". [GitHub](https://github.com/tryholmes/holmes-local)
- Not notarized.
- Its "never sends" rule means it can't finish send or pay tasks at all.
- The site contradicts itself (single read vs "automously scans").
- No traction.

**Distribution:** GitHub plus a DMG download.

### 2.6 Littlebird
**Verified**
- **Product:** Mac, Windows, web, iOS and Android. It reads the active window via Accessibility, hover-to-ask, and runs scheduled routines.
- **Never sends:** "Littlebird never sends email on its own".
- **Price:** Basic free; Plus $17/mo billed annually. [littlebird.ai](https://littlebird.ai)
- **Funding:** $11M seed led by Lotus Studio (Mar 2026). [Built In](https://builtin.com/articles/littlebird-raises-11m-seed-20260325)
- **Capture method:** reads the active window via Accessibility, not screenshots. [Littlebird blog](https://littlebird.ai/blog/what-does-littlebird-actually-see)

**Weaknesses**
- Passive capture every ~2 s. Reviewers say "for others it is a step too far on privacy", and enterprises restrict its permissions. [review](https://justbeingresourceful.com/2026/09/21/littlebird-ai-review-the-assistant-that-already-knows-what-youre-working-on-2026/), [toolfinder](https://toolfinder.com/alternatives/littlebird)
- No voice.
- Drafts only.

**Distribution:** freemium plus team seats; texting through iMessage and WhatsApp; an MCP server for other AI apps.

### 2.7 Screenpipe
**Verified (vendor):**
- Free MIT CLI.
- Desktop app is a one-time ~$300–400; a $99/mo or $600/yr subscription adds cloud AI and sync. [screenpi.pe/about](https://screenpi.pe/about)

**UNVERIFIED:** YC S26 [hunted.space](https://www.hunted.space/product/screenpipe); retired inside 1Context as of 2026-04-24 [1context](https://1context-demo.pages.dev/screenpipe).

**Weaknesses**
- Records everything on screen and mic, aimed at users "who'll trade privacy for convenience". [aiindigo](https://aiindigo.com/blog/living-with-a-perfect-digital-memory-a-2026-review-of-screenpipe)
- A memory tool, not an assistant: no voice and no actions.
- Price.

**Distribution:** open source, then a paid app.

### 2.8 Rewind / Limitless (Meta): discontinued
**Verified**
- Meta acquired Limitless in Dec 2025.
- The Rewind Mac app's screen and audio capture was disabled from 2025-12-19.
- Pendant sales ended.
- Service ended in the EU, UK and other regions. [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)

**Lesson:** the always-recording memory category's flagship is gone.

### 2.9 Granola
**Verified**
- $125M Series C at $1.5B (Mar 2026), led by Index. Launched Spaces and an enterprise API; customers include Vanta, Gusto and Cursor. [The Next Web](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context), [Dealroom](https://dealroom.co/news/127031-granola-hits-1-5b-valuation-with-125m-raise-to-turn-meetings-into-compan/)
- A proposed class action, *Chamberlain v. Granola*, was filed 2026-07-30 (N.D. Cal.) over recording without all-party consent and training on meeting content. [Barnes & Thornburg](https://btlaw.com/en/insights/alerts/2026/what-the-granola-class-action-means-for-companies-building-and-deploying-conversation-capture-tools), [PPC Land](https://ppc.land/granola-sued-for-recording-meetings-without-consent-to-train-ai-models/)

**UNVERIFIED:** the motion to dismiss was granted in part on 2026-08-13 (single source). [tooldirectory](https://tooldirectory.ai/blog/ai-notetaker-lawsuits-2026)

**Weaknesses**
- Meetings only.
- The "no bot" design is now a legal liability: "invisibility also removes the most obvious signal that software is listening". [anarlog](https://anarlog.so/blog/is-granola-ai-safe/)
- No actions on screen.

**Distribution:** word of mouth among startups and VCs, then team and enterprise.

---

## 3. Desktop computer-use agents

### 3.1 Simular (Sai, Agent S)
**Verified**
- $21.5M Series A (Felicis), Mac first, with Windows to follow. [TechCrunch, 2025-12-02](https://techcrunch.com/2025/12/02/simular-releases-mac-os-ai-agent-raises-21-5m-from-felicis-with-windows-coming-soon)
- The official site lists Sai (on your device plus cloud computers), the Simular API "for AI agents", and open-source Agent S. It claims #1 on OSWorld (self-reported).
- The site shows no prices and no safety or approval language. [simular.ai](https://www.simular.ai)

**UNVERIFIED:** pricing of $20–$500/mo (sources conflict); invite-only access. [Saner](https://blog.saner.ai/simular-reviews/), [toolbrain](https://toolbrain-astro.pages.dev/blog/sai-simular-review/)

**Weaknesses**
- "desktop GUI control slow", "early-stage bugs", and BYOD mode "less reliable than cloud" (secondary). [toolbrain](https://toolbrain-astro.pages.dev/blog/sai-simular-review/)
- No voice; price.

**Distribution:** invite list, a developer API and business sales.

### 3.2 Manus "My Computer" (Meta)
**Verified**
- Launched 2026-03-16. The desktop app "executes command line instructions (CLI) in your computer's terminal" to edit files and launch apps.
- Apple Silicon Mac first. Paid. Meta-owned. [9to5Mac](https://9to5mac.com/2026/03/17/metas-manus-launches-my-computer-to-turn-your-mac-into-an-ai-agent/), [Manus blog](https://manus.im/blog/manus-my-computer-desktop)

**Weaknesses**
- Terminal-driven, with no on-screen GUI control or voice described.
- Works only while the computer is on and the app is running. [The Next Web](https://thenextweb.com/news/meta-manus-my-computer-desktop-ai-agent)

**Distribution:** existing Manus subscribers and Meta.

### 3.3 Genspark
**Verified (prior council report):** a $485M Series B total and $2.6B post-money (company claims). [Business Wire](https://www.businesswire.com/news/home/20260617758937/en/)

**UNVERIFIED:**
- An AI browser on macOS 15+; a credit-pooled "Super Agent"; Plus at $24.99/mo. [eesel](https://www.eesel.ai/blog/genspark-ai-pricing)
- Agent features work only inside its own browser.

**Weaknesses:** a cloud and browser agent, not a Mac app agent; credit-based pricing.

### 3.4 Open Interpreter: pivoted
**Verified:** the repo now reads "A coding agent for open models like Kimi K3 and GLM 5.3". It is a Rust fork of Codex with 68.7k stars, and the desktop client moved to a separate "Interpreter Workstation". [GitHub](https://github.com/openinterpreter/open-interpreter)

**Status:** no longer a consumer computer-control product.

### 3.5 OpenClaw (open-source local agent; found during the search)
**UNVERIFIED** (secondary security press):
- 42,665 instances exposed online.
- CVE-2026-25253 (CVSS 8.8).
- 341 malicious "skills" on ClawHub.
- Source: [letsdatascience](https://letsdatascience.com/news/openclaw-faces-security-risks-despite-ecosystem-growth-e0b69cf2)

**Relevance:** it set off a Mac mini craze. Perplexity's agent was framed as an "OpenClaw clone". [PCWorld](https://www.pcworld.com/article/3117459/perplexity-priced-me-out-of-its-openclaw-clone.html)

**Weakness:** a security mess, built for tinkerers.

### 3.6 Vercept Vy: discontinued
Acquired by Anthropic; shut down 2026-03-25. [Siècle Digital](https://siecledigital.fr/2026/02/26/anthropic-rachete-vercept-pour-muscler-les-capacites-de-claude/)

### 3.7 Small Mac voice-agent startups (all self-reported, UNVERIFIED, no traction data)
- Phantom: a voice agent in the notch.
- TaskGPT: Product Hunt launch 2026-06-03. [hunted.space](https://hunted.space/product/taskgpt-2)
- Friday: push-to-talk, bring-your-own keys, "2 second round-trip" claimed. [friday](https://friday-waitlist.pages.dev/)
- Sunnyy: waitlist.
- Vox.
- Spokenly "Agent Mode". [Spokenly](https://spokenly.app/help/agent_mode)
- None shows a code-level confirmation gate or rings on screen.

---

## 4. Agentic browsers

| Browser | Verified facts | Biggest weakness | Source |
|---|---|---|---|
| Perplexity Comet | Free since Oct 2025; voice mode reported | Prompt-injection research (Brave, LayerX) | [Gigazine](https://www.gigazine.net/gsc_news/en/20251003-perplexity-comet-available-everyone), [THN](https://thehackernews.com/2025/10/cometjacking-one-click-can-turn.html) |
| ChatGPT Atlas | Mac first; agent mode is a paid preview | "slow carts and incomplete bookings" | [eesel](https://eesel.ai/blog/chatgpt-atlas-reviews) |
| Dia (Atlassian, ~$610M) | Free, or Pro $20/mo; macOS 14+ on Apple Silicon only; Arc shuts 2026-12-22 | No autonomous agent | [MakerStack](https://makerstack.co/reviews/dia-review/), [The Register](https://www.theregister.com/a/5305114) |
| Opera Neon | $19.90/mo; public since Dec 2025; "Neon Do" | Price vs free rivals; CAPTCHAs and dynamic UIs interrupt it | [Techzine](https://www.techzine.eu/news/applications/137236/agentic-ai-browser-opera-neon-now-generally-available), [Tom's Guide](https://www.tomsguide.com/computing/browsers/opera-neon-wants-usd20-a-month-to-replace-google-chrome-is-it-worth-it) |
| Fellou | Free, then $19 and up (UNVERIFIED) | "gets stuck on complex layouts", loops; prompt-injection disclosure | [thetoolnerd](https://www.thetoolnerd.com/p/fellou-review-agentic-browser-thetoolnerd), [Seraphic](https://seraphicsecurity.com/?p=3628) |
| Chrome auto browse | See 1.4 | Web only; quotas | see 1.4 |

**Shared weakness:** none of them can touch Mail, Finder, Docs desktop or any other native app. Dixi's own built-in browser competes here directly, against free products from Google, OpenAI and Perplexity. It is the weakest part of Dixi's position.

---

## 5. Voice input and voice control

### 5.1 Wispr Flow
**Verified**
- **Funding:** $280M Series B at $2B, led by Menlo, on 2026-08-17, for $361M raised in total. Previewed its own "Canto" speech model and says it is going "beyond dictation". [TechCrunch](https://techcrunch.com/2026/08/17/wispr-raises-280m-at-2b-valuation-as-it-looks-beyond-dictation/), [Dealroom](https://dealroom.co/news/145354-wispr-flow-raises-280m-at-2b-valuation-in-series-b/)
- **Price:** Free; Pro $15/user/mo, or $12 billed annually.
- **Products:** dictation on Mac, Windows, iOS and Android; a Notetaker. [wisprflow.ai/pricing](https://wisprflow.ai/pricing)
- **Sentiment:** 700+ critics answered its feedback call. [Digital Trends](https://www.digitaltrends.com/computing/wispr-flow-asked-its-haters-what-was-wrong-and-more-than-700-people-answered/)

**Weaknesses**
- **Privacy:** "context awareness" sends screenshots of the active window to the cloud. Users can turn it off, but lose context formatting. There is no offline mode. Source is a competitor's write-up of a Reddit PSA, so UNVERIFIED in detail. [DictaFlow](https://dictaflow.io/blog/wispr-flow-trust-gap-viral-reddit-psa-2026.html)
- It types; it doesn't act or speak.

**UNVERIFIED:** 125k+ business customers [Pulse 2.0](https://pulse2.com/wispr-raises-280-million-at-2-billion-valuation-as-revenue-grows-150-quarterly-and-voice-ai-push-accelerates).

**Distribution:**
- Free tier (2,000 words a week).
- Referral (3 months free per referral).
- Student offer (3 months free, then $6).
- Enterprise sales.
- Sources: [usagepricing](https://www.usagepricing.com/blueprint/activity/wisprflow-2026-08-11-deprecation), [ktwu01](https://ktwu01.github.io/posts/2026/01/wispr-flow-product-vs-monetization) (UNVERIFIED)

**Threat level:** high. It is well funded, already lives in every text field, and has stated it is moving beyond dictation.

### 5.2 Other dictation apps (dictation only; none act or speak)

| App | Price | Offline | Source |
|---|---|---|---|
| Superwhisper | Pro $8.49/mo, $84.99/yr, $249.99 lifetime (UNVERIFIED) | Yes (local models) | [Voibe](https://www.getvoibe.com/resources/superwhisper-pricing/) |
| Willow Voice | ~$15/mo (UNVERIFIED); $4.5M seed (YC, Box Group) | No | [toolquestor](https://toolquestor.com/vs/willow-voice-vs-superwhisper), [pulse.bot](https://www.pulse.bot/ai/deals/willow-raises-45m-seed-round-from-box-group-y-combinator-and-top-angels-d464a61e-e11c-4d08-8f3b-c6b6a105335d) |
| Aqua Voice | ~$8/mo; YC pre-seed (UNVERIFIED) | No | [vcbacked](https://www.vcbacked.co/company/aqua-voice) |
| MacWhisper | Pro €59 one-time on Gumroad; App Store tiers differ (UNVERIFIED) | Yes | [Voibe](https://www.getvoibe.com/resources/macwhisper-pricing/), [App Store](https://apps.apple.com/app/apple-store/id1668083311) |

### 5.3 Talon Voice
**Verified**
- Free download plus a Talon+ Patreon tier.
- macOS, Windows and Linux.
- "Mouse by just looking" (eye tracking); noises such as "Pop to click, hiss to scroll".
- No AI features listed. [talonvoice.com](https://talonvoice.com)

**Weaknesses**
- Command grammar you must learn, with no AI understanding of the screen.
- Built for programmers and RSI users.

**Distribution:** Patreon and a community Slack (UNVERIFIED).

### 5.4 Apple Voice Control
**Verified**
- Built in and free.
- Numbered overlays and label names; works offline.
- The OS 27 plain-language upgrade is confirmed for iPhone and iPad; the Mac is unconfirmed. [MacRumors](https://macrumors.com/2026/05/19/new-accessibility-features-with-apple-intelligence/)

**Weakness:** the user must drive every step. It does no planning, answering or multi-step tasks.

### 5.5 Dragon
**Verified:** the Mac version was discontinued in 2018. [Apple Discussions](https://discussions.apple.com/thread/8619979)

**UNVERIFIED:** Windows Professional costs about $699; Dragon Anywhere stopped on 2026-07-01. [Voibe](https://www.getvoibe.com/resources/dragon-review/)

**Status:** no Mac product.

---

## 6. Accessibility-first products

| Product | Verified facts | Acts? | Biggest weakness | Source |
|---|---|---|---|---|
| Be My Eyes / Be My AI | Mac app 2026-07-06 (NFB convention); free; describes screenshots, clipboard and camera; global hotkeys; works with VoiceOver; Windows app too; ~1M blind/low-vision users | No: "focuses on the AI Image Description feature" | Describes only; sign-in required; "a few seconds" wait | [Be My Eyes](https://www.bemyeyes.com/?p=21194297), [AFB AccessWorld](https://www.afb.org/aw/fall2026/be-my-eyes-mac-review), [Double Tap](https://doubletaponair.com/be-my-eyes-surpasses-1-million-users-and-launches-foundation-to-keep-ai-tools-free/) |
| Seeing AI (Microsoft) | Free phone camera app; no 2026 update found | No | Phone only; stagnant | [winfuture](https://winfuture.de/news,139950.html) |
| Envision Ally | Free, or Pro $10/mo; Solos glasses $399 at launch (2025) | No | Hardware-led; camera Q&A | [Envision](https://www.letsenvision.com/blog/ally-solos-glasses) |
| VoiceOver + Apple Intelligence | OS-wide image description (WWDC26) | No | Describes, doesn't complete tasks | [AppleVis podcast](https://podcastaddict.com/applevis-podcast/episode/225988846) |

**Distribution:**
- Be My Eyes: launch at blindness conventions; free consumer app; paid Be My Eyes Workplace for employers.
- Envision: hardware campaigns and distributors.
- Satisfaction with Apple's accessibility fell versus 2024 in an AppleVis survey. [AppleWorld Today](https://appleworld.today/?p=124883)

---

## 7. Comparison table

Key: **Y** = yes, **N** = no, **P** = partial or limited, **?** = not confirmed. "Safety gate" means a per-action confirmation before send, pay, buy or delete. "(model)" means the model decides; "(code)" means it is enforced in code.

| Product | Sees screen | Speaks answers | Acts in any app | Voice-first | Safety gate | Offline | Price (Oct 2026) | Mac |
|---|---|---|---|---|---|---|---|---|
| **Dixi** (reference) | Y (1 shot when called) | Y | Y (Agent mode) | Y (wake word, barge-in) | Y (code, AX label) | N | TBD | Y |
| Siri AI, macOS 27 | P (on-screen awareness) | Y | N (App Intents only) | Y | P (OS prompts; not verified) | P | Free | Y |
| ChatGPT desktop (Work, computer use, GPT-Live) | Y (AppShot, computer use) | Y | Y | P (voice mode, no wake word found) | P (model, "may ask") | N | Free (Terra), Plus $20, Pro | Y |
| Claude desktop (Cowork) | Y | N on desktop (?) | Y (Pro/Max beta) | N | P (per-app; model "trained to avoid") | N | Pro/Max | Y |
| Gemini for Mac (+ Spark) | Y (opt-in) | ? | N (text and files only; Spark on cloud VM) | P (hold Fn) | ? | N | Free; Spark needs Ultra | Y |
| Chrome auto browse | Web page only | N | Browser only | N | Y (stops before buy or post; product-level) | N | AI Pro / Ultra | Y |
| Microsoft Copilot | Y (Windows) | Y | P (Insider preview, Windows) | Y ("Hey Copilot") | P (contained workspace) | N | Free | P (chat only) |
| Perplexity Personal Computer | Y | ? | Y (native apps + Comet) | P (double-Cmd, voice input) | N (reportedly no follow-ups; sandbox) | N | Max $200; later Pro + credits | Y |
| Comet / Atlas / Dia / Neon / Fellou | Page only | P | Browser only | N | P (Atlas asks on banks) | N | Free to $20 | Y |
| Alexa+ web | N | Y (on Echo) | N (Amazon integrations) | Y on Echo, N on web | ? | N | Prime / free tier | Browser |
| Raycast AI | P ("Screen Awareness") | N | P (extensions) | N | N/A | N | $10 / $20 / $50 | Y |
| Highlight | Y (continuous) | N | P (drafts via integrations) | N | Y (stage, then approve) | N | Not listed | Y |
| Cluely | Y | N | N | N | N/A | N | $149.99 tier (UNVERIFIED) | Y |
| Clicky / HeyClicky | Y | Y | N (points cursor) | P (push-to-talk) | N/A | N | Free / $20 Pro (UNVERIFIED) | Y |
| Holmes | Y (1 read) | Y (with ElevenLabs key) | P (fixed automations) | P (push-to-talk) | Y (code; never sends) | Y | Free | Y |
| Littlebird | Y (AX, every ~2 s) | N | P (drafts; never sends) | N | Y (drafts only) | N | Free / $17 | Y |
| Screenpipe | Y (records all) | N | N | N | N/A | Y | ~$300–400 one-time | Y |
| Granola | N (audio) | N | N | N | N/A | N | Not re-checked | Y |
| Simular Sai | Y | N | Y | N | ? (none published) | N | $20–$500 (UNVERIFIED) | Y |
| Manus My Computer | N (CLI) | N | P (terminal) | N | ? | N | Paid | Y |
| Wispr Flow | P (context screenshots) | N | N (types) | Y (input) | N/A | N | Free / $15 | Y |
| Superwhisper / MacWhisper | N | N | N | Y (input) | N/A | Y | ~$8.49/mo; €59 one-time | Y |
| Talon | N | N | Y (user-scripted) | Y | N/A (user drives) | Y | Free / Patreon | Y |
| Apple Voice Control | Y (AX labels) | N | Y (user drives each step) | Y | N/A | Y | Free | Y |
| Be My Eyes (Mac) | Y (screenshot) | Y (via VoiceOver) | N | N (hotkeys) | N/A | N | Free | Y |
| Seeing AI / Envision Ally | Camera | Y | N | P | N/A | P | Free / $10 | N |

**Reading the table:** only Dixi and Holmes enforce a gate in code. Holmes does it by refusing to send at all. Among products that both speak and act in any Mac app, ChatGPT is the only funded one, and its gate is model-decided.

---

## 8. Whitespace: combinations nobody sells today

1. **Hands-free voice, acting in any Mac app, with a per-action yes enforced in code for send, pay, buy and delete.**
   - ChatGPT "may" ask [OpenAI docs](https://learn.chatgpt.com/docs/computer-use).
   - Claude is "trained to avoid" risky operations, with per-app permission only [Claude Help](https://support.claude.com/en/articles/14128542).
   - Perplexity reportedly "won't" ask [Gadget Hacks](https://apple.gadgethacks.com/news/perplexity-personal-computer-for-mac-explained-features-cost-and-trust-questions/).
   - Holmes enforces in code but can never send [GitHub](https://github.com/tryholmes/holmes-local).
   - Chrome stops before buying, but only on the web [9to5Google](https://9to5google.com/2026/01/28/chrome-gemini-auto-browse/).
   - No product publishes a deterministic rule tied to the button's Accessibility label.
   - Prompt injection is acknowledged as unsolved (Perplexity's own post, via [The Hacker News](https://thehackernews.com/2025/10/cometjacking-one-click-can-turn.html)), so a gate that doesn't rely on the model is a real difference.

2. **"Show me, don't do it": spoken guidance with marks on the real screen.**
   - The giants answer inside a chat or overlay window.
   - Only Clicky (points the cursor; free; 7.8k stars) and Holmes Talk mode (2 stars) do this.
   - Neither is funded at scale, and neither pairs it with an agent mode and a safety gate.
   - Demand signal: Clicky's star count [GitHub](https://github.com/farzaa/clicky). Older adults and new users want to learn, not hand over control.

3. **Accessibility-grade action on the Mac.**
   - Be My Eyes for Mac describes and does not act [AFB](https://www.afb.org/aw/fall2026/be-my-eyes-mac-review).
   - Voice Control and Talon need the user to drive every step [talonvoice.com](https://talonvoice.com).
   - ChatGPT reportedly regressed with VoiceOver [AppleVis listing](https://applevis.com/search?page=358).
   - Research shows general agents fall from 78% to 42% task success when keyboard-only [arXiv 2602.09310](https://arxiv.org/abs/2602.09310), cited in [market.md](market.md).
   - Nobody sells "speaks everything, acts on request, confirms by voice, works next to VoiceOver" on the Mac.

4. **Privacy by design: one screenshot, only when called.** The always-on category is in retreat:
   - Rewind's capture was disabled [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/).
   - Granola faces a class action [Barnes & Thornburg](https://btlaw.com/en/insights/alerts/2026/what-the-granola-class-action-means-for-companies-building-and-deploying-conversation-capture-tools).
   - Wispr Flow's screenshot PSA went viral [DictaFlow](https://dictaflow.io/blog/wispr-flow-trust-gap-viral-reddit-psa-2026.html).
   - Littlebird is "a step too far" for some [review](https://justbeingresourceful.com/2026/09/21/littlebird-ai-review-the-assistant-that-already-knows-what-youre-working-on-2026/).
   - Computer use itself is called "fairly worrying" [PCWorld](https://www.pcworld.com/article/3097542/claude-controlled-my-mac-for-half-an-hour-it-was-a-wild-worrisome-ride.html).
   - Only Holmes makes the same promise, and it runs a weaker local model.

5. **A predictable, consumer-priced agent that answers fast.**
   - Perplexity's agent cost $200/mo and "priced me out" [PCWorld](https://www.pcworld.com/article/3117459/perplexity-priced-me-out-of-its-openclaw-clone.html).
   - Spark needs Ultra [Engadget](https://www.engadget.com/2205605/google-gemini-spark-macos-app/).
   - Claude computer use is Pro/Max only, and its quota was burned in about 30 minutes [PCWorld](https://www.pcworld.com/article/3097542/claude-controlled-my-mac-for-half-an-hour-it-was-a-wild-worrisome-ride.html).
   - Raycast's move to credits angered users [ifun.de](https://www.ifun.de/raycast-veraergert-nutzer-mit-neuem-ki-preismodell-288857/).
   - Agents are "slow" [MacStories](https://macstories.net/notes/openais-new-codex-app-has-the-best-computer-use-feature-ive-ever-tested/).
   - An open gap: a talk mode that answers in about a second, escalating to the slow agent only when needed, at a flat price.

6. **Narrower than it looks: voice orchestration of parallel coding agents.**
   - ChatGPT Voice already directs multiple Codex and Work agents by voice (2026-07-23) [Android Authority](https://www.androidauthority.com/openai-chatgpt-voice-desktop-rollout-3691031/).
   - For Claude Code users the gap is still open: Claude Code's `/voice` is push-to-talk dictation [VoiceDash](https://voicedash.ai/?p=13702).
   - Dixi's "swarm" is a niche for developers, not a broad moat.

7. **Not whitespace: a voice browser.** Comet, Atlas, Chrome, Dia and Neon cover it, mostly for free. This supports dropping Dixi's built-in browser.

---

## 9. Sales and distribution channels

| Player | Channel | Source |
|---|---|---|
| Apple, Microsoft | Preinstalled OS (Siri in Spotlight and context menus; Copilot in Windows 11) | [Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/), [Windows Central](https://www.windowscentral.com/microsoft/windows-11/microsoft-dubs-windows-11-pcs-the-computer-you-can-talk-to-as-it-launches-new-agentic-ai-voice-input-mode-that-lets-your-pc-do-things-for-you) |
| OpenAI | Subscription ladder (Free/Go/Plus/Pro/Business/Edu/Enterprise) inside one desktop super app | [PCWorld](https://pcworld.com/article/3188176/the-new-chatgpt-superapp-takes-aim-at-claude-desktop.html) |
| Anthropic | Pro/Max subscriptions; Claude Code developer base; phone Dispatch | [Thurrott](https://thurrott.com/a-i/334111/anthropics-claude-can-now-control-and-complete-tasks-on-a-mac) |
| Google | Free Mac app as a funnel to AI Pro/Ultra; Chrome install base | [Google blog](https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-june-2026/), [The Register](https://www.theregister.com/2026/01/29/chrome_gemini_pane/) |
| Perplexity | Partnerships: Snap $400M, Airtel, carrier and device bundles; Comet free | [The Decoder](https://the-decoder.com/snap-partners-with-perplexity-ai-in-a-400-million-deal-to-bring-ai-search-to-snapchat-by-2026/), [Inc42](https://inc42.com/features/airtel-rethinks-telecom-bundling-perplexity-deal-ott-streaming) |
| Amazon | Prime bundle | [WebProNews](https://www.webpronews.com/amazons-free-ai-alexa-upgrade-for-prime-enhancements-vs-glitches) |
| Wispr Flow | Free tier, referrals, student discount, enterprise sales | [wisprflow.ai](https://wisprflow.ai/pricing), [usagepricing](https://www.usagepricing.com/blueprint/activity/wisprflow-2026-08-11-deprecation) |
| Cluely | Founder controversy plus a UGC creator army on TikTok and Instagram | [AI Native GTM](https://ainativegtm.substack.com/p/cluely-can-you-cheat-your-way-to) |
| Raycast | Free launcher used by developers, upsold to AI credits and Teams | [raycast.com/pricing](https://www.raycast.com/pricing) |
| Granola, Highlight, Littlebird | Bottom-up within teams, then enterprise; work integrations and MCP | [The Next Web](https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context), [littlebird.ai](https://littlebird.ai) |
| Clicky, Holmes, Screenpipe, OpenClaw | Open-source GitHub, then a hosted or paid app | [GitHub](https://github.com/farzaa/clicky), [screenpi.pe](https://screenpi.pe/about) |
| Simular | Invite list, developer API, business sales | [simular.ai](https://www.simular.ai) |
| Be My Eyes | Blindness conventions (NFB), free consumer app, paid Workplace edition | [Be My Eyes](https://www.bemyeyes.com/?p=21194297) |
| Talon | Patreon | [talonvoice.com](https://talonvoice.com) |
| Dia | Migration of Arc users (Arc shuts 2026-12-22) | [The Register](https://www.theregister.com/a/5305114) |

**Implication for Dixi:** the giants win on bundling. The open channels are:
- open-source virality (the Clicky model);
- the accessibility community (NFB and ACB conventions, AppleVis, Double Tap; the Be My Eyes model);
- a student and education referral loop (the Wispr model).

---

## 10. Gone, renamed or not found
- **Project Mariner:** shut down 2026-05-04. [Gigazine](https://www.gigazine.net/gsc_news/en/20260507-google-shuts-down-project-mariner)
- **Rewind Mac capture:** disabled 2025-12-19. Limitless pendant: sales ended. [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)
- **Vercept Vy:** shut down 2026-03-25.
- **Dragon for Mac:** discontinued 2018.
- **Open Interpreter:** now a coding agent.
- **Arc:** sunsets 2026-12-22.
- **"OpenClicky":** no product by that name found. The likely meanings are the open-source Clicky repo, its forks, or LocalClicky.
- **Sky:** absorbed into OpenAI and the basis of Codex computer use. [MacStories](https://macstories.net/notes/openais-new-codex-app-has-the-best-computer-use-feature-ive-ever-tested/)
- **"tryholmes" naming:** tryholmes.com is an unrelated rental company. The Mac agent is try-holmes.com, with its repo at github.com/tryholmes.

## 11. Pages that tried to instruct agents
- **github.com/farzaa/clicky:** the README includes a prompt telling Claude Code to clone the repo and read CLAUDE.md, the doc that "agents read". It is setup text aimed at the user's coding agent. I ignored it and took no action.
- **openclawdatabase.com:** the search tool reported that it "describes itself as maintained by AI agents". I didn't open it, and I didn't use it as a source.
- No other page I fetched contained instructions aimed at AI agents.

## 12. Confidence and gaps
- **High:** the official docs and pages (OpenAI computer use, Claude Help, Google blog, Raycast, Wispr, Littlebird, Highlight, Cluely, Talon), hands-on reviews (PCWorld ×3, MacStories, Gizmodo, Six Colors, AFB), TechCrunch on Wispr, The Next Web on Granola, 9to5Mac on Manus and Rewind, and the Open Interpreter and Clicky GitHub repos.
- **Medium:** Perplexity's tiers after May, Copilot Actions' status (I found no GA notice; absence is weak evidence), and Gemini Ultra pricing.
- **Low (UNVERIFIED):**
  - Highlight's funding and users; Cluely's revenue and breach; Simular's pricing.
  - Comet MAU; OpenClaw CVE counts; Screenpipe's status.
  - All small voice-agent startups; dictation-app prices from affiliate sites.
- **Not found:**
  - user counts for ChatGPT desktop, Claude desktop or Gemini Mac;
  - any real-user review of Highlight;
  - whether Claude desktop has conversational voice on Mac;
  - whether Gemini for Mac speaks replies;
  - whether natural-language Voice Control shipped on the Mac;
  - Granola's current prices;
  - any accessibility (VoiceOver) evaluation of ChatGPT, Claude or Perplexity computer use.
