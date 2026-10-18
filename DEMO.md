# Dixi demo: 3 statements

Three things to say to Dixi, each with follow-ups. These lines are hard-coded (`electron/src/renderer/core/demo.js`). Said like this, or close to it, Dixi knows them at once: no AI has to work out what you meant, and it goes straight to the right page. The only AI left is reading the page to answer a question.

"Close to it" means the same things named, in any order, with any filler: "get me the iPhone 18 and some AirPods" works. Naming something else (another colour, another product, "AirTag") goes to Dixi's normal understanding instead.

Every line below was spoken to the real Dixi app (real speech-to-text, real sites, a fresh profile) and checked against the site itself: the bag's lines, the cart, the video's real state, and that nothing was typed or ordered. (Amazon's "Make it two" was last checked typed rather than spoken, after its final fix.) Times are from when you stop talking to when Dixi is done.

**Before you start**
- `cd electron && npm start`, with `ELEVENLABS_API_KEY`, `CEREBRAS_API_KEY` and `ANTHROPIC_API_KEY` in `.env`. Restart Dixi after updating the code.
- Start each line with "Dixi, …". Say a statement in one breath: a pause of a second or more ends it early.
- Wait for the ✓ before the next line. Start with an empty Apple bag.
- Dixi never signs in or pays: checkout always stops at the store's sign-in page for you.

---

## 1. Apple: iPhone 18 and AirPods

> **"Dixi, buy me an iPhone 18 and AirPods, then open my bag."**

Adds an **iPhone 18 Pro, Black, 256GB** (no trade-in, no AppleCare) and **AirPods Pro 3**, then opens the bag. About 9–10 s.

Apple doesn't sell a plain "iPhone 18", only the iPhone 18 Pro and Pro Max, so "iPhone 18" means the iPhone 18 Pro. You can also name the model, colour and storage, and Dixi opens that exact configuration: "an iPhone 18 Pro Max in burgundy with 1 terabyte and AirPods Max". Colours: black, burgundy, glacier, silver. Storage: 256GB, 512GB, 1TB, 2TB. (Live runs used the default; the other options are covered by unit tests.)

Follow-ups:
1. "What's the total in my bag?" → reads the real total, e.g. "$1,615.16". About 1.5 s.
2. "How much is the iPhone by itself?" → e.g. "The iPhone 18 Pro 256GB in Black is $1,199.00." About 1.5–3.5 s.
3. "Remove the AirPods." → the AirPods line is gone; the iPhone stays. About 2 s.
4. "Check out." → stops at Apple's sign-in: "Sign in yourself; I never type passwords, addresses or card details." About 2.5 s.

## 2. YouTube: lofi beats

> **"Dixi, play lofi beats on YouTube."**

Searches YouTube and plays the first result. About 7 s. The first result is sometimes a mix or a playlist; it plays that.

Follow-ups:
1. "How many subscribers does this channel have?" → read from the page, e.g. "15.8 million subscribers." About 1.5 s.
2. "Pause it and turn it up." → paused, louder. About 1 s.
3. "What is this video about?" → e.g. "A cozy autumn lofi mix for studying or relaxing." About 1.5 s.

## 3. Amazon: add to cart

> **"Dixi, search for wireless earbuds on Amazon and add the first one to my cart."**

Searches Amazon and adds the first result to the cart. About 11–14 s.

Follow-ups:
1. "Go to my cart." → the cart, with the earbuds in it. About 2 s.
2. "What's in my cart and how much is it?" → read from the cart page. About 1.5 s.
3. "Make it two." → quantity 2, checked against Amazon's own cart count (and still 2 after a reload). About 1 s.
4. "Check out." → stops at Amazon's sign-in. About 2 s.

---

**Avoid during the demo:** running many Amazon sessions back to back. Amazon then shows its "prove you're human" check, and Dixi stops there and hands it to you. Also avoid putting a quantity change in the same breath as adding that item; say it as a follow-up, as above.

Dixi's voice is ElevenLabs "Matilda" on the Turbo v2.5 model, at an unhurried pace. Numbers are written out before they're spoken ("one thousand six hundred fifteen dollars and sixteen cents"), so prices, sizes and ratings come out right. To try another voice, set `DIXI_VOICE` in `.env` (Jessica: `cgSgspJ2msm6clMCkdW9`, Bella: `hpp4J3VqNfWAUOO0d1Us`). A whole demo costs a few cents in AI calls, all for answering questions.
