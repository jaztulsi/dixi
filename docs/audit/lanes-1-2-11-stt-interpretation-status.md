# Audit: lanes 1, 2 and 11 (speech recognition, interpretation, status UI)

Read-only audit of tag `dixi-baseline-2026-10-16`, run 2026-10-16. Evidence comes from two places: running `planTask`/`splitOnConjunctions` directly, and a `VoiceAgent` with fake I/O fed Flux `TurnInfo` streams ("sim"). All 42 unit tests pass, but none of them uses Flux `TurnInfo` messages; they only cover the old v1 `Results` message (`test/unit/agents.test.js:81`).

**Root cause behind most interpretation failures:** `route()` calls `planTask` first (`voice.js:337`), before the site map, `parseSearch`, the on-device model or the LLM. `planTask` returns a confident plan whenever it sees any known brand or verb, and it almost never says "not mine". Nothing checks that the words it threw away were only filler. So wrong parses run at once, and the LLM never sees them.

## Speech recognition (STT)

- **A1 (High, effort S): acts on the "probably done" signal.**
  - **Cause:** both `EagerEndOfTurn` and a local 500 ms `stillTimer` trigger actions (`voice.js:159-171,35`). The eager threshold is 0.4 (`deepgram.js:14`). `TurnResumed` is not handled.
  - **Sim:** "Buy me a bagel ⏸ from Safeway" searched DoorDash for "bagel", then opened safeway.com/menu. "Open up ⏸ Zentora" opened www.up.com, then www.upzentora.com.
  - **Fix:** treat Eager as speculation only, commit on EndOfTurn, abort on TurnResumed, and remove `stillTimer`.
- **A2 (High, effort M): a half-said clause runs and the rest of it is lost.**
  - **Cause:** the last clause counts as finished as soon as `directNavigationURL` resolves (`voice.js:259`). `revise()` only re-aims searches and AI items (`voice.js:279-293`).
  - **Sim:** "Open Google Classroom", fed word by word, opened only google.com ("Opening Google [done]"). The same happened with "Open YouTube Music".
- **A3 (Medium, effort S): dead code and untested events.** The v1 `Results`/`UtteranceEnd`/`Finalize` path never runs under Flux (`voice.js:129-149,183-190`). The end-to-end harness never sends `EagerEndOfTurn` or `TurnResumed`.
- **A4 (Medium, effort S): Flux signals are ignored.** `Error` and `FatalError` messages are dropped silently. The turn index, word confidences and EOT confidence are never read.
- **A5 (Medium, effort S): vocabulary boosting is static.** Only the keyterm "Dixi" is boosted. The params passed through `deepgram:open` are ignored, and the code never sends `Configure`.
- **A6 (Medium, effort M): the wake word fires on casual mentions.** It matches anywhere in the text (`text.js:100-107`), and for 8 s afterwards all speech counts as a command. "I was telling Dixie about YouTube yesterday" ran a YouTube search for "about yesterday".
- **A7 (Medium, effort M): no barge-in.** All speech is dropped while Dixi talks, plus a 1.5 s tail (`speaker.js:4,14-17`), so "stop" can't interrupt it.
- **A8 (Low, effort S): mic robustness.** Device changes and ended tracks aren't handled (`mic.js`), and there's no voice-activity detection. One comment says 100 ms but the buffer is actually 80 ms.
- **A9 (Low, effort S): three filler lists that disagree.** `text.js:59`, `tasks.js:89` and `learn.js:9` each strip filler differently. "go ahead", "okay so" and "hmm" aren't handled.

## Interpretation

- **I1 (High, effort M): a known brand inside a longer name takes over, and "open" becomes a search** (`tasks.js:58-59,114-116,225`).
  - "open up Google Classroom" → Google search "up classroom".
  - "open Google Docs/Drive/Meet" → Google searches.
  - "open YouTube Music" → YouTube search "open music" plus autoplay.
  - "launch Spotify" → Spotify search "launch".
- **I2 (High, effort S): verb particles and possessives leak into the target** (`tasks.js:228,240`). Examples: upzentora.com, upcanvas.com, www.up.com, mycanvasgrades.com, myemail.com, and a Target search for "bring up".
- **I3 (High, effort M): unverified ".com" guessing comes before any real knowledge** (`tasks.js:81-86`). Two site tables disagree with each other. Examples: applemusic.com, applestore.com, applecom.com, zentoraio.com, checkout.com, microsoftteams.com.
- **I4 (High, effort S): a self-correction is dropped once Flux adds punctuation** (`voice.js:293`, `text.js:67`). "Search cats on YouTube. No wait, dogs." stays on cats.
- **I5 (High, effort M): relative references turn into literal searches plus add-to-cart** (`tasks.js:157-165`). "add the cheaper one to my cart" searched Amazon for "cheaper", then added the first result. "show my cart" also adds to the cart.
- **I6 (High, effort M): unknown sites get folded into the query, and "play" defaults to YouTube** (`tasks.js:13-44,203-211`).
  - "search lo-fi beats on Apple Music" → Google search "lo-fi beats apple music". With a pause, the sim first opened an apple.com search.
  - "play lo-fi beats on Apple Music" → YouTube.
  - "search for bagels" while on safeway.com → Google.
- **I7 (Medium, effort S): negation is treated as a question** (`tasks.js:92,130-134`). "do not open YouTube" ran a Google search; "don't search for cats" searched Google for "don't cats".
- **I8 (Medium, effort M): splitting on every "and"** (`text.js:60`) breaks "rock and roll", "Barnes and Noble" and "two whoppers and a large fries".
- **I9 (Medium, effort S): no small-talk class, and the on-device model is overconfident.** "go ahead" scores 0.62 for skip_ad. "hey how are you" costs an LLM call.
- **I10 (Medium, effort M): no context for misheard words or in-page actions.** "Briegel menu" and "go to purchase" fall to an LLM that has no candidate names and no page elements. "click buy now" searched Amazon for "click now".
- **I11 (Medium, effort S): no quantities.** "buy 2 iPads" searched Amazon for "2 ipads".
- **I12 (Low, effort S): learned answers are never forgotten** (`voice.js:372-374`, `learn.js:128-155`).

## Status UI

- **S1 (High, effort S): wrong actions vanish from the step list.** It's cleared at the start of a new sentence (`voice.js:262`).
- **S2 (High, effort M): steps are marked "done" without verification.** Open and search are done as soon as navigation starts. Agent failure is detected by a regex on free text (`voice.js:418`).
- **S3 (Medium, effort S): vague errors** ("Couldn't find that on this page", `siteActions.js:186`; "Couldn't understand that" when the API failed).
- **S4 (Medium, effort S): labels present a wrong parse as fact** (`Google: "up classroom"`, `Opening Up Zentora`).
- **S5 (Medium, effort M): several paths can act on the same utterance.** Duplicates are only caught when the text matches exactly. The Apple Music sim produced 3 navigations.
- **S6 (Low, effort S): the status line is overwritten.** Three writers race, and the last one wins.

## Suspects checked and ruled out

- **Mic capture:** 80 ms chunks of 16-bit PCM at 16 kHz is correct for Flux, and the key stays in the main process.
- **Echo timing:** the arithmetic is correct. The problem is the policy (no barge-in).
- **Basic handling that works:** fillers like "um" and "uh" are stripped, unpunctuated corrections work, and "open YouTube and search cats" splits correctly.
- **Amazon and YouTube:** they aren't hard-coded destinations. They're fallback defaults, which is why results look hard-coded.

(Full table of inputs and outputs: see the agent transcript summary in `docs/AUDIT.md`.)
