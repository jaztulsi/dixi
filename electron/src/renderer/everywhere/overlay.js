// Draws what the main process sends: the glass pill (listening, thinking, the answer, steps, the
// Claude team, an approval card), rings on the real screen, and a ring where the agent clicks.
// The window ignores the mouse except over the pill, so it never gets in the way of your apps.

import { mountMascot } from '../ui/mascot.js';
import { earconFor, play, canSound, cardAnswer } from './cues.js';

const $ = (id) => document.getElementById(id);
const pill = $('pill');

// Settings from the menu bar: large text, high contrast (also on with macOS "Increase contrast" unless
// switched off), and sounds (on unless sounds === false).
let prefs = {};
const moreContrast = matchMedia('(prefers-contrast: more)');
function applyPrefs() {
  document.documentElement.classList.toggle('large', Boolean(prefs.large));
  document.documentElement.classList.toggle('contrast', prefs.contrast ?? moreContrast.matches);
  requestAnimationFrame(placeBackdrop);
}
moreContrast.addEventListener('change', applyPrefs);
window.ew.on('ew:prefs', (p) => { prefs = p ?? {}; applyPrefs(); });
applyPrefs();

// Earcons (cues.js), never over Dixi's voice or its echo window. The window needs autoplayPolicy
// 'no-user-gesture-required' (it never gets a click first); a sound that can't start within 300 ms is
// dropped rather than played late.
let ac = null, talking = false, stoppedAt = -Infinity;
const mayPlay = () => prefs.sounds !== false && canSound(talking, stoppedAt, performance.now());
function earcon(name) {
  if (!name || !mayPlay()) return;
  try {
    ac ??= new AudioContext();
    const asked = performance.now();
    ac.resume().then(() => { if (performance.now() - asked < 300 && mayPlay()) play(ac, name); }, () => {});
  } catch {}
}

// Screen readers: answers and progress politely; approval cards and Guardian stops assertively.
const announce = (where, text) => { if ($(where).textContent !== text) $(where).textContent = text; };

// Dixi the mascot, as in the app: a pose for each state; it bobs while Dixi is talking.
const buddy = mountMascot($('buddy'), { base: '../assets/' });
buddy.init();
const POSE = { listening: 'curious', thinking: 'face', acting: 'happy', hive: 'happy', done: 'nod', error: 'neutral' };
window.ew.on('ew:speaking', (on) => {
  if (talking && !on) stoppedAt = performance.now();
  talking = Boolean(on);
  $('buddy').classList.toggle('talking', talking);
});
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The real screen behind the pill, blurred: glass that matches whatever app is underneath.
let shot = '';
function placeBackdrop() {
  const b = pill.querySelector('.backdrop');
  if (!shot) { b.style.backgroundImage = ''; return; }
  const r = pill.getBoundingClientRect();   // on screen; the pill's own lengths are times its zoom (large text)
  const z = parseFloat(getComputedStyle(pill).zoom) || 1;
  b.style.backgroundImage = `url("data:image/jpeg;base64,${shot}")`;
  b.style.backgroundSize = `${innerWidth / z}px ${innerHeight / z}px`;
  b.style.backgroundPosition = `${30 - r.left / z}px ${30 - r.top / z}px`;   // the backdrop overhangs the pill by 30px
}
new ResizeObserver(placeBackdrop).observe(pill);
window.ew.on('ew:backdrop', (b64) => { shot = b64 ?? ''; placeBackdrop(); });

