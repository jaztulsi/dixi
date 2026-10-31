// The daily brief: "Dixi, what's my day?" Today's events from Calendar, reminders due today or overdue
// from Reminders, and unread mail from Mail (only when Mail is already open), read out in about 20
// seconds. Each app is asked through osascript (JXA), which macOS gates behind one Automation prompt per
// app. An app that says no, or takes longer than 5 seconds, is skipped and the brief says so.

import { execFile } from 'node:child_process';

const TIMEOUT = 5000;
const osa = (args, timeout = TIMEOUT) => new Promise((resolve, reject) => {
  execFile(args[0], args.slice(1), { timeout }, (err, out) => (err ? reject(err) : resolve(String(out).trim())));
});
// Arguments go in as JSON (valid JS), never spliced into the script as text.
const jxa = (body, args = {}) => ['osascript', '-l', 'JavaScript', '-e', `const A = ${JSON.stringify(args)}; ${body}`];

// ---- what each app is asked (bulk property reads: one Apple event per property, not per item) ----
// Calendar keeps one event per repeating series, dated at its first time, so the series that began
// before today come back separately with their rule and are worked out in parseCalendar.
const CALENDAR = `(() => {
  const app = Application('Calendar'), was = app.running(), d0 = new Date(A.d0), d1 = new Date(A.d1), out = [];
  for (const c of app.calendars()) {
    const day = c.events.whose({_and: [{startDate: {_lessThan: d1}}, {endDate: {_greaterThan: d0}}]});
    const series = c.events.whose({_and: [{startDate: {_lessThan: d0}}, {recurrence: {_contains: 'FREQ'}}]});
    for (const [q, rep] of [[day, false], [series, true]]) {
      const title = q.summary();
      if (!title.length) continue;
      const start = q.startDate(), end = q.endDate(), place = q.location(), allDay = q.alldayEvent();
      const rule = rep ? q.recurrence() : [], except = rep ? q.excludedDates() : [];
      title.forEach((t, i) => out.push({ title: t, start: start[i], end: end[i], location: place[i], allDay: allDay[i], rule: rule[i] || '', except: except[i] || [] }));
    }
  }
  if (!was) app.quit();   // we opened it just to ask: put it away again
  return JSON.stringify(out);
})()`;
const REMINDERS = `(() => {
  const app = Application('Reminders'), was = app.running(), d1 = new Date(A.d1);
  const q = app.reminders.whose({_and: [{completed: false}, {_or: [{dueDate: {_lessThan: d1}}, {alldayDueDate: {_lessThan: d1}}]}]});
  const out = JSON.stringify({ name: q.name(), due: q.dueDate(), day: q.alldayDueDate() });
  if (!was) app.quit();
  return out;
})()`;
// running() asks LaunchServices, not Mail, so Mail is never launched by this.
// ponytail: "top 3" trusts Mail's order (newest first); add dateReceived() and sort if it's ever wrong.
const MAIL = `(() => {
  const app = Application('Mail');
  if (!app.running()) return 'null';
  const unread = app.inbox.unreadCount();
  const from = unread ? app.inbox.messages.whose({readStatus: false}).sender().slice(0, 3) : [];
  return JSON.stringify({ unread, from });
})()`;

// ---- dates ----
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const days = (a, b) => Math.round((b - a) / 864e5);   // whole days; rounding absorbs DST hours
const atDay = (day, t) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.getHours(), t.getMinutes());

// ---- repeating events (RFC 5545 rules as Calendar writes them) ----
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function until(u) {
  const [, y, mo, d, h, mi, s, z] = String(u).match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z?))?/) ?? [];
  if (!y) return null;
  if (h == null) return new Date(y, mo - 1, d, 23, 59, 59);
  return z ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
}
// Does the rule land on day d? (first = the series' first day, s = its first start.)
// ponytail: DAILY, WEEKLY, MONTHLY (date, BYMONTHDAY, "2TU" / "-1FR", BYSETPOS) and YEARLY on the same
// date. BYMONTH, BYHOUR and the rest are not read; a rule using them may be missed, never invented.
function hits(r, s, first, d) {
  const k = Number(r.INTERVAL) || 1, by = r.BYDAY ? r.BYDAY.split(',') : null, wd = WD[d.getDay()];
  const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
  if (r.FREQ === 'DAILY') return days(first, d) % k === 0 && (!by || by.includes(wd));
  if (r.FREQ === 'WEEKLY') {
    const wk = WD.indexOf(r.WKST || 'MO'), weekOf = (x) => addDays(x, -((x.getDay() - wk + 7) % 7));
    return Math.round(days(weekOf(first), weekOf(d)) / 7) % k === 0 && (by ?? [WD[s.getDay()]]).includes(wd);
  }
  if (r.FREQ === 'YEARLY') return months % (12 * k) === 0 && d.getDate() === s.getDate();
  if (r.FREQ !== 'MONTHLY' || months % k) return false;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), date = d.getDate();
  if (r.BYMONTHDAY) return r.BYMONTHDAY.split(',').map(Number).some((n) => (n > 0 ? n : last + n + 1) === date);
  if (!by) return date === s.getDate();
  return by.some((b) => {
    const [, n, w] = b.match(/^([+-]?\d*)([A-Z]{2})$/) ?? [];
    const nth = Number(n || r.BYSETPOS || 0);
    return w === wd && (!nth || (nth > 0 ? Math.ceil(date / 7) === nth : Math.ceil((last - date + 1) / 7) === -nth));
  });
}
/** Whether a repeating event (its first start, rule, skipped dates) has a time on that day. */
export function occursOn(ev, day) {
  const r = Object.fromEntries(String(ev.rule).split(';').map((p) => p.split('=')));
  const s = new Date(ev.start), first = midnight(s), d = midnight(day);
  const end = r.UNTIL && until(r.UNTIL);
  if (d < first || (end && atDay(d, s) > end)) return false;
  if ((ev.except ?? []).some((x) => days(midnight(new Date(x)), d) === 0)) return false;
  if (!hits(r, s, first, d)) return false;
  if (!r.COUNT) return true;
  let n = 0;   // ponytail: walks every day since the series began; fine for decades
  for (let x = first; x <= d && n <= Number(r.COUNT); x = addDays(x, 1)) n += hits(r, s, first, x);
  return n <= Number(r.COUNT);
}

