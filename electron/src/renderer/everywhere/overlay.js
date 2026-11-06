// Draws what the main process sends: the island (listening, thinking, acting, done, error), the card
// slot under it, rings on the real screen, and a ring where the agent clicks. The window ignores the
// mouse except over the island and the card, so it never gets in the way of your apps.

import { earconFor, play, canSound, cardAnswer } from './cues.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const pill = $('pill'), more = $('more');

// Settings from the menu bar: large text, high contrast (also on with macOS "Increase contrast" unless
// switched off), and sounds (on unless sounds === false).
let prefs = {};
const moreContrast = matchMedia('(prefers-contrast: more)');
function applyPrefs() {
  root.classList.toggle('large', Boolean(prefs.large));
  root.classList.toggle('contrast', prefs.contrast ?? moreContrast.matches);
  fold();
}
moreContrast.addEventListener('change', applyPrefs);
window.ew.on('ew:prefs', (p) => { prefs = p ?? {}; applyPrefs(); });

// The notch (main/notch.js): the island grows out of it, and folds back into its exact size.
let notch = null;
function fold() {
  root.classList.toggle('notch', Boolean(notch));
  if (notch) root.style.setProperty('--notch-h', `${notch.h}px`);
  const r = pill.getBoundingClientRect();   // its laid-out size (a transform doesn't change it)
  root.style.setProperty('--sx', notch && r.width ? (notch.w / r.width).toFixed(3) : '0.9');
  root.style.setProperty('--sy', notch && r.height ? (notch.h / r.height).toFixed(3) : '0.7');
}
window.ew.on('ew:notch', (n) => { notch = n?.w > 0 ? n : null; fold(); });
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
window.ew.on('ew:speaking', (on) => { if (talking && !on) stoppedAt = performance.now(); talking = Boolean(on); });

// Screen readers: answers and progress politely; approval cards and Guardian stops assertively.
const announce = (where, text) => { if ($(where).textContent !== text) $(where).textContent = text; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The waveform: five bars follow the mic level (main sends ~15 per second, only while listening).
const bars = [...pill.querySelectorAll('.wave i')];
const SHAPE = [0.5, 0.8, 1, 0.75, 0.55];
window.ew.on('ew:level', (v) => bars.forEach((b, i) => b.style.setProperty('--l', Math.max(0.18, Math.min(1, v * SHAPE[i] * (0.8 + Math.random() * 0.4))).toFixed(2))));

// The card slot shows only when it has something: an answer longer than the island's line, steps, the
// Claude team, or (careful mode only) a yes/no.
const showMore = () => { more.hidden = pill.hidden || !($('full').textContent || $('steps').children.length || $('hive').children.length || !$('ask').hidden); };

// A Guardian stop is a state with guard: true; it gets its own low tone and is announced at once.
let last = 'idle';
window.ew.on('ew:state', (s) => {
  const now = s.guard ? 'guard' : s.state;
  earcon(earconFor(last, now));
  const fresh = now !== last;
  last = now;
  if (s.state === 'idle') { pill.hidden = true; showMore(); $('marks').innerHTML = ''; return; }
  const view = s.state === 'hive' ? 'acting' : s.state;
  pill.dataset.state = view;
  if (view === 'listening') bars.forEach((b) => b.style.removeProperty('--l'));
  pill.hidden = false;
  const running = (s.steps ?? []).findLast((x) => x.state === 'running')?.label;
  const line = (view === 'acting' ? running || s.text || s.title : s.text || (view === 'done' || view === 'error' ? s.title : '')) ?? '';
  $('text').textContent = String(line).replace(/\s+/g, ' ').trim();
  $('undo').hidden = !(view === 'done' && s.undo);
  // The whole answer goes in the card when one line can't hold it.
  $('full').textContent = (view === 'done' || view === 'error') && $('text').scrollWidth > $('text').clientWidth ? s.text ?? '' : '';
  $('steps').innerHTML = (s.steps ?? []).length > 1 ? s.steps.map((x) => `<li data-state="${esc(x.state)}">${esc(x.label)}</li>`).join('') : '';
  $('hive').innerHTML = (s.hive ?? []).map((x) => `<li data-status="${esc(x.status)}"><b>${esc(x.task.slice(0, 70))}</b><span>${esc(x.step ?? '')}</span></li>`).join('');
  showMore();
  if (s.state !== 'done') $('marks').innerHTML = '';
  // Live words while listening aren't read out as they arrive: only "listening" itself is.
  if (s.state === 'listening' && !fresh) return;
  const title = s.title ?? ({ listening: 'Dixi is listening', thinking: 'Dixi', acting: 'Dixi is on it', hive: 'Your Claude team' }[s.state] ?? 'Dixi');
  const words = [title, s.text, running].filter(Boolean).join('. ');
  if (now === 'guard') announce('assertive', words); else announce('polite', words);
});
$('undo').addEventListener('click', () => { $('undo').hidden = true; window.ew.undo(); });

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

// Careful mode only (by default Dixi never asks): Yes / No in the card slot. It chimes, is read out at
// once, and focus moves to Yes.
let cardId = null, cardAt = 0, lastKey = 0;
window.ew.on('ew:card', (card) => {
  cardId = card?.id ?? null;
  $('ask').hidden = !card;
  $('question').textContent = card?.question ?? '';
  announce('assertive', card ? `${card.question} Yes or no?` : '');
  if (card) { pill.hidden = false; cardAt = performance.now(); earcon('card'); requestAnimationFrame(() => $('yes').focus()); }
  showMore();
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

// Clicks reach the island and the card only while the pointer is over them; everywhere else they go to your apps.
for (const el of [pill, more]) {
  el.addEventListener('mouseenter', () => window.ew.mouse(true));
  el.addEventListener('mouseleave', () => window.ew.mouse(false));
}
