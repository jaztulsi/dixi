/** AVIF with WebP fallback from public/img/<name>-<width>.<ext>. width/height reserve space (no layout shift). */
export function Picture({
  name, widths, width, height, alt, sizes, priority = false, className, style,
}: {
  name: string;
  widths: number[];
  width: number;
  height: number;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const set = (ext: string) => widths.map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <img
        src={`/img/${name}-${widths[widths.length - 1]}.webp`}
        srcSet={set('webp')}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={className}
        style={style}
      />
    </picture>
  );
}
