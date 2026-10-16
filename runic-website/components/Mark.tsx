import { cn } from '@/lib/utils';

const BARS = [
  { x: 3, h: 6 },
  { x: 6.5, h: 11 },
  { x: 10, h: 7 },
  { x: 13.5, h: 13 },
  { x: 17, h: 5 },
];

/** The Runic mark: five voice bars. `live` breathes them (transform only). */
export function Mark({ live = false, className }: { live?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn('size-5', className)}>
      {BARS.map((b, i) => (
        <rect
          key={b.x}
          x={b.x - 1}
          y={10 - b.h / 2}
          width="2"
          height={b.h}
          rx="1"
          fill="currentColor"
          className={live ? 'island-bar' : undefined}
          style={live ? { animationDelay: `${i * 120}ms` } : undefined}
        />
      ))}
    </svg>
  );
}
