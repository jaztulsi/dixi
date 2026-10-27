'use client';

import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Check } from '@/components/DemoWindow';
import { MascotSprite } from '@/components/MascotSprite';
import { stepsDone, useDemo } from '@/lib/demo';
import { cn } from '@/lib/utils';

type View = 'idle' | 'listening' | 'acting' | 'done' | 'section' | 'menu';

const SHAPE: Record<View, { width: string; height: string | number; radius: number }> = {
  idle: { width: '148px', height: 40, radius: 20 },
  listening: { width: '220px', height: 44, radius: 22 },
  acting: { width: 'min(360px, calc(100vw - 32px))', height: 44, radius: 22 },
  done: { width: '220px', height: 44, radius: 22 },
  section: { width: 'auto', height: 40, radius: 20 },
  menu: { width: 'min(300px, calc(100vw - 32px))', height: 'auto', radius: 28 },
};

const SPRING = { type: 'spring', stiffness: 400, damping: 32 } as const;
const SWAP = {
  initial: { opacity: 0, scale: 0.95, filter: 'blur(8px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.95, filter: 'blur(8px)' },
  transition: { duration: 0.22 },
};

const LINKS = [
  { href: '#say', label: 'What you can say' },
  { href: '#how', label: 'How it works' },
];

/** The navbar and the brand in one: a black Dynamic-Island pill that mirrors the hero demo,
 *  names the section you scroll into, and opens the menu. */
export function Island() {
  const demo = useDemo();
  const [menu, setMenu] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const restoreFocus = useRef(false);

  // Briefly show the section you scrolled into ("II · How it works").
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          setFlash((e.target as HTMLElement).dataset.marker ?? null);
          clearTimeout(timer);
          timer = setTimeout(() => setFlash(null), 1600);
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    document.querySelectorAll('[data-marker]').forEach((s) => io.observe(s));
    return () => (io.disconnect(), clearTimeout(timer));
  }, []);

  // Menu: focus the first link; Escape or a click outside closes. Focus returns after the re-render.
  useEffect(() => {
    if (!menu) {
      if (restoreFocus.current) toggle.current?.focus();
      restoreFocus.current = false;
      return;
    }
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      restoreFocus.current = true;
      setMenu(false);
    };
    const onDown = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menu]);

  const view: View = menu ? 'menu' : flash ? 'section' : demo.phase;
  const shape = SHAPE[view];
  const steps = stepsDone(demo);

  return (
    <MotionConfig reducedMotion="user">
      <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
        <motion.div
          ref={root}
          layout
          transition={SPRING}
          style={{ width: shape.width, height: shape.height, borderRadius: shape.radius }}
          className="pointer-events-auto overflow-hidden bg-bg text-text ring-1 ring-[var(--island-ring)]"
        >
          {view === 'menu' ? (
            <div className="flex flex-col p-2">
              <button
                ref={toggle}
                type="button"
                aria-expanded="true"
                aria-controls="island-menu"
                onClick={() => ((restoreFocus.current = true), setMenu(false))}
                className="flex h-10 items-center gap-2 rounded-full px-3 text-[15px] font-bold"
              >
                <MascotSprite pose="neutral" height={28} eager />
                Dixi
                <span className="ml-auto text-[13px] font-normal text-text-2">Close</span>
              </button>
              <ul id="island-menu" className="mt-1 flex flex-col">
                {LINKS.map((l, i) => (
                  <li key={l.href}>
                    <a ref={i === 0 ? firstLink : undefined} href={l.href} onClick={() => setMenu(false)} className="flex h-12 items-center rounded-full px-3 text-[17px]">
                      {l.label}
                    </a>
                  </li>
                ))}
                <li className="p-1">
                  <a href="#waitlist" onClick={() => setMenu(false)} className="flex h-12 items-center justify-center rounded-full bg-text text-[17px] font-semibold text-bg">
                    Join the waitlist
                  </a>
                </li>
              </ul>
            </div>
          ) : (
            <button
              ref={toggle}
              type="button"
              aria-expanded="false"
              aria-controls="island-menu"
              onClick={() => setMenu(true)}
              className="flex size-full items-center justify-center"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={view} {...SWAP} className={cn('flex size-full items-center gap-2 px-4 text-[15px] whitespace-nowrap', view !== 'acting' && 'justify-center')}>
                  {view === 'listening' ? (
                    <>
                      <span className="size-2 rounded-full bg-rec" aria-hidden="true" />
                      <MascotSprite pose="curious" height={30} eager />
                      <span className="font-bold">Dixi</span>
                      <span className="text-text-2">is listening</span>
                    </>
                  ) : view === 'acting' ? (
                    <>
                      <MascotSprite pose="happy" height={30} eager />
                      <span className="font-bold">Dixi</span>
                      <span className="truncate text-text-2">{steps.length ? steps[steps.length - 1].text : 'is on it'}</span>
                    </>
                  ) : view === 'done' ? (
                    <>
                      <MascotSprite pose="nod" height={30} eager />
                      <span className="font-bold">Dixi</span>
                      <span className="text-text-2">did it</span>
                      <Check />
                    </>
                  ) : view === 'section' ? (
                    <span className="font-roman text-[12px] tracking-[.16em] uppercase">{flash}</span>
                  ) : (
                    <>
                      <MascotSprite pose="neutral" height={30} eager />
                      <span className="text-[17px] font-bold tracking-[-0.02em]">Dixi</span>
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
              <span className="sr-only">, open menu</span>
            </button>
          )}
        </motion.div>
      </nav>
    </MotionConfig>
  );
}
