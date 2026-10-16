import { Footer } from '@/components/Footer';
import { GlassPill } from '@/components/GlassPill';
import { HeroBust } from '@/components/HeroBust';
import { HowItWorks } from '@/components/HowItWorks';
import { Island } from '@/components/Island';
import { LaunchButton } from '@/components/LaunchButton';
import { ListRow } from '@/components/ListRow';
import { Picture } from '@/components/Picture';
import type { Step } from '@/components/ReliefStep';
import { Marker, Section, TwoTone } from '@/components/Section';
import { StatementSection } from '@/components/StatementSection';
import { DEMO } from '@/lib/demo';

// Copy claims only what ships (checked against the app READMEs and electron/src). Unshipped = "Soon".
const STEPS: Step[] = [
  {
    numeral: 'I',
    title: 'Speak',
    body: 'Start with “Runic.” No button to press. TV and conversation around you are ignored.',
    relief: 'relief-1',
    alt: 'Relief detail: Muses with a lyre and a scroll, from a Roman sarcophagus',
  },
  {
    numeral: 'II',
    title: 'Act',
    body: '“Open YouTube” fires the moment you say it. The search is loading before you finish.',
    relief: 'relief-2',
    alt: 'Relief detail: Muses mid-gesture, from a Roman sarcophagus',
  },
  {
    numeral: 'III',
    title: 'Answer back',
    body: 'Ask about the page you’re on. Runic answers from the page’s own text, out loud.',
    relief: 'relief-3',
    alt: 'Relief detail: a Muse and a fallen Siren, from a Roman sarcophagus',
  },
];

const PRINCIPLES = [
  { lead: 'Acts before', rest: ' you finish.' },
  { lead: 'Reads the page,', rest: ' not pixels.' },
  { lead: 'No button.', rest: ' Just say Runic.' },
  { lead: 'Learns the sites you use.', soon: true },
];

const PHRASES = [
  'Runic, open YouTube and search for lofi beats',
  'play the second video',
  'skip the ad',
  'go to Amazon and search for noise cancelling headphones',
  'add it to my cart',
  'who made this video?',
  'go back',
];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const fadeBand = {
  maskImage: 'linear-gradient(to bottom, transparent 0, var(--bg) 40vh, var(--bg) calc(100% - 40vh), transparent 100%)',
};
// Quiet the veins under the text column so secondary text stays at AA on white marble.
const veinQuiet = { background: 'radial-gradient(60% 50% at 50% 50%, var(--light-bg) 55%, transparent 100%)' };

