export function Footer() {
  return (
    <footer data-tone="dark" className="border-t border-line px-4 py-12 sm:px-8 lg:px-16">
      <div className="mx-auto flex max-w-[1120px] flex-col items-center justify-between gap-6 text-[15px] text-fg-2 sm:flex-row">
        <a href="/" className="text-fg font-semibold">
          Runic
        </a>
        <nav aria-label="Footer" className="flex gap-6">
          <a href="/credits/">Credits</a>
          <a href="https://github.com/unixers/runic">GitHub</a>
          <span>© 2026 Runic</span>
        </nav>
      </div>
    </footer>
  );
}
