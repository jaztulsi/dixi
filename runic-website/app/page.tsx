import { DemoWindow } from '@/components/DemoWindow';
import { Footer } from '@/components/Footer';
import { GlassPill } from '@/components/GlassPill';
import { Island } from '@/components/Island';
import { LaunchButton } from '@/components/LaunchButton';
import { MascotI } from '@/components/MascotI';
import { MascotSprite } from '@/components/MascotSprite';
import { Marker, Section, TwoTone } from '@/components/Section';
import { ShuffleDeck, type UseCase } from '@/components/ShuffleDeck';

// Website brand is "Dixi" (Latin: "I have spoken"). Copy claims only what the app ships today.
const CASES: UseCase[] = [
  { kind: 'Listen', say: 'open Apple Music and play lofi beats', result: 'Playing on Apple Music' },
  { kind: 'Shop', say: 'buy AirPods Pro on apple.com', result: 'Added to your bag' },
  { kind: 'Pay', say: 'check out with Apple Pay', result: 'Apple Pay ready. You confirm.' },
  { kind: 'Watch', say: 'play the second video', result: 'Playing the second video' },
  { kind: 'Shop', say: 'go to Amazon and search for noise cancelling headphones', result: 'Results on amazon.com' },
  { kind: 'Ask', say: 'who made this video?', result: 'Answered from the page, out loud' },
  { kind: 'Compare', say: 'compare this laptop’s price on Amazon and eBay', result: 'Checked both, side by side' },
];

const STEPS = [
  { numeral: 'I', title: 'Speak', body: 'Start with “Dixi.” No button. TV and conversation around you are ignored.' },
  { numeral: 'II', title: 'Act', body: '“Open YouTube” fires the moment you say it. It reads the page’s real buttons and links, not pixels.' },
  { numeral: 'III', title: 'Answer back', body: 'Ask about the page you’re on. Dixi answers from the page’s own text, out loud.' },
];

export default function Home() {
  return (
    <>
      <a href="#how" className="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <Island />

      <main>
        {/* Hero: the name, big. Then the demo that explains it. */}
        <section id="top" aria-labelledby="top-title" className="relative overflow-hidden px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-16">
          <div aria-hidden="true" className="marble-stripes stripes-hero" />
          <div className="relative mx-auto max-w-[1120px]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <h1 id="top-title" className="t-wordmark text-ink">
                <span aria-hidden="true" className="whitespace-nowrap">
                  Dix
                  <MascotI />
                </span>
                <span className="sr-only">Dixi: the web, hands-free</span>
              </h1>
              <p aria-hidden="true" className="t-headline lg:pt-6 lg:text-right">
                <span className="text-fg">The web,</span>
                <br />
                <span className="whitespace-nowrap text-fg-2">hands‑free.</span>
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <p className="max-w-[520px] text-fg-2">Say what you want. Dixi reads the page and does it, before you finish your sentence.</p>
              <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
                <span data-mood="happy" className="contents">
                  <LaunchButton />
                </span>
                <span data-mood="curious" className="contents">
                  <GlassPill href="#how">See how it works</GlassPill>
                </span>
              </div>
            </div>
            <p className="mt-4 text-[15px] text-fg-2 lg:text-right">Opens the Dixi app on this Mac.</p>

            <div className="mt-36">
              <DemoWindow />
            </div>
          </div>
        </section>

        {/* II · What you can say: a deck that shuffles through use cases */}
        <Section id="say" numeral="II" label="What you can say" className="overflow-hidden py-24 sm:py-32">
          <div aria-hidden="true" className="marble-stripes stripes-deck" />
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="II" label="What you can say" />
            <h2 id="say-title" className="t-headline">
              <TwoTone lead="Just say it." rest=" Dixi keeps up." />
            </h2>
            <div className="mt-16 text-left">
              <ShuffleDeck cases={CASES} />
            </div>
          </div>
        </Section>

        {/* III · How it works */}
        <Section id="how" numeral="III" label="How it works" className="pt-24 pb-8 sm:pt-32 sm:pb-12">
          <div className="relative mx-auto max-w-[1120px]">
            <div className="text-center">
              <Marker numeral="III" label="How it works" />
              <h2 id="how-title" className="t-headline">
                <TwoTone lead="Talk." rest=" It acts." />
              </h2>
            </div>
            <ol className="mt-16 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.numeral} className="glass rounded-[var(--radius-panel)] p-8">
                  <p className="t-label" aria-hidden="true">
                    {s.numeral}
                  </p>
                  <h3 className="mt-4 text-[32px] leading-none font-bold tracking-[-0.035em] text-fg">{s.title}</h3>
                  <p className="mt-4 text-fg-2">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-center justify-center gap-3 text-[17px] text-fg-2">
              <MascotSprite pose="shrug" height={56} className="mascot-shadow" />
              <span>
                <span className="font-semibold text-fg">Soon:</span> Dixi learns the sites you use.
              </span>
            </p>
          </div>
        </Section>

        {/* IV · Launch, with privacy in one honest paragraph */}
        <Section id="launch" numeral="IV" label="Launch" className="overflow-hidden pt-8 pb-48 sm:pt-16 sm:pb-64">
          <div aria-hidden="true" className="marble-stripes stripes-launch" />
          <div className="relative mx-auto flex max-w-[760px] flex-col items-center text-center">
            <Marker numeral="IV" label="Launch" />
            <h2 id="launch-title" className="t-headline">
              <TwoTone lead="Just say" rest=" what you want." />
            </h2>
            <div className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto">
              <LaunchButton />
              <p className="text-[15px] text-fg-2">Opens the Dixi app on this Mac.</p>
            </div>

            <div className="relative mt-32 w-full max-w-[560px]">
              {/* holding up a blank marble tablet over the card's edge */}
              <MascotSprite pose="sign" height={132} className="mascot-shadow absolute -top-[108px] left-6 z-10" />
              <div className="glass rounded-[var(--radius-panel)] p-8 text-left">
                <p className="text-[21px] font-semibold text-fg">Don’t have Dixi yet?</p>
                <p className="mt-2 text-fg-2">Get the source on GitHub and run it on Mac, Windows or Linux.</p>
                <a href="https://github.com/unixers/runic" className="mt-6 inline-flex h-10 items-center rounded-full bg-ink px-4 text-[15px] font-semibold text-paper">
                  Get Dixi on GitHub
                </a>
                <p className="mt-8 border-t border-line pt-6 text-[15px] text-fg-2">
                  <span className="font-semibold text-fg">No account. No Dixi servers.</span> Your voice streams to Deepgram to be
                  transcribed. Page text, and a screenshot when it gets stuck, goes to Groq to pick the next step. Pause the mic anytime.
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
