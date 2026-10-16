import { Picture } from '@/components/Picture';
import { cn } from '@/lib/utils';

export type Step = { numeral: string; title: string; body: string; relief: string; alt: string };

/** One How-it-works step: a third of the Muses frieze plus a glass caption panel. */
export function ReliefStep({ step, glass = true, className }: { step: Step; glass?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-6 lg:flex-row lg:gap-8', className)}>
      <Picture
        name={step.relief}
        widths={[560, 1000]}
        width={1000}
        height={781}
        alt={step.alt}
        sizes="(min-width: 1024px) 480px, min(90vw, 480px)"
        className="h-auto w-full max-w-[480px] rounded-[var(--radius-panel)] lg:w-[480px]"
      />
      <div className={cn('w-full max-w-[400px] rounded-[var(--radius-panel)] p-8 text-left', glass ? 'glass' : 'bg-surface-1')}>
        <p className="t-label mb-4">
          {step.numeral}
        </p>
        <h3 className="text-[32px] leading-none font-bold tracking-[-0.035em] text-fg">{step.title}</h3>
        <p className="mt-4 text-fg-2">{step.body}</p>
      </div>
    </div>
  );
}
