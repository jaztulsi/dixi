# Booking + transactions repos

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.

---

I found six of the seven repos; `GiX007/restaurant-reservation-agent` returns 404. The safest pattern is clear: the code itself refuses to book without confirmation, the read-back comes from the page rather than the model's memory, money and sign-in go to the user, and nothing counts as booked until a confirmation page proves it. No repo checks the user's calendar for clashes, so Dixi has to build that itself.

## (1) SUMMARY: recommended Dixi booking flow

1. **Pick the route and fail closed.** Use an approved channel where one exists: Resy's own ChatGPT and Claude integrations, or Google and Yelp partner link-outs. Otherwise drive the real site in the visible browser at human pace. No polling, sniping, stealth browsers or private APIs. [restaurant-cli `gates.ts`; travel-agent `SPEC.md:79`]
2. **Confirm the venue aloud** (name, street, site domain) before checking times. [restaurant-cli `SKILL.md:160`; travel-agent `model.ts:152`]
3. **Take availability from the page only.** Offer alternatives as one spoken sentence. [dinner-reservagent `prompts.py:70,74`]
4. **Check the user's calendar for a clash** before offering times. No repo does this.
5. **Read back from the review page itself:** venue, weekday and date, time, party size, name, card hold or deposit, cancellation fee and deadline. If any field is missing, don't ask for the yes. [travel-agent `model.ts:149-172`]
6. **Turn the spoken yes into a code gate.** Only the voice-confirmation handler can set `confirmed`. Tie it to a hash of the read-back with a 10-minute expiry, and read back again if the page changes. [restaurant-cli `resy/book.ts:57`; travel-agent `model.ts:15`]
7. **Hand card, CVC, 3-D Secure and sign-in to the user.** Never press a "pay" control. [travel-agent `payment-gate.ts`, `handover-state.ts`]
8. **Prevent double booking on retry.** Keep one attempt key per booking. After a timeout, check "My reservations" for a live match before clicking again. [restaurant-cli `book.ts:85-111`; dinner-reservagent `service.py:334-379`]
9. **Verify before saying "booked."** The confirmation page must show a confirmation number with matching details; the email is a second check. Otherwise say "I couldn't confirm it." [travel-agent `SPEC.md:80`; ai-browser-agent and booking-agent show what goes wrong]
10. **Log it, read the code back letter by letter, and add a calendar event in local time.** [dinner-reservagent `prompts.py:78`; vandanarohith `calendar.py`, with its timezone bug fixed]
11. **Treat cancel and rebook as separate irreversible flows,** each with its own read-back and yes. To rebook, book the new slot, verify it, then cancel the old one. [restaurant-cli `cancel.ts:44-57`]

## (2) APPENDIX

None of the repos is archived. The issue counts include PRs.

