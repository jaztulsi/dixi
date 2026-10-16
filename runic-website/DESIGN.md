# Runic website: "Marble and glass"

Status: **draft, awaiting approval.** Nothing outside this folder is touched.

## 0. Scope

| | Path |
|---|---|
| Website (this redesign, the only place I write) | `runic-website/` (new, its own npm package) |
| Off limits | `electron/`, `Runic/`, `Runic.xcodeproj/`, `Runic-Info.plist`, `website/` (old page, left as is), `branding/`, every root file (`README.md`, `PLAN.md`, `.gitignore`, `.env*`) |

Deep link: both apps already register `runic://` (`electron/src/main/main.js:72-74` calls
`app.setAsDefaultProtocolClient('runic')`; the Swift app declares it in `Runic-Info.plist`). The Electron
handler only focuses and prefills, never runs a task. The site links to exactly `runic://open`.

Commit guard: before each commit, `git diff --cached --name-only` must list only `runic-website/` paths.
The final report shows `git diff --stat 676c2a9..HEAD`. Your uncommitted Electron edits stay unstaged.

## 1. Stack

The old site is plain HTML, so per the brief: **Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Motion**
(`motion/react`). `output: 'export'` gives a static site that can be hosted anywhere. Routes: `/` (same title and
description as today, plus Open Graph tags) and `/credits` (new). shadcn is used only for `Button` (Slot +
variants). Nothing else is pulled in.

## 2. Tokens (`app/tokens.css`, the only file with color literals)

```css
:root {
  /* dark (Apple dark system, grayscale) */
  --bg: #000000; --surface-1: #1C1C1E; --surface-2: #2C2C2E; --hairline: #38383A;
  --text: #FFFFFF; --text-2: rgba(235,235,245,.60); --text-3: rgba(235,235,245,.30);
  /* light marble zones */
  --light-bg: #EDEDF0; --light-bg-2: #F5F5F7; --light-text: #1D1D1F; --light-text-2: #636366; /* see note */
  /* functional only */
  --done: #30D158; --rec: #FF453A;
  /* marble */
  --marble-white-ratio: .35;            /* target bright share per screen */
  --vein-light: #BFBFC4; --vein-light-2: #D2D2D7; --vein-dark: #1C1C1E; --vein-dark-2: #2C2C2E;
  /* glass */
  --glass-fill: rgba(255,255,255,.08); --glass-border: rgba(255,255,255,.14); --glass-spec: rgba(255,255,255,.35);
  --glass-fill-light: rgba(255,255,255,.55); --glass-border-light: rgba(0,0,0,.08);
  --island-ring: rgba(255,255,255,.10);
  --focus: #FFFFFF;
  /* shape + space */
  --radius-panel: 28px;                 /* the only non-pill radius: island (acting/menu), panels, card */
  --space: 8px;                         /* every margin/padding/gap is a multiple */
}
```

**Contrast (computed, WCAG 2.x). Three spec values fail and need your OK to adjust:**

| Pair | Ratio | Verdict |
|---|---|---|
| `--text-2` on #000 / #1C1C1E / #2C2C2E | 6.36 / 5.94 / 5.29 | pass |
| `--text-3` on #000 | **2.24** | **fails even large text.** Use only for non-text (dividers, inactive waveform bars). The hero caption uses `--text-2` |
| #6E6E73 on #EDEDF0 | **4.34** | **fails body.** Proposed `--light-text-2: #636366` (5.12) |
| #6E6E73 / #636366 on a #BFBFC4 vein | 2.77 / 3.27 | fails. Text columns get a vein-suppression mask so local bg stays ≥ #E5E5EA (#636366 gives 4.7 there) |
| #1D1D1F on #BFBFC4 (worst vein) | 9.19 | pass |
| black on white primary pill | 21 | pass |
| green #30D158 / red #FF453A on #000 | 10.4 / 6.2 | pass (icons only) |

The Playwright check (section 9) enforces this on the rendered page, so the table is not just a promise.

## 3. Type

- Stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", var(--font-inter), sans-serif`.
  Inter and Cinzel come through `next/font/google` (self-hosted at build, `display: swap`, size-adjusted fallback, so no shift).
- Headline: `clamp(56px, 9vw, 112px)`, 700, `-0.035em`, line-height .98. Two-tone: first phrase `--text`, rest `--text-2`.
  At 320px, 56px allows about 9 characters per line, so "The web, / hands-free." wraps in 2 lines.
- Statement (Principles): `clamp(40px, 6vw, 80px)`, same weight and tracking.
- Body 19px mobile / 21px ≥1024, line-height 1.45. Caption 15px.
- Cinzel 12px uppercase, tracking .16em: only Roman-numeral markers ("II · How it works") and tiny labels.

## 4. Glass vs. flat

| Element | Treatment | backdrop-filter |
|---|---|---|
| Island | Pure black + 1px `--island-ring` (per brief; solid, so it costs no blur layer) | no |
| Primary pill "Launch Runic" | Solid white, black text | no |
| Secondary pill "See how it works" | Glass | yes |
| Fallback download card (Launch) | Glass | yes |
| Relief step caption panel (How it works, pinned) | Glass, one at a time | yes |
| Everything else | Flat | no |

At most 3 blur layers are ever on screen. Glass recipe: `--glass-fill`, `blur(24px) saturate(180%)`, 1px border,
`inset 0 1px 0 var(--glass-spec)`, shadow `0 8px 32px rgba(0,0,0,.35)` (neutral, not a colored glow), specular
`radial-gradient` in a `::before` at the top-left. The fallback is `--surface-1` when
`@supports not (backdrop-filter: blur(1px))` or under `prefers-reduced-transparency: reduce`. In light zones it
uses `--glass-fill-light`, `--glass-border-light` and dark text.

## 5. Dynamic Island

Fixed, centered, `top: 12px`, `z-index: 50`. A real `<nav aria-label="Main">` wraps a `<button aria-expanded>`.
The shape is a Motion `layout` element with spring `{ type: 'spring', stiffness: 400, damping: 32 }`. Content swaps
through `AnimatePresence mode="popLayout"` with `opacity 0→1, scale .95→1, filter blur(8px)→0`. Blur is the one
non-transform/opacity property, and it only runs on the island's few nodes.

| State | Size (w×h, radius) | Content |
|---|---|---|
| `idle` | 148×40, r20 | Runic mark + 5-bar waveform (bars in `--text-3`) |
| `listening` | 220×44, r22 | Red dot, live waveform, "Listening" |
| `acting` | min(420, 100vw−32) × auto, r28 | Transcript (stable words `--text`, interim words `--text-2`) + action row: green check + "Opened youtube.com" / "Searching "lofi beats"" |
| `done` | 260×44, r22 | Green check + "Results ready", then collapses to `idle` |
| `section` | auto×40, r20 | Cinzel "II · How it works", shown ~1.6 s, then returns |
| `menu` | 300×auto, r28 | Links: Why, How it works, Launch Runic (`runic://open`) |

```
          ┌──────── hero in view, tab visible, no reduced motion ────────┐
          ▼                                                              │
idle ──(1.2s)──► listening ──(words start)──► acting ──(last action)──► done ──(1.4s)──┘
  ▲  ╲                                                                    
  │   ╲ section enters (once per entry) ──► section ──(1.6s)──► previous state
  │
  └── Esc / tap outside / select link ◄── menu ◄── tap or Enter/Space (from any state; loop pauses)
```

- The demo script is fixed: "Runic, open YouTube and search for lofi beats." Words arrive at a fixed cadence
  **labeled "Illustrative" in code and on the page** ("Illustrative timing" in the caption under the hero). No measured
  numbers are shown anywhere.
- `aria-live="polite"` on the transcript line only, announcing the final sentence once per loop rather than each word.
- Menu: focus moves to the first link. Tab cycles through the links, Escape closes and returns focus to the island
  button, and so does a click outside.