export default function Home() {
  return (
    <>
      <a href="#how" className="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-4 focus:z-50 focus:rounded-full focus:bg-text focus:px-4 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <Island />

      <main>
        {/* I · Hero */}
        <section id="top" data-tone="dark" aria-labelledby="top-title" className="relative overflow-hidden px-4 pb-24 sm:px-8 lg:px-16">
          <div aria-hidden="true" className="marble-white marble-hero" />
          <HeroBust />
          <div className="relative mx-auto flex max-w-[1120px] flex-col items-center text-center" style={{ paddingTop: 'calc(64px + 0.69 * min(78vw, 560px))' }}>
            <h1 id="top-title" className="t-headline">
              <TwoTone lead="The web," rest=" hands-free." />
            </h1>
            <p className="mt-8 max-w-[640px] text-fg-2">
              Say what you want. Runic reads the page and does it, before you finish your sentence.
            </p>
            <div className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
              <LaunchButton />
              <GlassPill href="#how">See how it works</GlassPill>
            </div>
            <p className="mt-6 text-[15px] text-fg-2">Opens the Runic app on this Mac.</p>
            <p className="mt-2 text-[15px] text-fg-2 motion-safe:hidden">Demo: “{DEMO.words.join(' ')}”</p>
            <p className="mt-2 text-[13px] text-fg-2 motion-reduce:hidden">Island demo timing is illustrative.</p>
          </div>
        </section>

        {/* II · How it works */}
        <Section id="how" numeral="II" label="How it works" className="pt-32 sm:pt-40">
          <div aria-hidden="true" className="marble-black inset-0 opacity-60" />
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="II" label="How it works" />
            <h2 id="how-title" className="t-headline">
              <TwoTone lead="Talk naturally." rest=" Runic keeps up." />
            </h2>
          </div>
          <div className="relative">
            <HowItWorks steps={STEPS} />
          </div>
        </Section>

        {/* III · Principles, on white marble */}
        <Section id="why" tone="light" numeral="III" label="Principles" className="py-[40vh]">
          <div aria-hidden="true" className="marble-white inset-0" style={fadeBand} />
          <div aria-hidden="true" className="absolute inset-0" style={veinQuiet} />
          <div className="relative mx-auto max-w-[1120px] text-center">
            <Marker numeral="III" label="Principles" />
            <h2 id="why-title" className="sr-only">Principles</h2>
            <ul>
              {PRINCIPLES.map((p) => (
                <StatementSection key={p.lead} {...p} />
              ))}
            </ul>
          </div>
        </Section>

        {/* IV · What you can say */}
        <Section id="say" numeral="IV" label="What you can say" className="py-32 sm:py-40">
          <div className="relative mx-auto max-w-[760px]">
            <div className="text-center">
              <Picture
                name="hand"
                widths={[640, 1200]}
                width={1200}
                height={867}
                alt="Roman marble hand holding a scroll, 1st or 2nd century CE"
                sizes="min(90vw, 560px)"
                className="mx-auto h-auto w-full max-w-[560px]"
              />
              <Marker numeral="IV" label="What you can say" />
              <h2 id="say-title" className="t-headline">
                <TwoTone lead="Just say it." rest=" Like you would." />
              </h2>
            </div>
            <ul className="mt-16 border-t border-line">
              {PHRASES.map((p, i) => (
                <ListRow key={p} numeral={NUMERALS[i]}>
                  “{p}”
                </ListRow>
              ))}
            </ul>
          </div>
        </Section>

        {/* V · Privacy */}
        <Section id="privacy" numeral="V" label="Privacy" className="py-32 sm:py-40">
          <div className="relative mx-auto max-w-[760px] text-center">
            <Picture
              name="drapery"
              widths={[640, 1000]}
              width={1000}
              height={955}
              alt="Folds of a marble toga, from a Roman statue of a member of the imperial family"
              sizes="min(80vw, 480px)"
              className="mx-auto h-auto w-full max-w-[480px]"
            />
            <Marker numeral="V" label="Privacy" />
            <h2 id="privacy-title" className="t-headline">
              <TwoTone lead="No account." rest=" No Runic servers." />
            </h2>
            <p className="mx-auto mt-8 max-w-[640px] text-fg-2">
              Your voice streams to Deepgram to be transcribed. Page text, and a screenshot when it gets stuck, goes to Groq to
              choose the next step. That’s all that leaves your computer. Pause the mic anytime.
            </p>
          </div>
        </Section>

        {/* VI · Launch */}
        <Section id="launch" numeral="VI" label="Launch" className="overflow-hidden pt-32 pb-72 sm:pt-40 sm:pb-96">
          <div aria-hidden="true" className="marble-white marble-launch" />
          <div className="relative mx-auto flex max-w-[760px] flex-col items-center text-center">
            <Marker numeral="VI" label="Launch" />
            <h2 id="launch-title" className="t-headline">
              <TwoTone lead="Just say" rest=" what you want." />
            </h2>
            <div className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto">
              <LaunchButton />
              <p className="text-[15px] text-fg-2">Opens the Runic app on this Mac.</p>
            </div>
            <div className="glass mt-12 w-full max-w-[480px] rounded-[var(--radius-panel)] p-8 text-left">
              <p className="text-[21px] font-semibold text-fg">Don’t have Runic yet?</p>
              <p className="mt-2 text-fg-2">Get the source on GitHub and run it on Mac, Windows or Linux.</p>
              <a
                href="https://github.com/unixers/runic"
                className="mt-6 inline-flex h-10 items-center rounded-full bg-text px-4 text-[15px] font-semibold text-bg"
              >
                Get Runic on GitHub
              </a>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
