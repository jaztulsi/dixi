# Dixi demo: 5 statements that passed every run

Each statement is said in one breath and holds several tasks. Dixi works through them in order, then you say the follow-ups.

Every line below was spoken through the real Dixi app, on the real site, on a fresh profile, and checked against the site's own page: bag lines and quantities, totals, numbers in answers, the video's real state, and that nothing was typed or ordered. Every statement and follow-up passed at least 2 of 2 runs after its last fix.

**Before you start**
- `cd electron && npm start`, with `CEREBRAS_API_KEY` and `ANTHROPIC_API_KEY` in `.env`.
- Start each line with "Dixi, …" and say it without long pauses (a long pause in the middle can start the first half on its own).
- Wait for the ✓ before the next line. Start with an empty Apple bag.
- Dixi never signs in or pays: every checkout stops at the store's sign-in page for you.

---

## 1. Apple: iPhone and AirPods

> **"Dixi, buy me an iPhone 17 in black with 256 gigabytes and AirPods Pro, then open my bag."**

Adds the iPhone 17 (Black, 256GB, no trade-in, no AppleCare) and AirPods Pro 3, then opens the bag. Takes about 12 s.

Follow-ups:
1. "What's the total in my bag?" → reads the real total, e.g. "$1,316.43".
2. "What's the difference between this iPhone 17 and the iPhone 16?" → a short spoken comparison (display, chip, camera, storage), checked with a web search.
3. "Remove the AirPods from my bag." → the AirPods line is gone; the iPhone stays.
4. "Make the iPhone two and then check out." → quantity 2, then it stops at Apple's sign-in: "Sign in yourself; I never type passwords, addresses or card details."

## 2. Apple: AirTag and MacBook

> **"Dixi, add an AirTag and a MacBook Air in midnight to my bag, then open my bag."**

Adds an AirTag (1 pack, no engraving) and a MacBook Air (13-inch, Midnight), then opens the bag. Takes about 14–20 s.

Follow-ups:
1. "Make the AirTag two." → AirTag quantity 2.
2. "What's the total in my bag?" → the real total.
3. "Remove the MacBook Air and go to checkout." → the MacBook is removed, then it stops at Apple's sign-in.

## 3. Apple: browse, ask, then buy

> **"Dixi, show me AirPods on the Apple Store and tell me which ones are the best right now."**

Opens Apple's AirPods and answers from the page, e.g. "AirPods Pro 3 at $249 and AirPods Max 2 at $549".

Follow-ups:
1. "Buy me AirPods Pro, then open my bag." → added, bag open.
2. "I want an iPad." → Dixi asks: "Which iPad: iPad 11, iPad Air, iPad Mini or iPad Pro?"
3. "The iPad Air." → answers its question; the iPad Air is added. Takes about 17 s, because Apple's page asks 5 questions.

## 4. Amazon: search, check, buy

> **"Dixi, search for wireless earbuds on Amazon, open the first result and tell me its rating."**

Searches, opens the first product, and reads its rating from the page, e.g. "4.8 out of 5 stars". Takes about 7–8 s.

Follow-up:
1. "Add it to my cart and go to purchase." → added, then it stops at Amazon's sign-in.

## 5. YouTube: find, play, control

> **"Dixi, open YouTube, search for lofi beats and play the first video."**

Opens YouTube, searches and plays the first result. Takes about 4–7 s. The first result is sometimes a YouTube Short; it plays that.

Follow-ups:
1. "Pause it and turn it up." → paused, louder.
2. "Skip ahead and mute it." → jumps ahead about 10 s, muted.
3. "What is this video about?" → e.g. "A 2-hour lo-fi mix for studying and chilling."

---

**Avoid during the demo:** putting a quantity change in the same breath as adding that item ("add an AirTag … and make the AirTag two" can add a second AirTag). Say it as a follow-up, as above. Also avoid running many Amazon sessions back to back: Amazon may show its "continue shopping" human check, and Dixi stops there for you.

A whole demo (all 5) costs about $0.05 in AI calls.
