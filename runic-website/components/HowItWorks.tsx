'use client';

import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ReliefStep, type Step } from '@/components/ReliefStep';
import { setStage, type Stage } from '@/lib/stage';

const STAGES: Stage[] = ['speak', 'act', 'answer'];

/** Pinned scroll sequence: a 300vh track with a sticky stage. Scroll picks the step; the island performs it.
 *  Reduced motion gets the three steps stacked, nothing pinned. */
export function HowItWorks({ steps }: { steps: Step[] }) {
  const reduced = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const i = Math.min(2, Math.max(0, Math.floor(p * 3)));
    setActive(i);
    setStage(p > 0 && p < 1 ? STAGES[i] : null);
  });
  useEffect(() => () => setStage(null), []);

  if (reduced) {
    return (
      <div className="mx-auto flex max-w-[1120px] flex-col gap-16 pb-32">
        {steps.map((s) => (
          <ReliefStep key={s.numeral} step={s} glass={false} />
        ))}
      </div>
    );
  }

  return (
    <div ref={track} className="relative h-[300svh]">
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center pt-24 pb-8">
        <div className="relative grid w-full max-w-[1120px] place-items-center">
          {/* All three share one grid cell and cross-fade on opacity, so the stage never changes height. */}
          {steps.map((s, i) => (
            <motion.div
              key={s.numeral}
              className="col-start-1 row-start-1"
              animate={{ opacity: i === active ? 1 : 0 }}
              transition={{ duration: 0.25 }}
              aria-hidden={i !== active}
              inert={i !== active}
            >
              <ReliefStep step={s} />
            </motion.div>
          ))}
        </div>
        <ol className="mt-8 flex gap-2" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.numeral} aria-current={i === active ? 'step' : undefined}>
              <span className="sr-only">{s.title}</span>
              <span
                aria-hidden="true"
                className="block h-1 w-8 origin-left rounded-full bg-text transition-opacity duration-300"
                style={{ opacity: i === active ? 1 : 0.3 }}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