- Reduced motion: no loop, no morph. The island sits in `idle` (menu still works), and the hero shows the transcript
  statically under the buttons.
- Mobile: same states. `acting` is clamped to `100vw − 32px`.

## 6. Imagery (all verified CC0 through the Met Open Access API, `isPublicDomain: true`)

| Use | Object | Met ID | Source image |
|---|---|---|---|
| Hero bust | Marble portrait bust of a man, mid-3rd c. CE | 248118 | `CRDImages/gr/original/DP335892.jpg` |
| Hand / gesture (Principles, light zone) | Marble left hand holding a scroll, 1st–2nd c. CE | 251036 | `CRDImages/gr/original/DP231306.jpg` |
| Toga-fold drapery (Privacy, dark zone) | Marble statue of a member of the imperial family, 27 BCE–68 CE | 257641 | `CRDImages/gr/original/DP-1353-002.jpg` |
| Bas-relief strip, split in thirds for I / II / III | Marble sarcophagus with the contest between the Muses and the Sirens, 3rd quarter 3rd c. CE | 248205 | `CRDImages/gr/original/DP138718.jpg` |

Object pages are `https://www.metmuseum.org/art/collection/search/<ID>`. Each is credited on `/credits`
with title, date, ID, "The Metropolitan Museum of Art, Open Access (CC0)".

Processing (`scripts/images.py`, run once, outputs committed under `public/img/`; nothing hotlinked):
grayscale, levels + contrast curve, then a background-specific step.
- Bust and drapery (dark gray studio backdrop): crush the backdrop to #000 with a luminance curve, then a feathered
  edge mask. That makes the cutout clean on black.
- Hand (light gray backdrop): lift the backdrop to #EDEDF0, then a radial mask so it dissolves into the white marble.
- Relief: tight rectangular crop to the frieze band (no cutout needed), split into 3 crops.
- Export AVIF + WebP at 1x/2x through `<picture>`, with explicit `width`/`height` (no layout shift). The hero
  uses `fetchpriority="high"` and is preloaded. The rest use `loading="lazy"`.

## 7. Marble background

Textures, both **CC0 from ambientCG** (credited on `/credits`):
- White Carrara-style: **Marble019** (`ambientcg.com/a/Marble019`), remapped to base #EDEDF0, veins #BFBFC4–#D2D2D7.
- Black Nero-style: **Marble016** (`ambientcg.com/a/Marble016`), remapped to base #000, veins #1C1C1E–#2C2C2E.
- Grain: a 128px noise tile generated by the script (our own work), at 2.5% opacity, to stop banding.

Payload budget: about 220 KB per stone at 1600px AVIF plus about 8 KB of grain, so **< 600 KB** total. The
script fails if it goes over.

Composition: the black stone is the page base. White marble masses are absolutely positioned `<div>`s with a
static `background-image` and `mask-image: linear-gradient(160deg, #000 0%, transparent X%)`, sized so each screen
lands near `--marble-white-ratio` (~35%). No SVG filters and no `background-attachment: fixed`. Parallax on the
bust is `transform` only, driven by `useScroll`.

## 8. Sections: tone map

`data-tone` sets text tokens per section (`[data-tone=light] { --fg: var(--light-text); --fg-2: var(--light-text-2) }`).

| # | Section | data-tone | Marble | Text sits on |
|---|---|---|---|---|
| 1 | Hero | dark | White mass from the top-left (~35%), fading by 160deg; dark behind the bust (center-right) | Black (headline over bust shoulder: rim-lit edge only, checked) |
| 2 | How it works (II) | dark | Nero only, ~5% white | Black / glass caption panel |
| 3 | Principles (III) | **light** | Full white marble, long masks (40vh) above and below; hand image | #EDEDF0 with vein suppression under the text column |
| 4 | What you can say (IV) | dark | Nero | Black |
| 5 | Privacy (V) | dark | Nero; drapery image | Black |
| 6 | Launch (VI) | dark | Mirrored white mass bottom-right (~30%) | Black (card is glass, positioned off the white mass) |
| 7 | Footer | dark | Black | Black |

