'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Scripted demo shared by the hero window and the island. YouTube/Amazon phrases match the app's tested flows;
 *  the Apple flows are illustrative (the agent drives any site, but these were not run end to end on apple.com).
 *  Timing is a fixed, illustrative cadence, not a measurement. Follow-ups need no wake word (the app keeps
 *  listening for 8 s after it acts). */
export const SCRIPTS = [
  // Apple first: music, shopping, paying. Dixi stops at the payment sheet; you confirm.
  {
    words: ['Dixi,', 'open', 'Apple', 'Music', 'and', 'play', 'lofi', 'beats'],
    steps: [
      { after: 4, url: 'music.apple.com', text: 'Opened Apple Music' },
      { after: 8, url: 'music.apple.com/search?term=lofi+beats', text: 'Playing “lofi beats”' },
    ],
  },
  {
    words: ['Dixi,', 'go', 'to', 'apple.com', 'and', 'buy', 'AirPods', 'Pro'],
    steps: [
      { after: 4, url: 'apple.com', text: 'Opened apple.com' },
      { after: 8, url: 'apple.com/shop/bag', text: 'AirPods Pro added to your bag' },
    ],
  },
  {
    words: ['check', 'out', 'with', 'Apple', 'Pay'],
    steps: [{ after: 5, url: 'apple.com/shop/checkout', text: 'Apple Pay is ready. You confirm.' }],
  },
  // Then the rest of the web.
  {
    words: ['Dixi,', 'open', 'YouTube', 'and', 'search', 'for', 'lofi', 'beats'],
    steps: [
      { after: 3, url: 'youtube.com', text: 'Opened youtube.com' },
      { after: 8, url: 'youtube.com/results?q=lofi+beats', text: 'Searched “lofi beats”' },
    ],
  },
  {
    words: ['Dixi,', 'go', 'to', 'Amazon', 'and', 'search', 'for', 'noise', 'cancelling', 'headphones'],
    steps: [
      { after: 4, url: 'amazon.com', text: 'Opened amazon.com' },
      { after: 10, url: 'amazon.com/s?k=noise+cancelling+headphones', text: 'Searched “noise cancelling headphones”' },
    ],
  },
  {
    words: ['add', 'it', 'to', 'my', 'cart'],
    steps: [{ after: 5, url: 'amazon.com/cart', text: 'Added to cart' }],
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
