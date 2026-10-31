# Market, demand + legal

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.

---

# Dixi competitive, demand and legal research (as of 2026-10-29)

## (1) Summary (about 300 words; every figure is cited in the Appendix)

**Where we win**
- **Incumbents describe; none of them act.** JAWS, NVDA, VoiceOver, TalkBack and Narrator have all added AI that describes images and pages. Be My Eyes, Envision and Aira start from the phone camera. None of them completes a multi-step task on a website.
- **General-purpose agents fail people using assistive tech.** One leading computer-use agent completed 78% of tasks normally. That fell to 42% when it had to work by keyboard only, and to 28% with a screen magnifier. GPT-5 completed 52.5% of real commands from blind users. Replaying a learned task the same way every time is a reliability argument, not only a cost one.
- **Safety is the moat.** OpenAI says prompt injection is unlikely ever to be fully solved. Scam blocking written in code, plus replay that uses no AI, is a claim no agentic browser can make.
- **The buyer exists.** There are 63M US family caregivers, and they spend about $7,200 a year out of pocket. 89% of adults 65+ are online, but only 23% use AI chatbots. The funded senior voice startups (Meela, Callie) make phone check-in calls; they don't do tasks on the web.
- **Libraries are an opening.** Under ADA Title II, public bodies must meet WCAG 2.1 AA by April 2027 or 2028, and that covers tools they contract for. We need to ship our own accessibility conformance report (VPAT).
- **Threats:** Apple's Voice Control in iOS 27 will let users name on-screen buttons in plain language. Comet and Gemini are free.

**Top 3 legal risks**
1. **Terms of service and site blocking, more than the anti-hacking law (CFAA).** The Ninth Circuit held that the *user*, not Perplexity, accesses Amazon (Aug 4, 2026; rehearing by the full court denied Sep 10). That holding covers only the current record, and the case goes on. Amazon blocked Meta's Muse under its Conditions of Use, and Resy bans unapproved agents. To reduce the risk:
   - Run locally in the user's own logged-in session.
   - Identify ourselves as an agent (Web Bot Auth).
   - Hold no credentials on our servers.
   - Honor blocks.
   - Use sanctioned payment rails (Agent Pay, AP2, ACP) where they exist.
2. **Liability for what the agent does:** wrong or unauthorized purchases, actions a caregiver starts, and instructions injected by web pages. Require confirmation before any irreversible step, and keep an auditable record of what the user authorized.
3. **Our own accessibility duties and marketing claims:** Title II through library contracts, the EU Accessibility Act once we're past microenterprise size, and ADA Title III suits (3,117 federal website suits in 2025). The FTC made accessiBe pay $1M for overclaiming. Never say Dixi "makes sites accessible."

## (2) Appendix

**A. Incumbent screen readers**

