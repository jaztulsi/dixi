// The dashboard's pure helpers (no DOM), so `node --test` runs them: which commands get saved, which
// phrases repeat, how activity is grouped by day, and the words for a permission's state.

// A permission is on when main says true or macOS says 'granted' (same rule as the welcome window).
export const granted = (v) => v === true || v === 'granted';

export function permWord(v) {
  if (granted(v)) return 'On';
  if (v === 'denied' || v === false) return 'Off';
  if (v === 'restricted') return 'Blocked on this Mac';
  if (v === 'not-determined' || v === null) return 'Not set up yet';
  return 'Not checked yet';
}

// "Dixi, Claude!" and "claude" are the same phrase.
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const complete = (c) => Boolean(norm(c?.phrase) && String(c?.target ?? '').trim());

/** true at each row whose phrase another row already uses. The one kept is the saved one (has an id),
 *  then the complete one, then the first: typing a repeat never knocks out a command that's already saved. */
export function dupes(list) {
  const rank = (c) => (c.id ? 2 : 0) + (complete(c) ? 1 : 0);
  const keep = new Map();
  list.forEach((c, i) => {
    const k = norm(c.phrase);
    if (k && (!keep.has(k) || rank(c) > rank(list[keep.get(k)]))) keep.set(k, i);
  });
  return list.map((c, i) => { const k = norm(c.phrase); return Boolean(k) && keep.get(k) !== i; });
}

/** The rows that get sent: complete, and not a repeat. Same objects, so ids from main can be put back. */
export const keepers = (list) => { const d = dupes(list); return list.filter((c, i) => complete(c) && !d[i]); };
export const clean = ({ id, phrase, action, target, enabled }) =>
  ({ ...(id ? { id } : {}), phrase: phrase.trim(), action, target: target.trim(), enabled: enabled !== false });

// "9:12 AM"
export const timeLabel = (t, locale) => new Date(t).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function dayLabel(t, now = Date.now(), locale) {
  const days = Math.round((dayStart(now) - dayStart(t)) / 864e5);   // round: a DST day is 23 or 25 hours
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(t);
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric',
    ...(d.getFullYear() !== new Date(now).getFullYear() && { year: 'numeric' }) });
}

/** Newest first, one group per day: [{ label, items }]. Items without a (valid) time are left out. */
export function byDay(items, now = Date.now(), locale) {
  const groups = [];
  for (const it of (items ?? []).filter((i) => Number.isFinite(i?.t) && Math.abs(i.t) <= 8.64e15).sort((a, b) => b.t - a.t)) {
    const label = dayLabel(it.t, now, locale);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(it);
  }
  return groups;
}

export const statusText = (s) => (s?.watching ? `👁 Watching: ${s.watching}` : s?.prefs?.listening ? 'Listening' : 'Mic off');
