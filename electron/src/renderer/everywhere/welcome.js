// First run: Dixi walks you through the Mac permissions it needs, out loud, with a live checkmark for
// each (the status is checked again every 2 s and whenever you come back to this window), then a short
// "try it" card. The bridge (window.welcome) gives status(), open(pane), say(text) and done().
// The step logic at the top is pure, so `node --test` runs it; the window code below skips in Node.

import { mountMascot } from '../ui/mascot.js';

export const STEPS = [
  { id: 'mic', name: 'Microphone', why: 'so Dixi can hear you say “Dixi”', button: 'Allow the microphone',
    line: 'First, the microphone, so I can hear you. Press the big button and choose Allow.' },
  { id: 'screen', name: 'Screen Recording', why: 'so Dixi can see what you see, only when you ask', button: 'Open Screen Recording',
    note: 'After you turn Dixi on, macOS may ask to quit and reopen it. That’s fine: this window comes back.',
    line: 'Next, Screen Recording, so I can see what you see, only when you ask. Press the button, then turn Dixi on in the list.' },
  { id: 'ax', name: 'Accessibility', why: 'so Dixi can click for you', button: 'Open Accessibility',
    line: 'Now Accessibility, so I can click and type for you. Press the button, then turn Dixi on.' },
  { id: 'automation', name: 'Calendar and Mail', why: 'so Dixi can tell you about your day', button: 'Allow Calendar and Mail', optional: true,
    line: 'Last, only if you like: Calendar and Mail, so I can tell you about your day. Press the button and choose OK each time, or skip it.' },
];

// A permission is on when main says true or macOS says 'granted' ('denied', 'not-determined', null: not yet).
export const granted = (v) => v === true || v === 'granted';

/** The step to show now: the first one not on and not skipped; 'try' when everything is done or skipped. */
export const nextStep = (perms = {}, skipped = []) => STEPS.find((s) => !granted(perms?.[s.id]) && !skipped.includes(s.id))?.id ?? 'try';

// The "try it" card, with the shortcuts main really registered (they can be changed in .env).
export const tryLines = (keys = {}) => [
  `Press ${keys.ask ?? '⌥Space'} and ask: “what’s on my screen?”`,
  'Say: “Dixi, take dictation.”',
  `${keys.mic ?? '⌘⌥Space'} turns the microphone off.`,
];
// Key symbols as words, for Dixi's voice ("⌥Space" → "Option Space").
export const spoken = (s) => s.replace(/⌘/g, 'Command ').replace(/⌥/g, 'Option ').replace(/⌃/g, 'Control ').replace(/⇧/g, 'Shift ');

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const bridge = window.welcome;
  const buddy = mountMascot($('buddy'), { base: '../assets/' });
  buddy.init();
  buddy.setPose('curious');
  // macOS "Increase contrast" turns on the same high-contrast look as the overlay.
  const moreContrast = matchMedia('(prefers-contrast: more)');
  const contrast = () => document.documentElement.classList.toggle('contrast', moreContrast.matches);
  moreContrast.addEventListener('change', contrast);
  contrast();

  let perms = {}, keys = {}, current = null, drawn = '';
  const skipped = [];
  const stateOf = (s, now) => (granted(perms[s.id]) ? 'done' : s.id === now ? 'current' : skipped.includes(s.id) ? 'skipped' : 'later');
  const WORD = { done: 'done', current: 'do this now', skipped: 'skipped', later: 'still to do' };

  function row(s, st) {
    const denied = perms[s.id] === 'denied';
    return `<li data-state="${st}">
      <span class="tick" aria-hidden="true"></span>
      <div>
        <b>${s.name}${s.optional ? ' <span class="opt">(optional)</span>' : ''}<span class="sr">, ${WORD[st]}</span></b>
        <span class="why">${s.why}</span>
        ${st !== 'current' ? '' : `<div class="go">
          <button class="choice primary" data-open="${s.id}">${denied ? 'Open System Settings' : s.button}</button>
          <button class="skip" data-skip="${s.id}">${s.optional ? 'Skip' : 'Not now'}</button>
        </div>${s.note ? `<p class="note">${s.note}</p>` : ''}${denied ? '<p class="note">You said no earlier, so macOS won’t ask again. Turn Dixi on in the list that opens.</p>' : ''}`}
      </div>
    </li>`;
  }

  // Draws only when something changed, so focus and VoiceOver's place aren't lost every 2 s.
  function render() {
    const now = nextStep(perms, skipped);
    const view = STEPS.map((s) => stateOf(s, now));
    const key = JSON.stringify([view, STEPS.map((s) => perms[s.id] === 'denied')]);
    if (key === drawn) return;
    const before = drawn ? JSON.parse(drawn)[0] : view;
    drawn = key;
    $('list').innerHTML = STEPS.map((s, i) => row(s, view[i])).join('');
    const newly = STEPS.filter((s, i) => view[i] === 'done' && before[i] !== 'done');
    if (newly.length) { $('live').textContent = newly.map((s) => `${s.name}: done.`).join(' '); buddy.setPose('nod'); setTimeout(() => buddy.setPose(now === 'try' ? 'happy' : 'curious'), 1400); }
    $('try').hidden = now !== 'try';
    if (now === current) return;
    // A new step: Dixi says it, and focus goes to its big button (or to the last card's button).
    const first = current === null;
    current = now;
    if (now === 'try') {
      $('tips').innerHTML = '';
      for (const t of tryLines(keys)) $('tips').append(Object.assign(document.createElement('li'), { textContent: t }));
      buddy.setPose('happy');
      bridge.say(`${first ? 'You’re all set.' : 'That’s everything.'} Try it: ${spoken(tryLines(keys).join(' '))}`);
      requestAnimationFrame(() => $('done').focus());
      return;
    }
    const step = STEPS.find((s) => s.id === now);
    bridge.say(`${first ? 'Hi, I’m Dixi. Let’s switch on a few things so I can help in any app. ' : newly.length ? 'Got it. ' : ''}${step.line}`);
    requestAnimationFrame(() => document.querySelector('[data-open]')?.focus());
  }

  async function check() {
    try { ({ keys = {}, ...perms } = (await bridge.status()) ?? {}); } catch { return; }
    render();
  }

  $('list').addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]')?.dataset.open;
    const skip = e.target.closest('[data-skip]')?.dataset.skip;
    if (skip) { skipped.push(skip); render(); }
    if (open) { await bridge.open(open).catch(() => {}); check(); }
  });
  const finish = () => bridge.done();
  $('done').addEventListener('click', finish);
  $('close').addEventListener('click', finish);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(); });
  window.addEventListener('focus', check);   // back from System Settings: check at once
  setInterval(check, 2000);
  check();
}
