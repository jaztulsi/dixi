'use client';

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Mark } from '@/components/Mark';
import { DEMO } from '@/lib/demo';
import { useStage } from '@/lib/stage';
import { cn } from '@/lib/utils';

type View = 'idle' | 'listening' | 'acting' | 'answer' | 'done' | 'section' | 'menu';
type Demo = { phase: 'idle' | 'listening' | 'acting' | 'done'; word: number; final: boolean };

const SHAPE: Record<View, { width: string; height: string | number; radius: number }> = {
  idle: { width: '148px', height: 40, radius: 20 },
  listening: { width: '220px', height: 44, radius: 22 },
  acting: { width: 'min(420px, calc(100vw - 32px))', height: 'auto', radius: 28 },
  answer: { width: 'min(420px, calc(100vw - 32px))', height: 'auto', radius: 28 },
  done: { width: '260px', height: 44, radius: 22 },
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
  { href: '#why', label: 'Why' },
  { href: '#how', label: 'How it works' },
];

/** The navbar and the demo in one: a Dynamic-Island pill that morphs between states. */
export function Island() {
  const reduced = useReducedMotion();
  const stage = useStage();
  const [menu, setMenu] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo>({ phase: 'idle', word: 0, final: false });
  const [announce, setAnnounce] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  // Hero visibility gates the demo loop.
  useEffect(() => {
    const hero = document.getElementById('top');
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

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

  // Hero demo loop. Fixed, illustrative cadence (DEMO.*Ms), never a measured claim.
  const running = heroVisible && !menu && !reduced && !stage;
  useEffect(() => {
    if (!running) {
      setDemo({ phase: 'idle', word: 0, final: false });
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    const at = (ms: number, d: Demo) => timers.push(setTimeout(() => setDemo(d), (t += ms)));
    const loop = () => {
      t = 0;
      at(DEMO.idleMs, { phase: 'listening', word: 0, final: false });
      at(DEMO.listenMs, { phase: 'acting', word: 1, final: false });
      for (let w = 2; w <= DEMO.words.length; w++) at(DEMO.wordMs, { phase: 'acting', word: w, final: false });
      at(DEMO.wordMs * 2, { phase: 'acting', word: DEMO.words.length, final: true });
      at(DEMO.doneMs, { phase: 'done', word: DEMO.words.length, final: true });
      timers.push(setTimeout(loop, (t += DEMO.doneMs)));
    };
    loop();
    return () => timers.forEach(clearTimeout);
  }, [running]);

  // Announce the finished command once, not every word or every loop.
  useEffect(() => {
    if (demo.phase === 'done' && !announce) {
      setAnnounce(`Demo: “${DEMO.words.join(' ')}” ${DEMO.actions.map((a) => a.text).join('. ')}.`);
    }
  }, [demo.phase, announce]);

  // Menu: focus the first link, Escape or a click outside closes and returns focus.
  // Focus moves after the re-render, once the closed island's button exists again.
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!menu) {
      if (restoreFocus.current) toggle.current?.focus();
      restoreFocus.current = false;
      return;
    }
    firstLink.current?.focus();
    const close = () => {
      restoreFocus.current = true;
      setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menu]);

  const view: View = menu
    ? 'menu'
    : flash
      ? 'section'
      : stage === 'speak'
        ? 'listening'
        : stage === 'act'
          ? 'acting'
          : stage === 'answer'
            ? 'answer'
            : demo.phase;

  // In the How-it-works stage the transcript is shown whole; in the hero it streams.
  const shown = stage === 'act' ? { word: DEMO.words.length, final: true } : demo;
  const shape = SHAPE[view];

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
                className="flex h-10 items-center gap-2 rounded-full px-3 text-[15px] font-semibold"
              >
                <Mark />
                Runic
                <span className="ml-auto text-[13px] font-normal text-[var(--text-2)]">Close</span>
              </button>
              <ul id="island-menu" className="mt-1 flex flex-col">
                {LINKS.map((l, i) => (
                  <li key={l.href}>
                    <a
                      ref={i === 0 ? firstLink : undefined}
                      href={l.href}
                      onClick={() => setMenu(false)}
                      className="flex h-12 items-center rounded-full px-3 text-[17px]"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
                <li className="p-1">
                  <a
                    href="runic://open"
                    onClick={() => setMenu(false)}
                    className="flex h-12 items-center justify-center rounded-full bg-text text-[17px] font-semibold text-bg"
                  >
                    Launch Runic
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
              aria-label="Open menu"
              onClick={() => setMenu(true)}
              className={cn('flex size-full', view === 'acting' || view === 'answer' ? 'items-start' : 'items-center justify-center')}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={view} {...SWAP} className="flex size-full">
                  <Content view={view} flash={flash} shown={shown} />
                </motion.span>
              </AnimatePresence>
            </button>
          )}
        </motion.div>
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>
      </nav>
    </MotionConfig>
  );
}

function Content({ view, flash, shown }: { view: View; flash: string | null; shown: { word: number; final: boolean } }) {
  switch (view) {
    case 'listening':
      return (
        <span className="flex w-full items-center gap-3 px-4 text-[15px]">
          <span className="size-2 rounded-full bg-rec" aria-hidden="true" />
          <span className="text-[var(--text-2)]">Listening</span>
          <Mark live className="ml-auto" />
        </span>
      );
    case 'acting':
      return (
        <span className="flex w-full flex-col gap-3 p-4 text-left">
          <span className="text-[17px] leading-snug">
            {DEMO.words.slice(0, shown.word).map((w, i) => (
              <span key={i} className={i === shown.word - 1 && !shown.final ? 'text-[var(--text-2)]' : 'text-text'}>
                {w}{' '}
              </span>
            ))}
          </span>
          {DEMO.actions
            .filter((a) => shown.final || shown.word > a.afterWord + 1)
            .map((a) => (
              <span key={a.text} className="flex items-center gap-2 text-[15px] text-[var(--text-2)]">
                <Check />
                {a.text}
              </span>
            ))}
        </span>
      );
    case 'answer':
      return (
        <span className="flex w-full flex-col gap-3 p-4 text-left">
          <span className="text-[17px] leading-snug text-text">who made this video?</span>
          <span className="flex items-center gap-2 text-[15px] text-[var(--text-2)]">
            <Speaker />
            Answering from the page, out loud
          </span>
        </span>
      );
    case 'done':
      return (
        <span className="flex w-full items-center justify-center gap-2 px-4 text-[15px]">
          <Check />
          Results ready
        </span>
      );
    case 'section':
      return <span className="flex items-center px-5 font-roman text-[12px] tracking-[.16em] uppercase whitespace-nowrap">{flash}</span>;
    default:
      return (
        <span className="flex w-full items-center justify-center gap-2 text-[15px] font-semibold">
          <Mark live />
          Runic
        </span>
      );
  }
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-done" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="m6 10.5 2.6 2.5L14 7.5" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Speaker() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
      <path d="M4 8h3l4-3v10l-4-3H4z" fill="currentColor" />
      <path d="M14 7.5a3.5 3.5 0 0 1 0 5M16 5.5a6.5 6.5 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
