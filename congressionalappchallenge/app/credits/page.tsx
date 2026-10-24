import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Marker } from '@/components/Section';

export const metadata: Metadata = {
  title: 'Credits · Dixi',
  description: 'Texture and illustration credits for the Dixi website.',
};

// Every texture on the site, with its license (ambientCG releases all assets as CC0).
const TEXTURES = [
  { id: 'Marble019', use: 'White marble, the page background' },
  { id: 'Onyx013', use: 'Black marble stripes (inverted)' },
];

export default function Credits() {
  return (
    <>
      <main className="px-4 pt-32 pb-32 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-[760px]">
          <Marker numeral="V" label="Credits" />
          <h1 className="t-headline">
            <span className="text-fg">Credits.</span>
          </h1>
          <p className="mt-8 text-fg-2">
            Marble textures are from ambientCG, released under Creative Commons Zero (CC0). They were converted to grayscale and
            recolored for this site. The marble mascot renders are original Dixi artwork; the grain texture was generated for this site.
          </p>

          <h2 className="mt-16 text-[28px] font-bold tracking-[-0.035em] text-fg">ambientCG</h2>
          <ul className="mt-6 border-t border-line">
            {TEXTURES.map((t) => (
              <li key={t.id} className="border-b border-line py-6">
                <a href={`https://ambientcg.com/view?id=${t.id}`} className="text-fg underline underline-offset-4">
                  {t.id}
                </a>
                <p className="mt-1 text-[15px] text-fg-2">CC0 · {t.use}</p>
              </li>
            ))}
          </ul>

          <p className="mt-16">
            <a href="/" className="text-fg underline underline-offset-4">
              Back to Dixi
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
