# Dixi demo: phrases that were tested and passed

Every phrase below was spoken through the real Dixi app on the real Apple Store and Amazon, on fresh profiles. Each result was checked against the store's own page: the bag's lines and quantities, the header count, the numbers in answers, and that nothing was typed or ordered. The tally next to each line is passes / runs. A phrase is listed as **safe** only if it passed every run since its last fix.

## Before you start

1. `cd electron && npm start` with `CEREBRAS_API_KEY` and `ANTHROPIC_API_KEY` in `.env` (hybrid mode, the default).
2. Start each command with "Dixi, …" (or turn off the wake word in Settings). Say each line, then wait for the step to show ✓ before the next one.
3. Start from an empty Apple bag. Dixi never signs in or pays: checkout always stops at Apple's sign-in page.
4. Say the lines in the order given. Later lines depend on earlier ones: "go to my bag" needs items in it.

## Script 1: shopping on the Apple Store (safe)

| # | Say | What Dixi does | Tally |
|---|---|---|---|
| 1 | "show me AirPods on the Apple Store" | Opens Apple's store and searches AirPods | 4/5 (the one miss went to a wrong site; fixed, then passed) |
| 2 | "which AirPods are the best right now" | Answers from the page: "AirPods Pro 3 … $249" | 3/4 (fixed after run 1, then 3/3) |
| 3 | "buy me AirPods Pro" | Opens the AirPods Pro 3 page, picks no engraving, adds to bag | 5/5 |
| 4 | "add an AirTag" | 1 pack, skip engraving, added | 4/4 |
| 5 | "go to my bag" | Opens the bag | 4/4 |
| 6 | "make the AirTag two" | AirTag quantity becomes 2 | 4/4 |
| 7 | "what's the total in my bag" | Reads the bag total, e.g. "$342.21" | 4/4 |
| 8 | "remove the AirTag" | Removes the AirTag line; the AirPods stay | 4/4 |
| 9 | "check out" | Goes to checkout and stops at Apple's sign-in: "Sign in yourself; I never type passwords, addresses or card details" | 4/4 |
| 10 | "sign in on this page" | "This is Apple's sign-in page. Sign in yourself; I never type passwords or codes" | 4/4 |

## Script 2: colors, sizes and "which one?" on the Apple Store (safe)

| # | Say | What Dixi does | Tally |
|---|---|---|---|
| 1 | "buy an iPhone 17 in black" | Picks Black, 256GB, no trade-in, no AppleCare, adds: "Added iPhone 17 (Black, 256GB)" | after the fix: 1/1 by voice, plus 4/4 iPhones added one at a time and proven from the bag |
| 2 | "add a MacBook Air in midnight" | "Added MacBook Air (13-inch, Midnight)" | 4/4 |
| 3 | "get me AirPods with 200 GB" | Adds AirPods and says: "It has no “200 GB” option" | 4/4 |
| 4 | "I want an iPad" | Asks: "Which iPad: iPad 11, iPad Air, iPad Mini or iPad Pro?" | 4/4 |
| 5 | "the iPad Air" | Answers the question; the iPad Air goes in the bag | 4/4 |
| 6 | "go to my bag" | Opens the bag with all of the above | 4/4 |

Other variants that worked when run one command at a time (no voice): "iPhone 18 Pro Max in black", "iPhone 18 Pro with 512GB in silver", "iPhone 17 in white", "iPhone Air", "iPad Air", "Apple Watch Series 12", "iMac", "AirTag".

## Script 3: Amazon (only these lines are safe)

| # | Say | What Dixi does | Tally |
|---|---|---|---|
| 1 | "search for wireless earbuds on Amazon" | Amazon results for "wireless earbuds" | 3/3 |
| 2 | "open the first result" | Opens the first product | 3/3 |
| 3 | "what is the rating of this product" | "4.8 out of 5 stars" (read from the page) | 3/3 |
| 4 | "add it to my cart" | Added, confirmed by Amazon's cart count | 3/3 |
| 5 | "what is Amazon Prime" | General answer (membership, shipping, Prime Video) | 3/3 |
| 6 | "go to purchase" | Stops at Amazon's sign-in: "Sign in yourself…" | 2/2 |

**Not yet safe on Amazon:** "go to my cart", then quantity and remove there. Amazon's "Added to cart" page used to pass for the cart; that's fixed in code, but the rerun was blocked (see below). Use Apple for cart, quantity and remove in the demo.

## General questions that work anywhere

- "what is Amazon Prime" and "which AirPods are the best right now": answered in 1–3 spoken sentences.
- A question about the page ("how much is this", "what's the rating", "what's the total in my bag") is answered from the page and checked against the page's own words.
- When the model says the page doesn't have the answer, Claude answers with one web search instead of saying "the page doesn't show it". But if the fast model answers from memory instead, the answer can be wrong (see "Not safe yet").

## Not safe yet

- **Spec questions the page doesn't show, answered from memory** ("how long does the battery last on the AirPods Pro"). Two runs gave two different answers: "up to 8 hours" (right) and "about 4.5 hours" (wrong). Only questions whose answer is on the page, like price, total or rating, are in the safe lists.

## Don't do these in the demo

- **Talking over Dixi mid-step.** A new command while a step is still running cancels that step.
- **Many Amazon runs in a row.** After several automated runs from this Mac, Amazon showed its "continue shopping" human check (`/checkpoint`). Dixi stops there and hands it to you, as it should, but it breaks the flow. Your own browsing session normally doesn't trigger it.
- **"open the first result" on a page that has no results list.** It picks the first link it sees.

## Timing (from the last word to done)

- Apple adds: 4–8 s (iPhones 7–12 s, since Apple's page asks 5–6 questions)
- Bag actions: 0.5–2.5 s
- Answers: 0.5–1.5 s
- Amazon search: 2.5–3.5 s

A whole Apple script costs about $0.02–0.03 in AI calls.
