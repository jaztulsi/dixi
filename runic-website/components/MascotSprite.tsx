import sizes from '@/lib/mascot-sizes.json';
import { cn } from '@/lib/utils';

export type Pose = Exclude<keyof typeof sizes, 'eyes'>;

/** One pose of the marble mascot (cut from the renders by scripts/mascot.py). Decorative: alt="". */
export function MascotSprite({
  pose, height, className, style, eager = false, low = false,
}: {
  pose: Pose;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  eager?: boolean;
  /** Mounted but hidden until needed (other poses of a cross-fade): don't compete with the hero for bandwidth. */
  low?: boolean;
}) {
  const [w, h] = sizes[pose] as number[];
  return (
    <img
      src={`/mascot/${pose}.webp`}
      width={Math.round((w * height) / h)}
      height={height}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={low ? 'low' : 'auto'}
      decoding="async"
      className={cn('pointer-events-none select-none', className)}
      style={style}
    />
  );
}
