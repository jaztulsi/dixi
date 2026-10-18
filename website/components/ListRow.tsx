/** A phrase you can say, with a Roman numeral in the gutter and a hairline below. */
export function ListRow({ numeral, children }: { numeral: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[40px_1fr] items-baseline gap-4 border-b border-line py-6 last:border-b-0 sm:grid-cols-[64px_1fr] sm:gap-6">
      <span className="font-roman text-[12px] tracking-[.16em] text-fg-2" aria-hidden="true">
        {numeral}
      </span>
      <span className="text-fg">{children}</span>
    </li>
  );
}
