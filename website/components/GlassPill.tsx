import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Secondary action: a liquid-glass pill link. */
export function GlassPill({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Button asChild variant="glass" className={cn('w-full sm:w-auto', className)}>
      <a href={href}>{children}</a>
    </Button>
  );
}