// ---- reading osascript's answers (pure, unit-tested) ----
/** Calendar's JSON → that day's events in time order (all-day ones first): { title, start, end, location, allDay }. */
export function parseCalendar(out, day) {
  const d0 = midnight(day);
  const ev = (e, start) => ({ title: e.title || 'Untitled event', start, end: new Date(+start + (new Date(e.end) - new Date(e.start))), location: e.location || '', allDay: Boolean(e.allDay) });
  const raw = JSON.parse(out);
  const fixed = raw.filter((e) => !e.rule).map((e) => ev(e, new Date(e.start)));
  // A moved or one-off copy of a series today wins over the series' usual time.
  const titles = new Set(fixed.map((e) => e.title));
  const series = raw.filter((e) => e.rule && !titles.has(e.title) && occursOn(e, d0)).map((e) => ev(e, atDay(d0, new Date(e.start))));
  return [...fixed, ...series].sort((a, b) => b.allDay - a.allDay || a.start - b.start);
}
/** Reminders' JSON → [{ title, due, overdue }], overdue ones first. */
export function parseReminders(out, day) {
  const d0 = midnight(day), { name = [], due = [], day: allday = [] } = JSON.parse(out);
  return name.map((title, i) => ({ title: title || 'Untitled reminder', due: due[i] ?? allday[i] }))
    .filter((r) => r.due).map((r) => ({ ...r, due: new Date(r.due), overdue: new Date(r.due) < d0 }))
    .sort((a, b) => a.due - b.due);
}
/** "Sam Lee <sam@x.com>" → "Sam Lee"; "noreply@github.com" → "github". */
export function senderName(s) {
  const m = String(s ?? '').match(/^\s*"?([^"<]*?)"?\s*<([^>]*)>/);
  if (m?.[1].trim()) return m[1].trim();
  const addr = (m?.[2] ?? String(s ?? '')).trim();
  return addr.includes('@') ? addr.split('@')[1].split('.').slice(-2, -1)[0] || addr : addr;
}
/**
 * Mail's JSON → null (Mail isn't open) or { unread, from: [names of the newest unread senders] }.
 * Sender names are written by strangers: spoken (short), never sent to a model.
 */
export function parseMail(out) {
  const j = JSON.parse(out);
  return j ? { unread: Number(j.unread) || 0, from: [...new Set((j.from ?? []).map((s) => short(senderName(s))).filter(Boolean))] } : null;
}

// ---- asking the apps (read-only: nothing is changed in Calendar, Reminders or Mail) ----
/** Said once, before the first brief: macOS asks about each app the first time. */
export const FIRST_RUN = 'The first time, your Mac asks up to three times whether Dixi may read Calendar, Reminders and Mail. Click OK on each one you want in your brief.';
const why = (err) => (err?.killed || err?.signal ? 'slow' : /-174[34]|not (authori[sz]ed|allowed|permitted)/i.test(err?.message ?? '') ? 'denied' : 'error');
/**
 * Today's events, reminders and mail, all asked at once. Any of them is null when it was skipped:
 * skipped lists { app, why: 'denied' | 'slow' | 'error' }. mail is also null (not skipped) when Mail
 * isn't open. With tomorrow: true, only Calendar is asked, for tomorrow.
 */
