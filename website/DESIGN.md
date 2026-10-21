# Dixi website: "Marble and glass" (v2)

v1 (dark, Roman sculpture photography) is commit `aeb42a7`. v2 follows the owner's direction:
brand **Dixi**, ~85% white marble / ~15% black, bold black type, black marble stripes, a demo up top, a shuffling
use-case deck, the marble mascot throughout, and a shorter page.

## Scope

| | Path |
|---|---|
| Website | `website/` (package `dixi-website`: Next.js 15 static export, TypeScript, Tailwind v4, shadcn Button, Motion) |
| Electron UI restyle (requested later by the owner) | `electron/src/renderer/{index.html,styles.css,app.js,ui/mascot.js,assets/}` + one test title assertion. No voice/agent/main-process logic, no `package.json`, no protocol changes. |

"Launch Dixi" links to `dixi://open` only (prefill, never runs a task). The Electron app registers `dixi://`.

## Tokens (`app/tokens.css`, the only file with color literals)

Grayscale. Page = light marble (`#F5F5F7`, veins `#D2D2D7`), text `#1D1D1F`, secondary `#58585C` (the spec's
`#6E6E73` fails AA on marble; `#58585C` holds 4.6:1 even on a vein). Black island `#000`, dark glass `rgba(28,28,30,.9)`.
Functional only: green `#30D158` (done), red `#FF453A` (listening). `[data-tone=dark]` flips a block to the dark system.
`--marble-white-ratio: .85`. Radii: pills (full) and `28px` panels only.

## Type

System SF stack, Inter fallback via `next/font`; Cinzel 12px uppercase for numerals/labels. Wordmark
`clamp(112px, 21vw, 300px)` weight 800; headlines `clamp(48px, 7vw, 96px)` 700, tracking -0.035em, two-tone.

## Glass

Light glass (`rgba(255,255,255,.55)`, blur 24 saturate 180, hairline, inset highlight, top-left sheen) on pills,
How-it-works cards, the deck's top card and the launch card. Dark glass on the demo window. Solid fallbacks without
`backdrop-filter` or under `prefers-reduced-transparency`. At most 3-4 blur layers on screen (deck backs are solid).

## Page (4 sections + footer)

1. **Hero**: island; giant "Dix" + the mascot as the last **i**; "The web, hands-free." top right; sub; Launch /
   See how it works; dark-glass **demo window** (Apple Music search → play a preview → Apple TV → buy AirPods Pro) with
   the mascot hiding behind its edge and popping up to react.
2. **II What you can say**: deck of glass cards that shuffles itself (Apple Music, TV, Maps, Support, App Store, Podcasts, apple.com);
   reduced motion and screen readers get the plain list.
3. **III How it works**: Speak / Act / Answer back cards; "Soon: Dixi learns the sites you use" with the shrug pose.
4. **IV Launch**: deep link + a "How Dixi works" card (mascot holding a marble tablet over its edge): Hears / Understands /
   Acts / Answers, each with the service that sees it (ElevenLabs, Cerebras, Claude), then no account, no servers, private beta.
5. **Footer** (black) with the mascot waving. `/credits`, and a 404 with the angry crumbling pose.

Black stripes (inverted Onyx013) are masked masses behind the demo (≥640px), the deck and the launch corner.

## Mascot

Renders supplied by the owner (expressions sheet, wave, turnaround) → `scripts/mascot.py` cuts transparent sprites
(flood-fill from the border so the black eyes stay opaque) into `public/mascot/`, and builds **face**: the
high-res waving render with its painted eyes inpainted away, so the site draws live SVG eyes there.

| Where | Behaviour |
|---|---|
| The "i" in Dixi | Eyes follow the cursor (glints lag), blink, 3D tilt; three-quarter turn at the far left/right; idle glances; mood from `data-mood` on what you hover (happy on Launch, curious on See how); nods on click; sleeps after 12 s idle |
| Demo window | Hides behind the top edge; curious while listening, happy when a step lands, nods when done |
| Island | Avatar: neutral / curious / happy / nod |
| Launch card, Soon, footer, 404 | sign, shrug, wave, angry |

## Demo honesty

Every command on the site (demo + deck) is Apple and was run in the Dixi app against the live sites on 2026-10-15:
Apple Music search, "play the first song" (30-second preview; full songs need a sign-in), Apple TV, Maps, Support,
App Store, Podcasts, and "buy AirPods Pro" (opens the buy page; Dixi stops before options, bag and payment).
Apple Pay is not claimed: it only works in Safari, not in an Electron app. The wake word is "Dixi" in the app too.

## Checks (`npm run check`)

- `tests/contrast.spec.ts`: samples the rendered background under every text box at 1440/1024/390/320 (text hidden),
  fails below 4.5:1 (3:1 large); prints bright share per screen.
- `tests/a11y.spec.ts`: island keyboard flow (Enter, Tab, Escape restores focus, 2px ring), launch links only
  `dixi://open`, no horizontal scroll and CLS < 0.01 at four widths, credits complete.
- Lighthouse (static export): mobile 93 perf / 100 a11y / 100 best practices / 100 SEO; desktop 100 / 100.