Overall ~65/35 dark/bright per screen. The Playwright report prints the measured ratio for each screen.

### Copy (only what ships; checked against the READMEs and `electron/src`)

1. **Hero:** "The web, hands-free." / "Say what you want. Runic reads the page and does it, before you finish your
   sentence." / [Launch Runic] [See how it works] / "Opens the Runic app on this Mac."
2. **How it works:** I Speak: "Start with “Runic.” No button. TV and conversation are ignored."
   II Act: "“Open YouTube” fires the moment you say it. The search is loading before you finish."
   III Answer back: "Ask about the page. Runic answers from the page's own text, out loud."
3. **Principles:** "Acts before you finish." / "Reads the page, not pixels." / "No button. Just say Runic." /
   "Learns the sites you use." + quiet **Soon** (the RAG work on `runic-rag` is uncommitted, so it is not shipped).
4. **What you can say** (I–VII): "Runic, open YouTube and search for lofi beats" · "play the second video" ·
   "skip the ad" · "go to Amazon and search for noise cancelling headphones" · "add it to my cart" ·
   "who made this video?" · "go back".
5. **Privacy:** "No account. No Runic servers." / "Your voice streams to Deepgram to be transcribed. Page text, and a
   screenshot when it gets stuck, goes to Groq to choose the next step. That's all that leaves your computer.
   Pause the mic anytime."