export async function gather({ run = osa, now = new Date(), tomorrow = false } = {}) {
  const d0 = addDays(midnight(now), tomorrow ? 1 : 0), d1 = addDays(d0, 1);
  const skipped = [];
  const ask = (app, script, parse) => run(script, TIMEOUT).then(parse).catch((err) => { skipped.push({ app, why: why(err) }); return null; });
  const [events, reminders, mail] = await Promise.all([
    ask('Calendar', jxa(CALENDAR, { d0: +d0, d1: +d1 }), (out) => parseCalendar(out, d0)),
    tomorrow ? null : ask('Reminders', jxa(REMINDERS, { d1: +d1 }), (out) => parseReminders(out, d0)),
    tomorrow ? null : ask('Mail', jxa(MAIL), parseMail),
  ]);
  return { events, reminders, mail, skipped, now };
}

// ---- the words (pure, unit-tested) ----
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n, one, many = `${one}s`) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const short = (t) => (t.length > 40 ? t.slice(0, 40).replace(/\s+\S*$/, '') : t);
/** 9:30 → "9:30", 12:00 → "12", 16:00 → "4" (the voice says it; morning or afternoon is clear from the day). */
const clock = (d) => `${d.getHours() % 12 || 12}${d.getMinutes() ? `:${String(d.getMinutes()).padStart(2, '0')}` : ''}`;
const said = (e) => (e.allDay ? short(e.title) : `${short(e.title)} at ${clock(e.start)}`);
/** "a, b and c"; past max items, "a, b and 3 more". A ", and" when an item already has a comma. */
function list(items, max) {
  const all = items.length > max ? [...items.slice(0, max - 1), `${items.length - max + 1} more`] : items;
  if (all.length < 2) return all.join('');
  return `${all.slice(0, -1).join(', ')}${all.slice(0, -1).some((s) => s.includes(',')) ? ', and ' : ' and '}${all.at(-1)}`;
}
function inTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'starting now';
  if (m < 60) return `in ${count(m, 'minute')}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `in ${h === 1 ? 'an hour' : `${h} hours`}${r ? ` and ${count(r, 'minute')}` : ''}`;
}
/** One line for the apps that were skipped; '' when none were. */
export function skippedLine(skipped = []) {
  if (!skipped.length) return '';
  const names = list(skipped.map((s) => s.app), 3);
  return skipped.some((s) => s.why === 'denied')
    ? `I couldn't check ${names}: allow Dixi in System Settings, Privacy and Security, Automation.`
    : `${names} didn't answer in time; if macOS asked for permission, click OK and ask me again.`;
}

/** The spoken brief, about 20 seconds. Events that already ended aren't read. */
export function briefText({ events, reminders, mail, now = new Date(), skipped = [] }) {
  const h = now.getHours();
  const out = [h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.'];
  if (events) {
    const left = events.filter((e) => e.allDay || e.end > now);
    out.push(left.length ? `You have ${count(left.length, 'thing')}${left.length < events.length ? ' left' : ''} today: ${list(left.map(said), 4)}.`
      : events.length ? "That's everything on your calendar today." : 'Your calendar is clear today.');
  }
  if (reminders?.length) out.push(`${cap(count(reminders.length, 'reminder'))}: ${list(reminders.map((r) => (r.overdue ? `${short(r.title)}, which is overdue` : short(r.title))), 3)}.`);
  if (mail) out.push(!mail.unread ? 'No unread email.' : `You have ${count(mail.unread, 'unread email')}${mail.from.length ? `, ${mail.unread > 3 ? 'the latest ' : ''}from ${list(mail.from, 3)}` : ''}.`);
  out.push(skippedLine(skipped));
  return out.filter(Boolean).join(' ');
}

/** "What's next?" → "Next is lunch with Sam at 12, in 40 minutes." */
export function nextText({ events, now = new Date(), skipped = [] }) {
  if (!events) return skippedLine(skipped) || "I couldn't read your calendar.";
  const next = events.find((e) => !e.allDay && e.start > now);
  return next ? `Next is ${said(next)}, ${inTime(next.start - now)}.` : 'Nothing else on your calendar today.';
}

/** "What's on my calendar tomorrow?" (events from gather({ tomorrow: true })). */
export function tomorrowText({ events, skipped = [] }) {
  if (!events) return skippedLine(skipped) || "I couldn't read your calendar.";
  return events.length ? `Tomorrow you have ${count(events.length, 'thing')}: ${list(events.map(said), 5)}.` : 'Nothing on your calendar tomorrow.';
}

/** The brief as panel rows: past events done, today's current or next one running, the rest queued. */
export function briefSteps({ events, reminders, mail, now = new Date() }) {
  const next = events?.find((e) => !e.allDay && e.end > now && +midnight(e.start) <= +midnight(now));
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return [
    ...(events ?? []).map((e) => ({ label: `${e.allDay ? 'All day' : time(e.start)} · ${e.title}${e.location ? ` · ${e.location}` : ''}`,
      state: e === next ? 'running' : !e.allDay && e.end <= now ? 'done' : 'queued' })),
    ...(reminders ?? []).map((r) => ({ label: `${r.overdue ? 'Overdue' : 'Today'} · ${r.title}`, state: 'queued' })),
    ...(mail?.unread ? [{ label: `${mail.unread} unread in Mail`, state: 'queued' }] : []),
  ];
}
