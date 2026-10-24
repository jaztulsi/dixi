'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Scripted demo shared by the hero window and the island. Every command here is a demo line from DEMO.md, run in the
 *  Dixi app on the live sites; the cart stops before payment. Timing is a fixed, illustrative cadence. */
export const SCRIPTS = [
  {
    words: ['Dixi,', 'play', 'lofi', 'beats', 'on', 'YouTube'],
    steps: [
      { after: 5, url: 'youtube.com/results?search_query=lofi+beats', text: 'Searched YouTube for “lofi beats”' },
      { after: 6, url: 'youtube.com/watch', text: 'Playing. Checked: the video is moving' },
    ],
  },
  {
    words: ['pause', 'it', 'and', 'turn', 'it', 'up'],
    steps: [
      { after: 2, url: 'youtube.com/watch', text: 'Paused' },
      { after: 6, url: 'youtube.com/watch', text: 'Volume up' },
    ],
  },
  {
    words: ['Dixi,', 'search', 'for', 'wireless', 'earbuds', 'on', 'Amazon', 'and', 'add', 'the', 'first', 'one', 'to', 'my', 'cart'],
    steps: [
      { after: 7, url: 'amazon.com/s?k=wireless+earbuds', text: 'Searched Amazon for “wireless earbuds”' },
      { after: 15, url: 'amazon.com/cart', text: 'Added the first one. Cart checked.' },
    ],
  },
  {
    words: ['Dixi,', 'what’s', 'in', 'my', 'cart', 'and', 'how', 'much', 'is', 'it?'],
    steps: [{ after: 10, url: 'amazon.com/cart', text: 'Read the cart aloud. Paying stays yours.' }],
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
