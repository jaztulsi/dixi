'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Check } from '@/components/DemoWindow';
import { ListRow } from '@/components/ListRow';
import { cn } from '@/lib/utils';
import { useReduced } from '@/lib/useReduced';

export type UseCase = { kind: string; say: string; result: string };

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const VISIBLE = 3; // cards drawn in the stack; the rest wait behind

/** Use cases on a deck of glass cards that shuffles itself, the way Dixi moves from one task to the next.
 *  Screen readers and reduced motion get the plain list instead. */
export function ShuffleDeck({ cases }: { cases: UseCase[] }) {
  const reduced = useReduced();
  const [top, setTop] = useState(0);

  // Shuffles nonstop, hover or not.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTop((t) => (t + 1) % cases.length), 1500);
    return () => clearInterval(id);
  }, [reduced, cases.length]);

  const list = (
    <ul className="glass rounded-[var(--radius-panel)] px-6 sm:px-8">
      {cases.map((c, i) => (
        <ListRow key={c.say} numeral={NUMERALS[i]}>
          “{c.say}”
        </ListRow>
      ))}
    </ul>
  );

  if (reduced) return list;

  return (
    <>
      <div className="sr-only">{list}</div>
      <div aria-hidden="true" className="relative mx-auto h-[312px] w-full max-w-[560px]">
        {cases.map((c, i) => {
          const depth = (i - top + cases.length) % cases.length;
          const leaving = depth === cases.length - 1; // just shuffled from the top to the back
          const shown = depth < VISIBLE || leaving;
          return (
            <motion.div
              key={c.say}
              // Only the top card is glass: one blur layer, not six.
              className={cn(
                'absolute inset-x-0 top-0 h-[264px] rounded-[var(--radius-panel)] p-6 sm:p-8',
                depth === 0 ? 'glass' : 'border border-line bg-paper',
              )}
              initial={false}
              animate={
                leaving
                  ? { x: ['0%', '70%', '0%'], rotate: [0, 8, 0], y: [0, 0, 32], scale: [1, 1, 0.9], opacity: [1, 1, 0], zIndex: [cases.length, cases.length, 0] }
                  : { x: '0%', rotate: 0, y: depth * 16, scale: 1 - depth * 0.05, opacity: shown ? 1 - depth * 0.3 : 0, zIndex: cases.length - depth }
              }
              transition={leaving ? { duration: 0.55, times: [0, 0.45, 1], ease: 'easeInOut' } : { type: 'spring', stiffness: 380, damping: 32 }}
            >
              <div className={cn('flex h-full flex-col transition-opacity duration-200', depth === 0 || leaving ? 'opacity-100' : 'opacity-0')}>
              <p className="t-label">{c.kind}</p>
              <p className="mt-4 text-[26px] leading-tight font-bold tracking-[-0.02em] text-fg sm:text-[32px]">“{c.say}”</p>
              <p className="mt-auto flex items-center gap-3 text-[17px] text-fg-2">
                <Check />
                {c.result}
              </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
