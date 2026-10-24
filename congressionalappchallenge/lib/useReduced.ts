'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/** Reduced-motion preference, but false until mounted, so server and first client render match (no hydration error). */
export function useReduced() {
  const pref = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!pref;
}
