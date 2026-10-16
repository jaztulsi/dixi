import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Marker } from '@/components/Section';

export const metadata: Metadata = {
  title: 'Credits · Runic',
  description: 'Image and texture credits for the Runic website.',
};

// Every image on the site, with its license. Verified via each source's API (Met: isPublicDomain = true).
const MET = [
  { id: 248118, title: 'Marble portrait bust of a man', date: 'mid–3rd century CE', use: 'Hero' },
  { id: 248205, title: 'Marble sarcophagus with the contest between the Muses and the Sirens', date: '3rd quarter of 3rd century CE', use: 'How it works reliefs' },
  { id: 251036, title: 'Marble left hand holding a scroll', date: '1st or 2nd century CE', use: 'What you can say' },
  { id: 257641, title: 'Marble statue of a member of the imperial family', date: '27 BCE–68 CE', use: 'Privacy' },
];
const TEXTURES = [
  { id: 'Marble019', use: 'White marble' },
  { id: 'Marble016', use: 'Black marble' },
];

export default function Credits() {
  return (
    <>
      <main data-tone="dark" className="px-4 pt-32 pb-32 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-[760px]">
          <Marker numeral="VII" label="Credits" />
          <h1 className="t-headline">
            <span className="text-fg">Credits.</span>
          </h1>
          <p className="mt-8 text-fg-2">
            Sculpture photographs are from The Metropolitan Museum of Art’s Open Access program, released under Creative
            Commons Zero (CC0). Marble textures are from ambientCG, also CC0. All images were converted to grayscale and
            recropped for this site.
          </p>

          <h2 className="mt-16 text-[28px] font-bold tracking-[-0.035em] text-fg">The Metropolitan Museum of Art</h2>
          <ul className="mt-6 border-t border-line">
            {MET.map((m) => (
              <li key={m.id} className="border-b border-line py-6">
                <a href={`https://www.metmuseum.org/art/collection/search/${m.id}`} className="text-fg underline underline-offset-4">
                  {m.title}
                </a>
                <p className="mt-1 text-[15px] text-fg-2">
                  {m.date} · Object {m.id} · CC0 · Used in: {m.use}
                </p>
              </li>
            ))}
          </ul>

          <h2 className="mt-16 text-[28px] font-bold tracking-[-0.035em] text-fg">ambientCG</h2>
          <ul className="mt-6 border-t border-line">
            {TEXTURES.map((t) => (
              <li key={t.id} className="border-b border-line py-6">
                <a href={`https://ambientcg.com/view?id=${t.id}`} className="text-fg underline underline-offset-4">
                  {t.id}
                </a>
                <p className="mt-1 text-[15px] text-fg-2">CC0 · Used in: {t.use}</p>
              </li>
            ))}
          </ul>

          <p className="mt-16 text-[15px] text-fg-2">Grain texture generated for this site.</p>
          <p className="mt-8">
            <a href="/" className="text-fg underline underline-offset-4">
              Back to Runic
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
