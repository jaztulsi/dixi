'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { MascotSprite, type Pose } from '@/components/MascotSprite';
import { SCRIPTS, stepsDone, useDemo, useDemoRunner, type DemoState } from '@/lib/demo';
import { useReduced } from '@/lib/useReduced';

const STATIC: DemoState = { phase: 'done', script: 0, word: SCRIPTS[0].words.length, final: true };

/** The hero's explainer: a dark liquid-glass window that hears a sentence and acts on it mid-sentence. */
export function DemoWindow() {
  const reduced = useReduced();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);

  useDemoRunner(visible && !reduced);
  const live = useDemo();
  const s = reduced ? STATIC : live.phase === 'idle' ? { ...live, phase: 'listening' as const } : live;
  const script = SCRIPTS[s.script];
  const done = stepsDone(s);
  const url = done.length ? done[done.length - 1].url : 'about:blank';

  return (
    <div ref={box} className="relative mx-auto w-full max-w-[720px]">
      <PeekMascot s={s} hidden={!visible && !reduced} />
      <div
        data-tone="dark"
        className="glass-dark relative z-10 min-h-[300px] rounded-[var(--radius-panel)] p-6 text-left sm:min-h-[320px] sm:p-8"
        role="img"
        aria-label={`Demo: someone says “${SCRIPTS[0].words.join(' ')}” and Dixi opens Apple Music and starts playing while they are still talking.`}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3 text-[15px] text-fg">
            <Wave on={s.phase !== 'done'} />
            {s.phase === 'done' ? 'Done' : 'Listening to you'}
          </span>
          <span className="glass max-w-[55%] truncate rounded-full px-4 py-2 text-[13px] text-fg">{url}</span>
        </div>

        <p className="mt-8 text-[28px] leading-tight font-bold tracking-[-0.02em] sm:text-[36px]">
          {script.words.slice(0, s.word).map((w, i) => (
            <span key={i} className={i === s.word - 1 && !s.final ? 'text-fg-2' : 'text-fg'}>
              {w}{' '}
            </span>
          ))}
          {s.phase !== 'done' ? <span className="caret ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.12em] rounded-full bg-text" /> : null}
        </p>

        <p className="absolute right-6 bottom-4 text-[13px] text-fg-2 sm:right-8">Illustrative timing</p>
        <ul className="mt-6 flex flex-col gap-3 pb-6">
          {done.map((st) => (
            <li key={st.text} className="flex items-center gap-3 text-[17px] text-fg-2">
              <Check />
              {st.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Hides behind the window's top edge and pops up to react: curious while it listens, happy when a step
 *  lands, a nod when it's done. It ducks back down between sentences. */
function PeekMascot({ s, hidden }: { s: DemoState; hidden: boolean }) {
  const pose: Pose = s.phase === 'done' ? 'nod' : stepsDone(s).length ? 'happy' : 'curious';
  const y = hidden ? '100%' : s.phase === 'listening' ? '45%' : s.phase === 'idle' ? '100%' : '8%';
  return (
    <div className="pointer-events-none absolute right-6 bottom-[calc(100%-48px)] h-[136px] w-[120px] sm:right-12">
      <motion.div className="mascot-shadow relative size-full" animate={{ y }} transition={{ type: 'spring', stiffness: 320, damping: 18 }}>
        {(['curious', 'happy', 'nod'] as Pose[]).map((p) => (
          <MascotSprite
            key={p}
            pose={p}
            height={136}
            low
            className="absolute bottom-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2 transition-opacity duration-200"
            style={{ opacity: p === pose ? 1 : 0 }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function Wave({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 text-rec" aria-hidden="true">
      {[3, 7, 11, 15].map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 3 : 6} width="2.5" height={i % 2 ? 14 : 8} rx="1.25" fill="currentColor" className={on ? 'wave-bar' : undefined} style={{ animationDelay: `${i * 110}ms` }} />
      ))}
    </svg>
  );
}

export function Check() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-done" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="m6 10.5 2.6 2.5L14 7.5" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