// A Guardian stop is a state with guard: true; it gets its own low tone and is announced at once.
let last = 'idle';
window.ew.on('ew:state', (s) => {
  const now = s.guard ? 'guard' : s.state;
  earcon(earconFor(last, now));
  const fresh = now !== last;
  last = now;
  if (s.state === 'idle') { pill.hidden = true; $('marks').innerHTML = ''; shot = ''; placeBackdrop(); return; }   // the last screenshot doesn't stay in the style
  pill.hidden = false;
  pill.dataset.state = s.state;
  buddy.setPose(POSE[s.state] ?? 'face');
  $('title').textContent = s.title ?? ({ listening: 'Dixi is listening', thinking: 'Dixi', acting: 'Dixi is on it', hive: 'Your Claude team' }[s.state] ?? 'Dixi');
  $('app').textContent = s.app ?? '';
  $('text').textContent = s.text ?? '';
  $('steps').innerHTML = (s.steps ?? []).map((x) => `<li data-state="${esc(x.state)}">${esc(x.label)}</li>`).join('');
  $('hive').innerHTML = (s.hive ?? []).map((x) => `<li data-status="${esc(x.status)}"><b>${esc(x.task.slice(0, 70))}</b><span>${esc(x.step ?? '')}</span></li>`).join('');
  const busy = ['listening', 'thinking', 'acting', 'hive'].includes(s.state);
  $('hint').hidden = !busy;
  $('close').hidden = busy;
  $('close').setAttribute('aria-label', s.state === 'done' || s.state === 'error' ? 'Close' : 'Stop');
  if (s.state !== 'done') $('marks').innerHTML = '';
  requestAnimationFrame(placeBackdrop);
  // Live words while listening aren't read out as they arrive: only "listening" itself is.
  if (s.state === 'listening' && !fresh) return;
  const words = [$('title').textContent, s.text, (s.steps ?? []).findLast((x) => x.state === 'running')?.label].filter(Boolean).join('. ');
  if (now === 'guard') announce('assertive', words); else announce('polite', words);
});

// Rings and boxes where the answer points, each with a short label.
window.ew.on('ew:marks', (marks) => {
  $('marks').innerHTML = '';
  for (const m of marks ?? []) {
    const el = document.createElement('div');
    el.className = `mark ${m.kind === 'box' ? 'box' : 'point'}`;
    if (m.kind === 'box') Object.assign(el.style, { left: `${m.x - m.w / 2}px`, top: `${m.y - m.h / 2}px`, width: `${Math.max(24, m.w)}px`, height: `${Math.max(24, m.h)}px` });
    else Object.assign(el.style, { left: `${m.x}px`, top: `${m.y}px` });
    $('marks').append(el);
    if (!m.label) continue;
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = m.label;
    $('marks').append(label);
    // Beside the mark, kept on screen.
    const right = m.x + 40 + label.offsetWidth < innerWidth;
    Object.assign(label.style, { left: `${right ? m.x + (m.kind === 'box' ? m.w / 2 + 12 : 34) : m.x - (m.kind === 'box' ? m.w / 2 + 12 : 34) - label.offsetWidth}px`, top: `${Math.max(8, m.y - label.offsetHeight / 2)}px` });
  }
});

// Where the agent is about to click.
window.ew.on('ew:cursor', (p) => {
  const c = $('cursor');
  c.classList.remove('on');
  Object.assign(c.style, { left: `${p.x}px`, top: `${p.y}px` });
  void c.offsetWidth;   // restart the animation
  c.classList.add('on');
});

// The approval card: big Yes / No (saying "yes" or "no" works too). It chimes, is read out at once,
// and focus moves to Yes.
let cardId = null, cardAt = 0, lastKey = 0;
window.ew.on('ew:card', (card) => {
  cardId = card?.id ?? null;
  $('card').hidden = !card;
  $('question').textContent = card?.question ?? '';
  announce('assertive', card ? `${card.question} Yes or no?` : '');
  if (card) { pill.hidden = false; cardAt = performance.now(); earcon('card'); requestAnimationFrame(() => $('yes').focus()); }
});
const answer = (ok) => { if (!cardId) return; window.ew.approve(cardId, ok); cardId = null; };
$('yes').addEventListener('click', () => answer(true));
$('no').addEventListener('click', () => answer(false));

// Keys on the card: Y or Enter = yes, N or Esc = no (cues.js: a yes right after typing doesn't count).
// ponytail: keys arrive only while this window has key focus, and it's created focusable: false; the
// main process must focus it (or forward the keys) while a card is open.
document.addEventListener('keydown', (e) => {
  const since = e.timeStamp - Math.max(cardAt, lastKey);
  lastKey = e.timeStamp;
  if (!cardId || e.metaKey || e.ctrlKey || e.altKey) return;
  let key = e.key === ' ' ? 'Enter' : e.key;
  if (key === 'Enter' && e.target === $('no')) key = 'n';     // Enter or Space on a focused No means no
  const ok = cardAnswer(key, since);
  if (key === 'Enter' || ok !== null) e.preventDefault();      // Enter never clicks Yes by itself: it goes through the check
  if (ok !== null && !e.repeat) answer(ok);
});
$('close').addEventListener('click', () => window.ew.stop());

// Clicks reach the pill only while the pointer is over it; everywhere else they go to your apps.
pill.addEventListener('mouseenter', () => window.ew.mouse(true));
pill.addEventListener('mouseleave', () => window.ew.mouse(false));
