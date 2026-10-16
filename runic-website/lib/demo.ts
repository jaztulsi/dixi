/** The hero demo. Timing is illustrative (a fixed cadence), not measured. */
export const DEMO = {
  words: ['Runic,', 'open', 'YouTube', 'and', 'search', 'for', 'lofi', 'beats.'],
  actions: [
    { afterWord: 2, text: 'Opened youtube.com' },
    { afterWord: 7, text: 'Searching “lofi beats”' },
  ],
  idleMs: 1600,
  listenMs: 900,
  wordMs: 300,
  doneMs: 1400,
};