6. **Launch:** "Just say what you want." [Launch Runic → `runic://open`] + glass fallback card: "Don't have Runic yet?
   Get the source on GitHub and run it on Mac, Windows or Linux." → `https://github.com/unixers/runic` (repo is
   public, there are no releases yet, so there is no binary download link). If the page is still focused 1.5 s after
   the click (the protocol didn't open), the card gets a polite "Couldn't open Runic. Is it installed?" line.
7. **Footer:** mark · Credits · GitHub · © 2026 Runic.

No testimonials, logos, user counts or stats. The old site's "~1s / ~1.7s / 0 clicks" row is dropped.

## 9. Components and checks

`Island`, `GlassPill`, `Button` (shadcn), `StatementSection`, `ReliefStep`, `ListRow`, `Marble` (a positioned
mass), `Section` (sets `data-tone` and the Cinzel marker). One page file, one credits file, one tokens file.

How it works is pinned: a 300vh section with a `sticky` 100vh stage. `useScroll` progress picks the active
step (I/II/III), the relief third and the island's demo phase. Reduced motion or < 640px height: three stacked
static panels instead.

Checks (`npm run check`):
1. `tests/contrast.spec.ts` (Playwright): at 1440/1024/390/320, inject `color: transparent` on all text,
   screenshot, and for each text box compute worst-case contrast of its computed color against the 5th/95th
   percentile background luminance under it. Fail below 4.5 (3.0 for ≥24px or ≥18.66px bold). It also prints the
   bright-pixel share (L > .5) per viewport-height screen.
2. `tests/a11y.spec.ts`: island keyboard flow (Enter opens, Tab cycles, Esc closes and restores focus),
   focus ring visible, no horizontal scroll at 320px, CLS = 0 via PerformanceObserver.
3. Lighthouse mobile (`npx lighthouse`) for perf ≥ 90 and a11y ≥ 95, if Chrome runs headless here.
   VoiceOver can't be automated. I'll do a manual pass and report it, or flag it as not run.

## 10. Wireframes

### 1440

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░            ╭──[ᚱ ıılıı]──╮                                         │ ← island, top 12
│░░░ white marble ░░░░░░░░░                                                           │
│░░░░░░░░░░░░░░░░                                    ▓▓▓▓▓▓▓▓                         │
│░░░░░░░░░░                                        ▓▓ bust  ▓▓                        │
│░░░░░              The web, hands-free.         ▓▓ rim-lit  ▓▓                       │ ← 112px, centered,
│░░                (white)  (gray)                  ▓▓▓▓▓▓▓▓▓▓                         │   overlaps bust
│        Say what you want. Runic reads the page and does it,▓▓▓▓▓▓▓                   │
│                  before you finish your sentence. ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                     │
│                  ( Launch Runic )  ( See how it works )                              │
│                         Opens the Runic app on this Mac.                             │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                              II · HOW IT WORKS        (pinned 300vh)                 │
│                         ╭── island as stage (acting) ──╮                             │
│        ┌──────── relief third I ────────┐   ┌ glass caption ─────────┐              │
│        │  ▒▒▒ Muses frieze crop ▒▒▒     │   │ I · Speak              │              │
│        └────────────────────────────────┘   │ Start with "Runic."... │              │
│                    ● ○ ○                    └────────────────────────┘              │
├──────────────────────────────────────────────────────────────────────────────────────┤
│░░░░░░░░░░░░░░░░░░░ III · PRINCIPLES  (white marble, dark text) ░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░             Acts before you finish.                    ✋ hand ░░░░░░░│
│░░░░░░░░░░░░░             Reads the page, not pixels.                ░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░             No button. Just say Runic.                 ░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░             Learns the sites you use.  Soon            ░░░░░░░░░░░░░░│
├──────────────────────────────────────────────────────────────────────────────────────┤
│                         IV · WHAT YOU CAN SAY        (max-width 760)                 │
│                    I    Runic, open YouTube and search for lofi beats                │
│                    ───────────────────────────────────────────── (1px hairline)      │
│                    II   play the second video          … through VII                 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  drapery ▓▓▓        V · PRIVACY   No account. No Runic servers.  + paragraph         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                    VI · LAUNCH   Just say what you want.                             │
│                    ( Launch Runic )                                                  │
│                    ┌ glass card: Don't have Runic yet? → GitHub ┐       ░░░░░░░░░░░│
│                    └────────────────────────────────────────────┘  ░░░░░ marble ░░░│
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ᚱ Runic                                   Credits · GitHub · © 2026                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 1024

Same order and centering. Headline drops to about 92px (9vw). The bust shrinks to 60% of the viewport height and
sits behind the headline's second line. Principles: the hand moves below the four statements. How it works: the
relief panel sits above the caption (stacked inside the sticky stage) instead of side by side.

### 390 (and down to 320)

```
┌──────────────────────────┐
│░░░░   ╭[ᚱ ıılıı]╮        │
│░░░░░░░   ▓▓▓▓▓▓          │  bust, top-center, 70vw, behind headline
│░░░░     ▓ bust ▓         │
│ The web,                 │  56px
│ hands-free.              │
│ Say what you want. Runic │  19px
│ reads the page and…      │
│ ( Launch Runic      )    │  full-width pills, 48px tall, 16px gutter
│ ( See how it works  )    │
│ Opens the Runic app on…  │
├──────────────────────────┤
│ II · HOW IT WORKS        │  pinned; relief third full-width, caption below
│ [relief I]               │
│ I · Speak …              │
├──────────────────────────┤
│░ III · PRINCIPLES ░░░░░░░│  statements 40px, one per screen-ish
│░ Acts before you finish.░│
│░ …                ✋    ░│
├──────────────────────────┤
│ IV  I  Runic, open…      │  numeral gutter 40px
│ ───────────────────────  │
│ V · PRIVACY  drapery top │
│ VI · LAUNCH  pill + card │
│ footer                   │
└──────────────────────────┘
```

Grid: 8px base. Gutters 16 (mobile) / 32 (tablet) / 64 (desktop). Section padding 128/160/192 vertical.
Pills are 48px tall (40 small). Content max-width is 1120, with 760 for reading columns.

## 11. Open questions

1. Approve the contrast fixes in §2 (`--light-text-2: #636366`, tertiary never used for text)?
2. Principles #4 "Learns the sites you use. Soon": OK to tease the RAG work, or swap for another shipped line
   (for example "Works on sites nobody pre-programmed.")?
3. Fallback card links to the GitHub repo, since there are no release binaries. OK?
