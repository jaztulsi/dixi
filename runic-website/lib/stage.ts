import { useSyncExternalStore } from 'react';

/** What the How-it-works scroll sequence wants the island to perform. null = not in that section. */
export type Stage = null | 'speak' | 'act' | 'answer';

let stage: Stage = null;
const subs = new Set<() => void>();

export function setStage(next: Stage) {
  if (next === stage) return;
  stage = next;
  subs.forEach((f) => f());
}

export function useStage(): Stage {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => stage,
    () => null,
  );
}