| Product | 2025-26 AI move | Price | Source |
|---|---|---|---|
| JAWS (Vispero) | Picture Smart AI (Mar 2024; uses ChatGPT/Claude). JAWS 2026 adds Page Explorer, AI page summaries inside FS Companion | Home Annual $104.50; Perpetual + maintenance (SMA) $1,572 | [FS review, Dec 2024](https://blog.freedomscientific.com/2024-year-end-review/); [FS JAWS 2026, Nov 2025](https://www.freedomscientific.com/?p=12679); [FS store, n.d.](https://store.freedomscientific.com/collections/jaws) |
| NVDA | Built-in on-device image description pulled from 2026.1; users rely on cloud add-ons (Vision Assistant Pro, Gemini, own API key) | Free | [nvda-users, May 2026](https://groups.google.com/a/nvaccess.org/g/nvda-users/c/JxrfMkAjzHU); [AppleVis, 2026](https://applevis.com/comment/210259) |
| VoiceOver | OS 27 preview: Image Explorer, Live Recognition Q&A; Voice Control accepts plain-language button names | Bundled | [AppleInsider, 2026-05-19](https://appleinsider.com/articles/26/05/19/apple-intelligence-powered-accessibility-features-in-os-27-detailed-ahead-of-wwdc) |
| TalkBack | Gemini answers questions about images and the whole screen | Bundled | [Android Central, May 2025](https://www.androidcentral.com/apps-software/ai/google-brings-gemini-and-other-accessibility-tools-across-android-devices) |
| Narrator | Copilot descriptions on all Windows 11 PCs (Insider builds; not in EEA); on-device on Copilot+ PCs | Bundled | [Windows Central, Jan 2026](https://www.windowscentral.com/microsoft/windows-11/microsofts-first-windows-11-preview-build-of-2026-brings-more-copilot-pc-features-to-everyone) |

**B. AI assistants and voice-first products**

| Product | Traction / funding | Price | Weakness | Source |
|---|---|---|---|---|
| Be My Eyes / Be My AI | 1M blind/low-vision users, 10M volunteers; nonprofit Foundation backed by Microsoft and OpenAI; $6.1M Series A+ (Jan 2025) | Free | Camera Q&A only, no web actions | [Double Tap, 2026-03-11](https://doubletaponair.com/be-my-eyes-surpasses-1-million-users-and-launches-foundation-to-keep-ai-tools-free/); [BME, Jan 2025](https://www.bemyeyes.com/?p=6453) |
| Aira | Human visual interpreters | 2026 prices not published; 2020: $20 for 30 min | Cost per minute | [Aira, n.d.](https://aira.io/exciting-pricing-news-for-aira-subscribers); [ACB, 2020](https://www.acb.org/node/3976) |
| Envision Ally | Ally app plus Solos glasses | Free; Pro $10/mo; glasses $399 pre-order, $699 retail | Hardware-led | [CO/AI, Aug 2025](https://getcoai.com/news/envision-and-solos-launch-399-ai-glasses-for-blind-users/) |
| Meela | $3.5M seed (Bain Capital Ventures) | Not disclosed | Phone companionship | [Business Wire, 2025-09-11](https://www.businesswire.com/news/home/20250911525548/en) |
| Callie Care | $0.5M pre-seed | Not disclosed | Check-in calls | [HIT Today, 2026-07-14](https://healthcareittoday.com/2026/07/14/callie-care-raises-500k-pre-seed-sage-crosses-100-million-in-2026-funding) |
| Web agents for blind users | Only prototypes and hackathon projects found; no funded startup | n/a | n/a | [CUNY, 2026-05-14](https://openlab.bmcc.cuny.edu/research-and-scholarship/2026/05/14/screen-agent-a-voice-first-browser-extension-for-accessible-web-navigation-using-local-ai/) |

**C. Agentic browser and computer-use startups**

| Company | Latest | Source |
|---|---|---|
| Browser Use | $17M seed (Felicis); no 2026 round confirmed | [AIN, 2025-03-25](https://en.ain.ua/2025/03/25/browser-use-raises-17m) |
| Browserbase | $40M Series B at $300M post-money | [SiliconAngle, 2025-06-17](https://siliconangle.com/2025/06/17/browserbase-reels-40m-browser-automation-tools/) |
| Skyvern | YC; $0.5–0.73M per funding trackers, UNVERIFIED | [VCBacked, n.d.](https://www.vcbacked.co/company/skyvern) |
| Simular | $21.5M Series A (Felicis); its Agent S scores 69.9% on the OSWorld benchmark | [TechCrunch, 2025-12-02](https://techcrunch.com/2025/12/02/simular-releases-mac-os-ai-agent-raises-21-5m-from-felicis-with-windows-coming-soon) |
| Perplexity / Comet | $200M at $20B (Sep 2025); Comet free since Oct 2, 2025. Reported $30B+ talks, $750M annualized revenue and ~18M Comet monthly users are all UNVERIFIED | [The Star, 2025-09-11](https://www.thestar.com.my/tech/tech-news/2025/09/11/perplexity-finalizes-20-billion-valuation-round-the-information-reports); [TechRepublic, Oct 2025](https://www.techrepublic.com/article/news-perplexity-comet-ai-browser-free/); [Presenc AI estimate, 2026](https://presenc.ai/research/comet-usage-statistics-2026) |
| The Browser Company (Dia) | Acquired by Atlassian for ~$610M cash | [BetaNews, 2025-09-05](https://betanews.com/2025/09/05/atlassian-moves-into-ai-browsers-with-610-million-purchase-of-the-browser-company/) |
| Opera Neon | $19.90/mo | [Engadget, 2025-09-30](https://www.engadget.com/ai/operas-ai-browser-will-cost-you-20-a-month-123022110.html) |
| Genspark | Series B totals $485M; $2.6B post-money; $250M ARR (company's own claims) | [Business Wire, 2026-06-17](https://www.businesswire.com/news/home/20260617758937/en/) |
| Fellou | "$40.4M total" from a single listing, UNVERIFIED | [EveryDev, n.d.](https://www.everydev.ai/developers/fellou) |

**D. Demand**

| Stat | Source |
|---|---|
| Adults 65+: 89% online, 71% have home broadband, 79% own a smartphone | [Pew, 2026-10-19](https://www.pewresearch.org/internet/fact-sheet/internet-broadband/); [Pew mobile, 2026-10-19](https://www.pewresearch.org/internet/fact-sheet/mobile/) |
| 23% of adults 65+ use AI chatbots (12% in 2024) | [Pew, 2026-06-17](https://www.pewresearch.org/internet/2026/06/17/how-opinions-and-use-of-ai-differ-by-age/) |
| More than 1 in 4 US adults have a disability; cognition 13.9%, mobility 12.2%, vision 5.5% | [CDC, updated 2026-05-05](https://www.cdc.gov/disability-and-health/articles-documents/disability-impacts-all-of-us-infographic.html) |
| 43.9% of adults 65+ have a disability; more than 70M adults (2022 data) | [Healio, 2024-07-18](https://cm.healio.com/news/primary-care/20240718/more-than-70-million-adults-reported-having-a-disability-in-2022) |
| 1.3B people (16%) worldwide have a significant disability; 2.2B have a vision impairment | [WHO, 2023-03-07](https://www.who.int/news-room/fact-sheets/detail/disability-and-health); [WHO, 2019-10-08](https://www.who.int/news/item/08-10-2019-who-launches-first-world-report-on-vision) |
| 63M US family caregivers (59M caring for adults); ~$7,200/yr out of pocket | [AARP, 2025-07-24](https://www.aarp.org/press/releases/2025-07-24-new-report-reveals-crisis-point-for-americas-63-million-family-caregivers.html) |
| Assistive-tech market 2025: $24–31B, 4–10% annual growth. UNVERIFIED paid reports | [GII/TBRC, n.d.](https://www.giiresearch.com/report/tbrc1830696-assistive-technology-global-market-report.html) |
| Digital-accessibility software 2025: $0.79–1.42B. UNVERIFIED paid reports | [Straits, n.d.](https://straitsresearch.com/report/digital-accessibility-market) |
| Gap: a leading agent's success fell from 78.3% to 41.7% (keyboard-only) and 28.3% (magnifier) | [arXiv 2602.09310, 2026-02-10](https://arxiv.org/abs/2602.09310) |
| Gap: GPT-5 completed 52.5% of 1,258 commands from blind users | [arXiv 2609.00524, Sep 2026](https://arxiv.org/pdf/2609.00524) |

**E. Regulation and what it means for us**

None of these rules govern what a user-side tool does. They govern our own website and app, and what public buyers are allowed to purchase.

| Rule | Status | For Dixi | Source |
|---|---|---|---|
| ADA Title II | Interim rule of 2026-04-20 moved deadlines to 2027-04-26 (population ≥50k) and 2028-04-26 (smaller); standard is WCAG 2.1 AA; covers contracted content | Libraries will need WCAG 2.1 AA and a VPAT from us | [Plante Moran, Apr 2026](https://plantemoran.com/explore-our-thinking/insight/2026/04/doj-extends-ada-title-ii-web-accessibility-compliance-deadlines); [RAILS, n.d.](https://railslibraries.org/system/files/inline-images/Title%20II%20Library%20Update.pdf) |
| ADA Title III | 8,667 federal suits in 2025, 3,117 of them about websites (+27%); UsableNet counts 5,114 including state courts | Our own site and app can be sued | [JD Supra, Feb 2026](https://www.jdsupra.com/legalnews/ada-title-iii-federal-lawsuit-filings-2632226/); [UsableNet, ~Jan 2026](https://info.usablenet.com/2025-year-end-report-on-web-accessibility-lawsuits) |
| WCAG | 2.2 is now ISO/IEC 40500:2025; 3.0 is still a Working Draft, final not before 2028 | Target WCAG 2.2 AA | [W3C, 2025-10-21](https://www.w3.org/WAI/news/2025-10-21/wcag22-iso); [AbilityNet, 2026](https://abilitynet.org.uk/resources/digital-accessibility/what-expect-wcag-30-web-content-accessibility-guidelines) |
| European Accessibility Act | In force since 2025-06-28; enforcement favors correction orders first; services exemption for under 10 staff and ≤€2M | EU sales are in scope once we outgrow microenterprise size | [Level Access, 2026](https://www.levelaccess.com/blog/eaa-compliance-in-2026-how-enforcement-has-evolved-and-what-to-expect-next/); [Xictron, 2026](https://www.xictron.com/en/blog/accessibility-act-exemptions-microenterprises-2026/) |
| Section 508 | Still the 2017 refresh (WCAG 2.0); a 2025 Access Board request for information (single source) | Applies only to federal sales | [DisabilityWorld, n.d.](https://www.disabilityworld.org/articles/section-508-refresh-status/) |
| FTC | accessiBe paid $1M over unsupported claims that its AI made sites WCAG-compliant | Don't market Dixi as fixing websites | [FTC, Apr 2025](https://ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million) |

**F. Legal risks of automating third-party sites**

| Issue | Status | Source |
|---|---|---|
| Amazon v. Perplexity | Injunction granted 2026-03-09. Ninth Circuit vacated it 2026-08-04: the user is the one accessing Amazon, limited to the current record. Rehearing by the full court denied 2026-09-10. Case continues in N.D. Cal. | [Bloomberg, 2026-03-10](https://www.bloomberg.com/news/articles/2026-03-10/amazon-wins-court-order-blocking-perplexity-s-ai-shopping-bots); [Engadget, 2026-08-04](https://engadget.com/2230471/perplexity-has-successfully-overturned-amazon-injunction-on-its-ai-shopping-bot); [9th Cir. order, 2026-09-10](https://www.courthousenews.com/wp-content/uploads/2026/09/amazon-perplexity-no-rehearing.pdf) |
| Amazon blocks Meta Muse (new) | Blocked 2026-09-20 under its Conditions of Use. Amazon's reasons: no notice, the agent doesn't identify itself, and it stores credentials | [SEJ, 2026-09-29](https://searchenginejournal.com/amazon-blocked-metas-muse-and-robots-txt-had-nothing-to-say/590494) |
| Amazon seller Agent Policy | From 2026-03-04, agents on the seller side must identify themselves and stop when asked | [EcommerceBytes, 2026](https://www.ecommercebytes.com/dz6g) |
| Resy | "does not currently permit unapproved third-party bots or agents" | [KEYT, 2026-09-23](https://keyt.com/?p=1478857) |
| OpenTable | July 2026 terms target "unauthorized third parties"; OpenAI is an authorized partner; consumer automation clause not verified | [Spectrum, 2026-07-14](https://spectrumlocalnews.com/ca/california/business/2026/07/14/opentable-new-terms) |
| CFAA after Van Buren | "Gates-up-or-down" test of authorization (opinion not fetched this session) | [SCOTUS, 2021-06-03](https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf) |
| hiQ v. LinkedIn | hiQ lost on breach of LinkedIn's user agreement; $500K consent judgment | [ZwillGen, Dec 2022](https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/) |
| Agent identification | Web Bot Auth adopted by Visa (Trusted Agent Protocol), Mastercard Agent Pay and Amex | [Business Wire, 2025-10-14](https://www.businesswire.com/news/home/20251014144421/en) |
| Google AP2 | Signed intent, cart and payment mandates; 60+ partners | [Techgoondu, 2025-09-18](https://www.techgoondu.com/2025/09/18/google-cloud-unveils-open-protocol-to-enable-secure-payments-by-ai-agents) |
| OpenAI/Stripe ACP | Launched 2025-09-29; Instant Checkout scaled back Mar 2026; ACP now runs inside merchants' ChatGPT apps | [Forkast, 2026](https://forkast.news/openai-built-in-chat-checkout-for-ai-commerce-five-months-later-it-walked-away/) |
| Prompt injection | OpenAI: unlikely ever fully solved. Brave: get user confirmation before autonomous actions | [Techloy, n.d.](https://www.techloy.com/openai-admits-prompt-injection-isnt-going-away-as-it-hardens-security-for-atlas/) |

## (3) Confidence and what I could not find

**High confidence:** the Pew, CDC, WHO and AARP figures; the Title II interim rule; Seyfarth's lawsuit counts; the court order denying rehearing (I read the PDF itself); the W3C/ISO status; the FTC order.

**Medium confidence:**
- The Ninth Circuit holding comes from press coverage; I did not read the opinion text.
- JAWS prices come from an undated store page.
- Envision prices are from launch coverage (Aug 2025).
- Genspark's figures are the company's own claims.

**Low confidence (marked UNVERIFIED in the tables):** the market sizes, Skyvern, Fellou, Perplexity's 2026 valuation and revenue, Comet's monthly users, and the Section 508 request for information.

**Not found:**
- Official 2026 US licensing for JAWS, and whether its AI features cost extra.
- Aira's 2026 prices.
- Any 2026 update to Seeing AI.
- Any funded startup building a web-acting agent for blind users or seniors.
- 2026 funding rounds for Browser Use or Skyvern.
- The current text of Amazon's consumer terms on agents.
- OpenTable's clause on automated access.
- Which of Amazon's claims remain in the district court.
- Any 2026 mid-year Title III lawsuit counts.
- Any DOJ action on Title II after comments closed (2026-06-22).
- Any specific EAA fines.
- Any law giving a disabled user the right to use an agent on a site that bans agents.
- Any evidence that payers reimburse this category.

I only re-checked the competitors you already knew about where new information turned up; the one new item is Amazon blocking Meta's Muse. I saw no prompt-injection attempts in the pages I read. I skipped low-quality spam pages and discounted claims from compliance vendors' blogs.
