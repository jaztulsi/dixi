import { Footer } from '@/components/Footer';
import { MascotSprite } from '@/components/MascotSprite';

export default function NotFound() {
  return (
    <>
      <main className="flex min-h-svh flex-col items-center justify-center px-4 py-32 text-center">
        <MascotSprite pose="angry" height={200} eager className="mascot-shadow" />
        <h1 className="t-headline mt-8">
          <span className="text-fg">This page</span>
          <span className="text-fg-2"> crumbled.</span>
        </h1>
        <p className="mt-6 text-fg-2">Nothing here. Not even marble dust.</p>
        <a href="/" className="mt-10 inline-flex h-12 items-center rounded-full bg-fg px-6 text-[17px] font-semibold text-fg-inv">
          Back to Dixi
        </a>
      </main>
      <Footer />
    </>
  );
}
