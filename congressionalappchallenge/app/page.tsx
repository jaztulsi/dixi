import { DemoWindow } from '@/components/DemoWindow';
import { Footer } from '@/components/Footer';
import { GlassPill } from '@/components/GlassPill';
import { Island } from '@/components/Island';
import { LaunchButton } from '@/components/LaunchButton';
import { MascotI } from '@/components/MascotI';
import { MascotSprite } from '@/components/MascotSprite';
import { Marker, Section, TwoTone } from '@/components/Section';
import { ShuffleDeck, type UseCase } from '@/components/ShuffleDeck';

// Dixi's Congressional App Challenge page. Every phrase in CASES was run in the app on the live site
// (DEMO.md, website/app/page.tsx); features still being built are marked "Building" in NEW, never "Ready".
const CASES: UseCase[] = [
  { kind: 'Listen', say: 'play lofi beats on YouTube', result: 'Playing, and checked it’s moving' },
  { kind: 'Control', say: 'pause it and turn it up', result: 'Paused. Volume up.' },
  { kind: 'Ask', say: 'how many subscribers does this channel have?', result: 'Read aloud from the page' },
  { kind: 'Shop', say: 'search for wireless earbuds on Amazon and add the first one to my cart', result: 'In the cart. Paying stays yours.' },
  { kind: 'Ask', say: 'what’s in my cart and how much is it?', result: 'Each item and the total, out loud' },
  { kind: 'Shop', say: 'make it two', result: 'Quantity changed and checked' },
  { kind: 'Help', say: 'search for reset AirPods on Apple Support', result: 'Apple Support articles' },
  { kind: 'Go', say: 'search for coffee on Apple Maps', result: 'Coffee nearby, on Apple Maps' },
];

// Sources: CDC (2024, 2022 data); Pew Research Center, “Tech Adoption Climbs Among Older Adults” (2017).
const STATS = [
  { figure: '1 in 4', body: 'U.S. adults lives with a disability. Trouble moving and walking is the most common kind.', source: 'CDC' },
  { figure: '48%', body: 'of adults 65 and older say they need someone to set up a new device or show them how to use it.', source: 'Pew Research Center' },
  { figure: '34%', body: 'of older internet users have little or no confidence doing things online.', source: 'Pew Research Center' },
];

const WHO = [
  { title: 'Grandparents', body: 'Shop, watch and look things up without waiting for a grandkid to visit.' },
  { title: 'Shaky or sore hands', body: 'Tremors and arthritis make a mouse hard. A voice doesn’t miss.' },
  { title: 'Low vision', body: 'No hunting for a tiny button. Dixi finds it and reads the answer aloud.' },
  { title: 'Caregivers', body: 'Set it up once. Stop being the family help desk.' },
];

// What happens to a command and which service sees it (as in electron/src/main/providers.js).
const FLOW = [
  { numeral: 'I', title: 'Hears', body: 'Say “Dixi” and talk. Your words become text while you speak. If one voice service is down, another takes over.', by: 'ElevenLabs · Deepgram' },
  { numeral: 'II', title: 'Understands', body: 'Simple commands like “open YouTube” need no AI. Quick steps go to Cerebras; shopping and harder steps go to Anthropic’s Claude.', by: 'Cerebras · Claude' },
  { numeral: 'III', title: 'Acts, then checks', body: 'Dixi presses the page’s real buttons, then checks the page really changed: the video plays, the cart went up.', by: 'On your Mac' },
  { numeral: 'IV', title: 'Tells you', body: 'Dixi says what it did, and answers questions from the page’s own words, out loud.', by: 'Spoken reply' },
];

const SAFE = [
  { title: 'Stops before paying', body: 'Dixi fills the cart and stops at checkout. Paying is always your decision.' },
  { title: 'Never types passwords', body: 'Sign-in, card numbers and codes are handed back to you.' },
  { title: 'Can’t be bossed by a page', body: 'Text on a website is information, never orders. A page can’t tell Dixi what to do.' },
  { title: 'Stops on a word', body: 'Say “stop” or press Esc, and everything halts at once.' },
];

