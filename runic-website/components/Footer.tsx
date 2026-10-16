import { MascotSprite } from '@/components/MascotSprite';

export function Footer() {
  return (
    <footer data-tone="dark" className="relative bg-bg px-4 py-12 sm:px-8 lg:px-16">
      {/* waving goodbye from the footer's edge */}
      <MascotSprite pose="wave" height={112} className="absolute -top-[92px] right-6 sm:right-16" />
      <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-6 text-[15px] text-fg-2 sm:flex-row">
        <a href="/" className="text-[28px] font-extrabold tracking-[-0.05em] text-fg">
          Dixi
        </a>
        <nav aria-label="Footer" className="flex gap-6">
          <a href="/credits/">Credits</a>
          <a href="https://github.com/unixers/runic">GitHub</a>
          <span>© 2026 Dixi</span>
        </nav>
      </div>
    </footer>
  );
}
