import { cn } from '@/lib/utils';

/** A page section: sets the text tone for its marble zone and carries the Roman-numeral marker
 *  the island reads ("II · How it works"). */
export function Section({
  id, tone = 'light', numeral, label, children, className,
}: {
  id: string;
  tone?: 'dark' | 'light';
  numeral: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-tone={tone}
      data-marker={`${numeral} · ${label}`}
      aria-labelledby={`${id}-title`}
      className={cn('relative px-4 sm:px-8 lg:px-16', className)}
    >
      {children}
    </section>
  );
}

/** Cinzel marker above a section title. */
export function Marker({ numeral, label }: { numeral: string; label: string }) {
  return (
    <p className="t-label mb-6">
      <span aria-hidden="true">{numeral} · </span>
      {label}
    </p>
  );
}

/** Two-tone title: first phrase in the primary tone, the rest secondary. */
export function TwoTone({ lead, rest }: { lead: string; rest?: string }) {
  return (
    <>
      <span className="text-fg">{lead}</span>
      {rest ? <span className="text-fg-2">{rest}</span> : null}
    </>
  );
}