// New for the Challenge. "Ready" = in the app today; "Building" = in progress, not yet shipped.
const NEW = [
  { status: 'Ready', title: 'Never goes quiet', body: 'If the main voice service runs out, Dixi switches to a backup by itself, then to the computer’s own voice.' },
  { status: 'Building', title: 'Draws on the screen', body: 'Dixi circles the button it’s about to press and draws arrows as it explains, so you learn the site while it works. “Circle the sign-in button.”' },
  { status: 'Building', title: 'Notices when you step away', body: 'An optional camera mode that pauses Dixi when you leave and picks up when you’re back. It runs on your computer; no video leaves it.' },
  { status: 'Building', title: 'Keeps your rules', body: '“Under twenty dollars.” “The one that arrives by Friday.” Dixi checks every option against what you said and tells you why it picked one.' },
  { status: 'Building', title: 'Asks only when it matters', body: 'A real choice, or something you can’t undo? Dixi asks first. Otherwise it just does it and says what it did.' },
  { status: 'Building', title: 'Remembers your favorites', body: 'Your sizes, stores and sites, if you want. Kept on your computer, where you can see and delete them.' },
];

function Cards({ items, cols }: { items: { title: string; body: string; status?: string }[]; cols: string }) {
  return (
    <ul className={`mt-16 grid gap-4 ${cols}`}>
      {items.map((s) => (
        <li key={s.title} className="glass rounded-[var(--radius-panel)] p-8 text-left">
          {s.status ? (
            <p className={`inline-block rounded-full border px-3 py-1 text-[13px] ${s.status === 'Ready' ? 'border-done text-fg' : 'border-line text-fg-2'}`}>{s.status}</p>
          ) : null}
          <h3 className={`${s.status ? 'mt-4 ' : ''}text-[24px] leading-tight font-bold tracking-[-0.03em] text-fg`}>{s.title}</h3>
          <p className="mt-3 text-fg-2">{s.body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <>
      <a href="#impact" className="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <Island />

      <main>
        {/* Hero: the name, big. Then the demo that explains it. */}
        <section id="top" aria-labelledby="top-title" className="relative overflow-hidden px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-16">
          <div aria-hidden="true" className="marble-stripes stripes-hero" />
          <div className="relative mx-auto max-w-[1120px]">
            <p className="t-label">Congressional App Challenge · 2026</p>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <h1 id="top-title" className="t-wordmark text-ink">
                <span aria-hidden="true" className="whitespace-nowrap">
                  Dix
                  <MascotI />
                </span>
                <span className="sr-only">Dixi for the Congressional App Challenge: voice this, voice that</span>
              </h1>
              <p aria-hidden="true" className="t-headline lg:pt-6 lg:text-right">
                <span className="text-fg">Voice this.</span>
                <br />
                <span className="whitespace-nowrap text-fg-2">Voice that.</span>
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <p className="max-w-[560px] text-fg-2">
                <span className="font-semibold text-fg">Dixi for the Congressional App Challenge.</span> For everyone a mouse and a maze of
                tiny buttons left behind. Say what you want, and Dixi opens the site, presses the real buttons, checks it worked, and
                tells you out loud.
              </p>
              <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
                <span data-mood="happy" className="contents">
                  <LaunchButton />
                </span>
                <span data-mood="curious" className="contents">
                  <GlassPill href="#impact">Why it matters</GlassPill>
                </span>
              </div>
            </div>

            <div className="mt-36">
              <DemoWindow />
            </div>
          </div>
        </section>

        {/* II · Voice this, voice that: a deck that shuffles through use cases */}
        <Section id="say" numeral="II" label="Voice this, voice that" className="overflow-hidden py-24 sm:py-32">
          <div aria-hidden="true" className="marble-stripes stripes-deck" />
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="II" label="Voice this, voice that" />
            <h2 id="say-title" className="t-headline">
              <TwoTone lead="Just say it." rest=" No mouse needed." />
            </h2>
            <div className="mt-16 text-left">
              <ShuffleDeck cases={CASES} />
            </div>
          </div>
        </Section>

        {/* III · Why it matters: the people it's for, and the numbers */}
        <Section id="impact" numeral="III" label="Why it matters" className="pt-24 pb-8 sm:pt-32 sm:pb-12">
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="III" label="Why it matters" />
            <h2 id="impact-title" className="t-headline">
              <TwoTone lead="The web wasn’t built" rest=" for everyone." />
            </h2>
            <p className="mx-auto mt-6 max-w-[640px] text-fg-2">
              A mouse needs steady hands. Small text needs sharp eyes. Every site hides its buttons somewhere different. Dixi turns all
              of it into the one thing everyone already knows how to do: ask.
            </p>
            <ul className="mt-16 grid gap-4 md:grid-cols-3">
              {STATS.map((s) => (
                <li key={s.figure} className="glass rounded-[var(--radius-panel)] p-8 text-left">
                  <p className="text-[56px] leading-none font-extrabold tracking-[-0.05em] text-fg">{s.figure}</p>
                  <p className="mt-4 text-fg-2">{s.body}</p>
                  <p className="mt-4 text-[13px] text-fg-2">{s.source}</p>
                </li>
              ))}
            </ul>
            <Cards items={WHO} cols="sm:grid-cols-2 xl:grid-cols-4" />
          </div>
        </Section>

        {/* IV · How it works: each step and the service that sees it, then the safety rules */}
        <Section id="how" numeral="IV" label="How it works" className="pt-24 pb-8 sm:pt-32 sm:pb-12">
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="IV" label="How it works" />
            <h2 id="how-title" className="t-headline">
              <TwoTone lead="Talk." rest=" It acts. It checks." />
            </h2>
            <div className="glass mt-16 rounded-[var(--radius-panel)] p-8 text-left">
              {/* One row, left to right, on wide screens; 2×2 on tablets; stacked on phones */}
              <ol className="grid gap-8 md:grid-cols-2 xl:grid-cols-4 xl:gap-0">
                {FLOW.map((s) => (
                  <li key={s.numeral} className="flex flex-col xl:border-l xl:border-line xl:px-6 xl:first:border-l-0 xl:first:pl-0 xl:last:pr-0">
                    <span aria-hidden="true" className="font-roman text-[12px] tracking-[.16em] text-fg-2">
                      {s.numeral}
                    </span>
                    <p className="mt-3 font-semibold text-fg">{s.title}</p>
                    <p className="mt-1 text-[15px] text-fg-2">{s.body}</p>
                    <div className="mt-auto pt-4">
                      <p className="inline-block rounded-full border border-line px-3 py-1 text-[13px] whitespace-nowrap text-fg-2">{s.by}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <h3 className="mt-24 text-[32px] leading-none font-bold tracking-[-0.035em] text-fg">Safe by design</h3>
            <Cards items={SAFE} cols="sm:grid-cols-2 xl:grid-cols-4" />
          </div>
        </Section>

        {/* V · New for the Challenge */}
        <Section id="new" numeral="V" label="New for the Challenge" className="pt-24 pb-8 sm:pt-32 sm:pb-12">
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="V" label="New for the Challenge" />
            <h2 id="new-title" className="t-headline">
              <TwoTone lead="It sees, draws" rest=" and remembers." />
            </h2>
            <Cards items={NEW} cols="md:grid-cols-2 xl:grid-cols-3" />
            <p className="mt-8 flex items-center justify-center gap-3 text-[17px] text-fg-2">
              <MascotSprite pose="shrug" height={56} className="mascot-shadow" />
              <span>
                <span className="font-semibold text-fg">Ready</span> is in the app today. <span className="font-semibold text-fg">Building</span>{' '}
                is on the way.
              </span>
            </p>
          </div>
        </Section>

        {/* VI · Launch */}
        <Section id="launch" numeral="VI" label="Launch" className="overflow-hidden pt-16 pb-48 sm:pt-24 sm:pb-64">
          <div aria-hidden="true" className="marble-stripes stripes-launch" />
          <div className="relative mx-auto flex max-w-[1120px] flex-col items-center text-center">
            <Marker numeral="VI" label="Launch" />
            <h2 id="launch-title" className="t-headline">
              <TwoTone lead="Voice this." rest=" Voice that." />
            </h2>
            <div className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto">
              <LaunchButton />
              <p className="text-[15px] text-fg-2">Opens the Dixi app on this Mac.</p>
            </div>

            <div className="relative mt-32 w-full">
              {/* holding up a blank marble tablet over the card's edge */}
              <MascotSprite pose="sign" height={132} className="mascot-shadow absolute -top-[108px] left-6 z-10" />
              <div className="glass rounded-[var(--radius-panel)] p-8 text-left">
                <h3 className="text-[21px] font-semibold text-fg">Built for the 2026 Congressional App Challenge</h3>
                <p className="mt-4 text-fg-2">
                  A student project with one goal: anyone who can talk can use the web. No account. No Dixi servers. Pause the mic
                  anytime.
                </p>
                <p className="mt-8 border-t border-line pt-6 text-[13px] text-fg-2">
                  Sources: CDC, “Disability Impacts All of Us” (2022 data). Pew Research Center, “Tech Adoption Climbs Among Older
                  Adults” (2017).
                </p>
              </div>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
