'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Scripted demo shared by the hero window and the island. Every command here was run in the Dixi app against the
 *  live Apple sites (2026-10-15): Apple Music plays 30-second previews without a sign-in, and "buy" stops at the
 *  product's buy page (options, bag and payment stay with you). Timing is a fixed, illustrative cadence. */
export const SCRIPTS = [
  {
    words: ['Dixi,', 'open', 'Apple', 'Music', 'and', 'search', 'for', 'lo', 'fi', 'beats'],
    steps: [
      { after: 4, url: 'music.apple.com', text: 'Opened Apple Music' },
      { after: 10, url: 'music.apple.com/us/search?term=lo+fi+beats', text: 'Searched “lo fi beats”' },
    ],
  },
  {
    words: ['play', 'the', 'first', 'song'],
    steps: [{ after: 4, url: 'music.apple.com/us/album', text: 'Playing a preview' }],
  },
  {
    words: ['Dixi,', 'search', 'for', 'Severance', 'on', 'Apple', 'TV'],
    steps: [{ after: 7, url: 'tv.apple.com/us/search?term=Severance', text: 'Found Severance on Apple TV' }],
  },
  {
    words: ['Dixi,', 'buy', 'AirPods', 'Pro'],
    steps: [{ after: 4, url: 'apple.com/shop/buy-airpods/airpods-pro-3', text: 'AirPods Pro buy page. Your call from here.' }],
  },
];

const T = { listen: 900, word: 280, settle: 500, done: 1500 };

export type DemoState = {
  phase: 'idle' | 'listening' | 'acting' | 'done';
  script: number;
  word: number; // words heard so far
  final: boolean; // last word is stable
};

const IDLE: DemoState = { phase: 'idle', script: 0, word: 0, final: false };
let state = IDLE;
const subs = new Set<() => void>();
const set = (s: DemoState) => ((state = s), subs.forEach((f) => f()));

export function useDemo(): DemoState {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
    () => IDLE,
  );
}

/** Drives the loop while `active`. Exactly one component (the hero window) runs it. */
export function useDemoRunner(active: boolean) {
  useEffect(() => {
    if (!active) return set(IDLE);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    const at = (ms: number, s: DemoState) => timers.push(setTimeout(() => set(s), (t += ms)));
    const run = (script: number) => {
      t = 0;
      const n = SCRIPTS[script].words.length;
      at(300, { phase: 'listening', script, word: 0, final: false });
      for (let w = 1; w <= n; w++) at(w === 1 ? T.listen : T.word, { phase: 'acting', script, word: w, final: false });
      at(T.settle, { phase: 'acting', script, word: n, final: true });
      at(T.done, { phase: 'done', script, word: n, final: true });
      timers.push(setTimeout(() => run((script + 1) % SCRIPTS.length), (t += T.done)));
    };
    run(0);
    return () => (timers.forEach(clearTimeout), set(IDLE));
  }, [active]);
}

/** Steps whose trigger word has been heard (fires mid-sentence, before you finish). */
export function stepsDone(s: DemoState) {
  return SCRIPTS[s.script].steps.filter((st) => s.final || s.word > st.after);
}