| Repo | License | Created / last commit | Stars | Issues | Status | Approach | Top 3 lessons |
|---|---|---|---|---|---|---|---|
| omarshahine/restaurant-cli | MIT | 2026-04-17 / 2026-10-25 | 11 | 2 | Active (CI, npm) | **Private API** (api.resy.com with the web-app key); OpenTable: reverse-engineered GraphQL plus stealth Playwright fork, opt-in; OpenTable booking is a deep-link hand-off; Tock booking not built | Good: the provider refuses to book unless `confirmed` is true; risky paths are off by default. Bad: the agent-tool path sets `confirmed` itself and silently attaches the default card |
| Prism-Shadow/travel-agent | Apache-2.0 | 2026-08-31 / 2026-09-08 | 51 | 2 | Young, quiet about 7 weeks | **Browser** automation, stops at payment | Payment gate wrapped around every click method; seven-field card that requires cancellation terms and shows only a card alias; no "booked" record it can't observe |
| vandanarohith501-cmd/AI-Restaurant-Reservation-Agent | NONE | 2026-07-25 / 2026-10-27 | 0 | 0 | Student demo | Mock catalog; AI phone call to the restaurant (Twilio + OpenAI Realtime) | README claims Google Places but the list is mocked; the model itself reports "confirmed"; calendar times written as UTC |
| tylav03/dinner-reservagent | GPL-3.0 (copy patterns, not code) | 2026-08-29 / 2026-10-08 | 1 | 2 | In development | Restaurant-side system with its own database (not a consumer agent) | Idempotency key + unique index + day lock + a real concurrency test; the harness supplies the key; read-back is only a prompt rule and cancel has no gate |
| GiX007/restaurant-reservation-agent | — | — | — | — | **Not found (404)** | — | User exists (32 public repos); none match, and `agent-labs` has no reservation code |
| satyadesai9900/booking-agent | NONE | 2026-10-17 / 2026-10-26 | 0 | 0 | New | No real booking: link-outs plus internal drafts | Emails only go to the signed-in user's own address; any typed booking reference becomes "CONFIRMED" after a format check only; invented "Total Cost" |
| AyushPoojariUCD/ai-browser-agent | MIT | 2025-06-09 / 2025-08-26 | 10 | 2 (both PRs) | Stale, over 14 months | **Browser** (`browser-use` on the user's live Chrome) | Always reports "Task completed"; no confirmation gate; browser profile committed to git |

**Evidence (repo paths, read via `gh api`, 2026-10-29)**
- restaurant-cli:
  - Opt-in gates: `src/core/gates.ts:17-52`.
  - Refuses to book unless confirmed: `src/providers/resy/book.ts:57-63`.
  - Silently picks the default card: `resy/book.ts:32-43,98`. The y/N prompt (`cli/commands/book.ts:130`) doesn't mention the card or any fee.
  - Duplicate check (`book.ts:85-111`) is switched off on a list error (`:108-110`).
  - The tool path sets `confirmed: true` itself and skips the duplicate check: `src/integrations/openclaw/index.ts:230-232,270-273`.
  - README `:209` says automated OpenTable confirmation has "accidentally completed real reservations". README `:165` calls the Resy route a "documented token", but it is the private `api.resy.com` (`client.ts:13,22`).
- travel-agent:
  - Payment control blocklist: `packages/browser-cli/src/executor/payment-gate.ts:21-34,72-75`.
  - Proxy around every write method: `write-gate.ts:50-74,192-201`.
  - Waits for in-flight clicks before handing over: `handover-state.ts:12-25`.
  - Confirmation card rules in `packages/server/src/interaction/model.ts`: 10-minute expiry (`:15`), payment password and passkey never filled (`:17-20`), a choice needs two or more options with reasons (`:65-79`), seven required fields (`:149-172`).
  - The yes must be an explicit `approved: true`: `packages/server/SPEC.md:85-90`.
  - Agent payment was removed on purpose: `docs/decisions/implemented/2026-08-20-retire-transaction-package.md:33-40`.
- vandanarohith:
  - Mock list: `backend/services/places.py:6`.
  - The model sets the status: `backend/api/voice.py:146-153`.
  - Times written as UTC with no clash check: `backend/services/calendar.py:15,24`.
  - The call step is not wired: `backend/agent/workflow.py:17-20`.
- dinner-reservagent:
  - Booking safeguards: `app/reservations/service.py:6-25,334-379` and `app/models.py:59-68`.
  - Harness sets the key: `scripts/text_agent.py:61-62,92`.
  - Large parties go to a manager callback: `app/voice/prompts.py:64-66`.
  - Cancel has no confirmation: `service.py:384-392`.
- booking-agent:
  - Email recipient lock: `agent/skills/gmail.py:24-39`.
  - Sample prices: `agent/skills/booking.py:422-431`; "CONFIRMED" status: `:446,472`.
- ai-browser-agent:
  - Always reports success: `backend-node/agentExecutor.js:17-19` and `python_agent/python_agent.py:357`.
  - CORS open to all origins with credentials: `python_agent.py:46-52`.
  - Raw page HTML pasted into the prompt: `llmActionPlanner.js:17-19`.
  - Committed browser files `Cookies`, `Login Data` and `Web Data`. I did not open them.

**Terms and API access, per platform (all accessed 2026-10-29)**
- **OpenTable** ([terms](https://www.opentable.com/legal/terms-and-conditions), revised July 22, 2026):
  - §13 bars "robot, spider, scraper, generative AI or other AI technology" and "automated assistants" unless OpenTable authorizes them.
  - §4 allows one reservation per meal period and bans resale.
  - §18.2 says "Actions of AI agents are acknowledged as actions of the User." This applies to Dixi.
  - Partner APIs are gated. The developer portal didn't render, so this comes from secondary sources ([hostie.ai](https://hostie.ai/resources/opentable-ai-virtual-host-booking-2025-integration-api-guide)).
- **Resy:** no public API. American Express said "Resy does not currently permit unapproved third-party bots or agents" and deactivated accounts of people using agents ([Restaurant Business](https://www.restaurantbusinessonline.com/technology/ai-agents-can-help-diners-book-table-it-can-also-get-them-banned), [KRDO/CNN](https://krdo.com/money/cnn-business-consumer/2026/09/23/now-ai-is-trying-to-gobble-up-dinner-reservations/)). Its approved routes are the ChatGPT and Claude integrations.
- **Yelp:** the [Reservations API](https://docs.developer.yelp.com/docs/reservation) is partner-only ("Access is disabled by default"). Its flow is Search, Openings, Hold, Book, with cancel supported and no edits. The [API terms](https://terms.yelp.com/developers/api_terms/) (Sept 22, 2026) ban scraping, caching, and feeding Yelp content into AI models (§9.4).
- **Google** [Reservations End-to-End](https://developers.google.com/actions-center/verticals/reservations/e2e/overview): partners need a "direct contractual relationship with all the merchants". It is not usable by a consumer agent.
- **SevenRooms:** API access goes through partners or the venue's account manager ([Zendesk listing](https://www.zendesk.com/apps/support/1273288/sevenrooms-reservations/)).
- **Tock:** the terms page wouldn't load (403 or empty), so its rules are unverified.

**Text aimed at AI agents.** All of it is the repos' instructions to their own agents; none tried to redirect this research:
- restaurant-cli `SKILL.md:55`, `agents/opentable-agent.md:14`
- travel-agent `payment-gate.ts:55-59`
- dinner-reservagent `prompts.py:76` (an anti-injection rule)
- booking-agent `graph.py:19-26`
- vandanarohith `voice.py:75` tells the phone AI to act as "a casual male assistant", with no AI disclosure to the restaurant.

## (3) Confidence and gaps

High confidence on the code findings and repo metadata. Medium on platform terms: I quoted OpenTable, Yelp and Google directly, but the Resy and Tock terms pages wouldn't load, and the Resy position comes from press statements.

I could not verify:
- the GiX007 repo (404);
- whether Resy's ChatGPT and Claude integrations accept third-party agents;
- OpenTable's developer portal details;
- Yelp hold expiry times;
- whether New York's Restaurant Reservation Anti-Piracy Act could apply to Dixi;
- what is inside ai-browser-agent's committed browser files.

I also didn't fully read travel-agent's `AGENTS.md` and `.pi/agents` files or ai-browser-agent's `.cursor` rules.
