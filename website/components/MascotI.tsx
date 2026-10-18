'use client';

import { motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { MascotSprite, type Pose } from '@/components/MascotSprite';
import meta from '@/lib/mascot-sizes.json';
import { useReduced } from '@/lib/useReduced';

const [FW, FH] = meta.face;
const MOODS: Pose[] = ['happy', 'curious', 'sleep', 'nod'];

/** The last "i" of the wordmark: the marble mascot, alive.
 *  - Its eyes follow your cursor (drawn live over a render whose painted eyes were removed), and blink.
 *  - The head tilts toward you in 3D; far to either side it turns to its three-quarter view.
 *  - Leave the mouse alone (or use touch) and it glances around on its own, then dozes off.
 *  - Its face matches what you point at: any element with data-mood="happy|curious|…". Click and it nods. */
export function MascotI() {
  const reduced = useReduced();
  const box = useRef<HTMLSpanElement>(null);
  const [turn, setTurn] = useState<0 | -1 | 1>(0); // -1 = three-quarter left, 1 = mirrored right
  const [mood, setMood] = useState<Pose | null>(null);
  const spring = { stiffness: 180, damping: 18 };
  const lookX = useSpring(0, spring); // -1..1
  const lookY = useSpring(0, spring);
  const rotY = useTransform(lookX, (v) => v * 16);
  const rotX = useTransform(lookY, (v) => -v * 10);

  useEffect(() => {
    let last = 0;
    let sleepTimer: ReturnType<typeof setTimeout>;
    let moodTimer: ReturnType<typeof setTimeout>;
    const look = (nx: number, ny: number) => {
      lookX.set(nx);
      lookY.set(ny);
      setTurn(nx < -0.7 ? -1 : nx > 0.7 ? 1 : 0);
    };
    const doze = () => {
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => setMood('sleep'), 12000);
    };
    // Idle glances: a new random look every couple of seconds when the cursor isn't driving.
    const glance = setInterval(() => {
      if (Date.now() - last < 2500) return;
      look(Math.random() * 1.2 - 0.6, Math.random() * 0.9 - 0.45);
    }, 1800);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !box.current) return;
      last = Date.now();
      const r = box.current.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 520));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.4)) / 420));
      look(nx, ny);
      const target = (e.target as Element).closest?.('[data-mood]') as HTMLElement | null;
      setMood((m) => (target ? (target.dataset.mood as Pose) : m === 'nod' ? m : null));
      doze();
    };
    const onDown = () => {
      setMood('nod');
      clearTimeout(moodTimer);
      moodTimer = setTimeout(() => setMood(null), 900);
      doze();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    doze();
    return () => {
      clearInterval(glance);
      clearTimeout(sleepTimer);
      clearTimeout(moodTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [lookX, lookY]);

  const showFace = !mood && turn === 0;

  return (
    <span ref={box} className="relative ml-[0.02em] inline-block h-[0.86em] w-[0.62em] align-baseline [perspective:600px]">
      <motion.span className="mascot-shadow absolute inset-0" style={reduced ? undefined : { rotateY: rotY, rotateX: rotX }}>
        {/* Face with live eyes */}
        <span className="absolute bottom-0 left-1/2 h-full -translate-x-1/2 transition-opacity duration-200" style={{ aspectRatio: `${FW} / ${FH}`, opacity: showFace ? 1 : 0 }}>
          <MascotSprite pose="face" height={640} eager className="absolute inset-0 h-full w-full" />
          <Eyes lookX={lookX} lookY={lookY} still={reduced} />
        </span>
        {/* Turned views (mirrored for the right) and moods, cross-faded on opacity: no waiting on downloads */}
        {[false, true].map((flip) => (
          <MascotSprite
            key={'tq' + flip}
            pose="three-quarter"
            height={460}
            eager
            low
            className="absolute bottom-0 left-1/2 h-[96%] w-auto max-w-none transition-opacity duration-200"
            style={{ transform: `translateX(-50%)${flip ? ' scaleX(-1)' : ''}`, opacity: !mood && turn === (flip ? 1 : -1) ? 1 : 0 }}
          />
        ))}
        {MOODS.map((p) => (
          <MascotSprite
            key={p}
            pose={p}
            height={460}
            eager
            low
            // Bust-only poses: smaller box so the head stays the same size as the full-body face.
            className="absolute bottom-0 left-1/2 h-[74%] w-auto max-w-none -translate-x-1/2 transition-opacity duration-200"
            style={{ opacity: mood === p ? 1 : 0 }}
          />
        ))}
      </motion.span>
    </span>
  );
}

/** Two glossy marble-statue eyes, placed where the render's painted eyes were. */
function Eyes({ lookX, lookY, still }: { lookX: MotionValue<number>; lookY: MotionValue<number>; still: boolean }) {
  // Eyes travel ~30% of their radius inside the socket; highlights lag a little (they're reflections).
  const ex = useTransform(lookX, (v) => (still ? 0 : v * 0.3));
  const ey = useTransform(lookY, (v) => (still ? 0 : v * 0.3));
  return (
    <svg viewBox={`0 0 ${FW} ${FH}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <radialGradient id="eye-gloss" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="var(--surface-2)" />
          <stop offset="55%" stopColor="var(--bg)" />
        </radialGradient>
      </defs>
      {meta.eyes.map((e, i) => (
        <Eye key={i} e={e} ex={ex} ey={ey} delay={i * 40} />
      ))}
    </svg>
  );
}

function Eye({ e, ex, ey, delay }: { e: (typeof meta.eyes)[number]; ex: MotionValue<number>; ey: MotionValue<number>; delay: number }) {
  const cx = e.cx * FW, cy = e.cy * FH, rx = e.rx * FW * 0.92, ry = e.ry * FH * 0.98;
  const x = useTransform(ex, (v) => v * rx);
  const y = useTransform(ey, (v) => v * ry);
  const hx = useTransform(ex, (v) => -v * rx * 0.35);
  const hy = useTransform(ey, (v) => -v * ry * 0.35);
  return (
    <g className="mascot-eyes" style={{ animationDelay: `${delay}ms` }}>
      <motion.g style={{ x, y }}>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#eye-gloss)" />
        <motion.g style={{ x: hx, y: hy }}>
          <ellipse cx={cx + rx * 0.22} cy={cy - ry * 0.38} rx={rx * 0.24} ry={ry * 0.22} fill="var(--text)" />
          <circle cx={cx - rx * 0.3} cy={cy + ry * 0.35} r={rx * 0.09} fill="var(--text)" opacity="0.85" />
        </motion.g>
      </motion.g>
    </g>
  );
}
