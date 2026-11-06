// Instant answers: time, date, math, unit conversions, day counts, spelling. All in code, no screenshot,
// no AI. General-knowledge and live questions (weather, news, scores) go to an injected web answerer.
// quickIntent(text) is pure: it says what kind of question it is, or null (so the screen path takes it).
import { speakable } from './speakable.js';

/** Loose first filter for everywhere-words.js. The real test is quickIntent(text) !== null. */
export const QUICK = /\b(what time|what('?s| is) (the|today'?s) (time|date|weather|news)|what day|what('?s| is) today|time in|spell|how many (days|\w+ (are )?in)|days (until|till)|square root|percent of|squared|cubed|divided by|times|plus|minus|convert|weather|forecast|news|headlines|who won|score of|ceo of|president of|stock price|capital of|population of|how (tall|old|far|big|deep)|in \d+ (days?|weeks?|months?|years?))\b/i;

// Anything about the screen, an app or the user's own day is never ours.
const SCREEN = /\b(this|that|these|those|here|screen|window|button|tab|page|email|my day|my calendar)\b|what'?s next\b|what is next\b/;

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = MONTHS.map((m) => m.slice(0, 3));

// ponytail: about 60 places; add a row when someone asks for a city that's missing.
const ZONES = {
  tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', osaka: 'Asia/Tokyo', seoul: 'Asia/Seoul', korea: 'Asia/Seoul', 'south korea': 'Asia/Seoul',
  beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', china: 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore',
  bangkok: 'Asia/Bangkok', thailand: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', manila: 'Asia/Manila', philippines: 'Asia/Manila',
  india: 'Asia/Kolkata', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', pakistan: 'Asia/Karachi', karachi: 'Asia/Karachi',
  dubai: 'Asia/Dubai', uae: 'Asia/Dubai', riyadh: 'Asia/Riyadh', 'saudi arabia': 'Asia/Riyadh', 'tel aviv': 'Asia/Jerusalem', israel: 'Asia/Jerusalem',
  istanbul: 'Europe/Istanbul', turkey: 'Europe/Istanbul', moscow: 'Europe/Moscow', russia: 'Europe/Moscow',
  london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London', britain: 'Europe/London', dublin: 'Europe/Dublin', ireland: 'Europe/Dublin',
  lisbon: 'Europe/Lisbon', paris: 'Europe/Paris', france: 'Europe/Paris', berlin: 'Europe/Berlin', germany: 'Europe/Berlin', madrid: 'Europe/Madrid',
  spain: 'Europe/Madrid', rome: 'Europe/Rome', italy: 'Europe/Rome', amsterdam: 'Europe/Amsterdam',
  cairo: 'Africa/Cairo', egypt: 'Africa/Cairo', nairobi: 'Africa/Nairobi', kenya: 'Africa/Nairobi', lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos',
  johannesburg: 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', australia: 'Australia/Sydney', perth: 'Australia/Perth', auckland: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland',
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York', washington: 'America/New_York', toronto: 'America/Toronto',
  chicago: 'America/Chicago', texas: 'America/Chicago', dallas: 'America/Chicago', houston: 'America/Chicago', denver: 'America/Denver', phoenix: 'America/Phoenix',
  california: 'America/Los_Angeles', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver',
  alaska: 'America/Anchorage', hawaii: 'Pacific/Honolulu', honolulu: 'Pacific/Honolulu', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo', brazil: 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires',
};
const PLACE = { nyc: 'New York', uk: 'the UK', uae: 'the UAE', la: 'Los Angeles' };
const title = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const place = (p) => PLACE[p] ?? title(p);

// ---------- clock helpers (all in one time zone) ----------
const parts = (now, tz, opt) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opt }).formatToParts(now).map((p) => [p.type, p.value]));
/** Today's calendar day in `tz`, as UTC midnight (so adding days is plain arithmetic). */
function today(now, tz) {
  const p = parts(now, tz, { year: 'numeric', month: 'numeric', day: 'numeric' });
  return Date.UTC(+p.year, +p.month - 1, +p.day);
}
const DAY = 86400000;
const longDate = (utc, year = false) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }).format(utc);
const nth = (d) => d + (d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** 9:05 PM → "nine oh five PM" (written out: the voice reads clock digits badly). */
function clockWords(now, tz) {
  const p = parts(now, tz, { hour: 'numeric', minute: 'numeric', hour12: true });
  const m = +p.minute, h = p.hour;
  const mm = m === 0 ? "o'clock" : m < 10 ? `oh ${m}` : String(m);
  return { say: `${h} ${mm} ${p.dayPeriod}`.replace(/o'clock (AM|PM)/, '$1'), text: `${h}:${String(m).padStart(2, '0')} ${p.dayPeriod}` };
}

// ---------- math ----------
// Words → symbols, then a small recursive-descent parser. No eval, no Function.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// "ten times ten", "twenty-five plus seven hundred": speech-to-text writes small numbers as words.
const numerals = (s) => s
  .replace(new RegExp(`\\b(${TENS.slice(2).join('|')})(?:[ -](${ONES.slice(1, 10).join('|')}))?\\b`, 'g'), (_, t, o) => TENS.indexOf(t) * 10 + (o ? ONES.indexOf(o) : 0))
  .replace(new RegExp(`\\b(${ONES.join('|')})\\b`, 'g'), (w) => ONES.indexOf(w))
  .replace(/\b(\d+) hundred(?: and)?(?: (\d\d?)\b)?/g, (_, h, r) => +h * 100 + (r ? +r : 0));
function mathTokens(s) {
  const e = numerals(s)
    .replace(/^(?:open (?:up )?(?:my |the )?calculator,? (?:and |to |then )?)?(?:what(?:'s| is)|calculate|compute|how much is|work out|search up|search|do|enter|punch in|put in)\s+/, '')
    .replace(/\s*(?:equals|is)?\s*[?.!]*$/, '')
    .replace(/square root of/g, ' sqrt ').replace(/\bsquared\b/g, ' sq ').replace(/\bcubed\b/g, ' cube ')
    .replace(/(?:percent|%) of/g, ' pctof ')
    .replace(/divided by|\bover\b/g, ' / ').replace(/multiplied by|\btimes\b|×/g, ' * ').replace(/(?<=\d)\s*x\s*(?=\d)/g, ' * ')
    .replace(/\bplus\b/g, ' + ').replace(/\bminus\b/g, ' - ');
  const re = /\s*(\d[\d,]*(?:\.\d+)?|\.\d+|sqrt|sq|cube|pctof|[-+*/()])/y;
  const out = [];
  let m;
  while (re.lastIndex < e.length && (m = re.exec(e))) out.push(m[1]);
  return re.lastIndex >= e.trimEnd().length && out.length ? out : null;
}
function evalTokens(t) {
  let i = 0;
  const bad = () => { throw new Error('bad'); };
  const atom = () => {
    const x = t[i++];
    if (x === '(') { const v = expr(); if (t[i++] !== ')') bad(); return v; }
    const n = Number(String(x).replace(/,/g, ''));
    return Number.isNaN(n) ? bad() : n;
  };
  const post = () => { let v = atom(); while (t[i] === 'sq' || t[i] === 'cube') v = t[i++] === 'sq' ? v * v : v ** 3; return v; };
  const unary = () => {
    if (t[i] === '-') { i++; return -unary(); }
    if (t[i] === 'sqrt') { i++; const v = unary(); return v < 0 ? bad() : Math.sqrt(v); }
    return post();
  };
  const term = () => {
    let v = unary();
    while (['*', '/', 'pctof'].includes(t[i])) {
      const op = t[i++], r = unary();
      if (op === '/' && r === 0) throw new Error('zero');
      v = op === '*' ? v * r : op === '/' ? v / r : (v / 100) * r;
    }
    return v;
  };
  const expr = () => { let v = term(); while (t[i] === '+' || t[i] === '-') v = t[i++] === '+' ? v + term() : v - term(); return v; };
  const v = expr();
  if (i < t.length || !Number.isFinite(v)) bad();
  return v;
}
const pretty = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// ---------- units ----------
// [dimension, size in the base unit (m, g, ml, m/s)]; temperature is special.
const U = {};
const add = (dim, f, ...names) => names.forEach((n) => { U[n] = [dim, f, names[0]]; });
add('len', 0.0254, 'inch', 'inches', 'in'); add('len', 0.3048, 'foot', 'feet', 'ft'); add('len', 0.9144, 'yard', 'yards', 'yd');
add('len', 1609.344, 'mile', 'miles', 'mi'); add('len', 0.01, 'centimeter', 'centimeters', 'centimetre', 'centimetres', 'cm');
add('len', 1, 'meter', 'meters', 'metre', 'metres', 'm'); add('len', 1000, 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'km');
add('wt', 28.3495, 'ounce', 'ounces', 'oz'); add('wt', 453.592, 'pound', 'pounds', 'lb', 'lbs'); add('wt', 1, 'gram', 'grams', 'g'); add('wt', 1000, 'kilogram', 'kilograms', 'kg', 'kilo', 'kilos');
add('temp', 0, 'fahrenheit', 'degrees fahrenheit', 'f'); add('temp', 1, 'celsius', 'degrees celsius', 'c', 'centigrade');
add('vol', 236.588, 'cup', 'cups'); add('vol', 14.7868, 'tablespoon', 'tablespoons', 'tbsp'); add('vol', 4.92892, 'teaspoon', 'teaspoons', 'tsp');
add('vol', 1, 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml'); add('vol', 1000, 'liter', 'liters', 'litre', 'litres', 'l'); add('vol', 3785.41, 'gallon', 'gallons');
add('spd', 0.44704, 'mile per hour', 'miles per hour', 'mph'); add('spd', 0.277778, 'kilometer per hour', 'kilometers per hour', 'kilometres per hour', 'km/h', 'kph', 'kmh');
const UNAME = Object.keys(U).sort((a, b) => b.length - a.length).map((n) => n.replace('/', '\\/')).join('|');
const NUM = String.raw`-?\d[\d,]*(?:\.\d+)?|a|an|one`;
const CONV_A = new RegExp(`^(?:what(?:'s| is)|convert|how much is)?\\s*(${NUM})\\s*(?:degrees? )?(${UNAME})\\s+(?:to|in|into|as)\\s+(?:degrees? )?(${UNAME})$`);
const CONV_B = new RegExp(`^how many (${UNAME}) (?:are |is )?(?:there )?in (?:(${NUM})\\s+)?(${UNAME})$`);
const sig3 = (n) => Number(n.toPrecision(3));
function convert(n, a, b) {
  const [da, fa, na] = U[a], [db, fb, nb] = U[b];
  if (da !== db) return { cant: true, na, nb };
  let v;
  if (da === 'temp') v = fa === fb ? n : fa === 0 ? ((n - 32) * 5) / 9 : (n * 9) / 5 + 32;
  else v = (n * fa) / fb;
  const r = sig3(v);
  return { v: r, exact: Math.abs(r - v) < 1e-9, na, nb };
}
const unitSay = (n, u) => (u === 'in' ? 'inches' : u === 'ft' ? 'feet' : u.endsWith('s') || u.endsWith('feet') ? u : Math.abs(n) === 1 ? u : u === 'foot' ? 'feet' : u === 'inch' ? 'inches' : u === 'mile per hour' ? 'miles per hour' : u === 'kilometer per hour' ? 'kilometers per hour' : `${u}s`);
const sayUnit = (n, u) => (u === 'fahrenheit' || u === 'celsius' ? `degrees ${u}` : unitSay(n, u));

// ---------- dates ----------
const HOLIDAYS = {
  christmas: [12, 25], 'christmas day': [12, 25], 'christmas eve': [12, 24], 'new year': [1, 1], "new year's": [1, 1], "new year's day": [1, 1], 'new years': [1, 1], 'new years day': [1, 1],
  "new year's eve": [12, 31], 'new years eve': [12, 31], halloween: [10, 31], "valentine's day": [2, 14], 'valentines day': [2, 14], valentines: [2, 14],
  'fourth of july': [7, 4], 'july fourth': [7, 4], 'independence day': [7, 4], 'the fourth of july': [7, 4],
};
const nthThursday = (y) => { const d = new Date(Date.UTC(y, 10, 1)).getUTCDay(); return 1 + ((4 - d + 7) % 7) + 21; };
function targetDate(s) {
  s = s.replace(/^(?:the|next)\s+/, '').trim();
  if (s in HOLIDAYS) return { label: title(s.replace(/\bnew years?\b/, "new year's")), md: HOLIDAYS[s] };
  if (/^thanksgiving(?: day)?$/.test(s)) return { label: 'Thanksgiving', md: (y) => [11, nthThursday(y)] };
  const bday = /^my (?:birthday|bday)\b/.test(s);
  const md = s.match(new RegExp(`(${MONTHS.join('|')}|${MON.join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)) || s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')}|${MON.join('|')})\\b`));
  if (md) {
    const [mo, d] = isNaN(md[1]) ? [md[1], md[2]] : [md[2], md[1]];
    const m = MON.indexOf(mo.slice(0, 3)) + 1;
    if (+d >= 1 && +d <= 31) return { label: bday ? 'Your birthday' : `${title(MONTHS[m - 1])} ${d}`, md: [m, +d], bday };
  }
  return bday ? { bday, label: 'Your birthday' } : null;
}

// ---------- intent ----------
const clean = (text) => {
  let t = String(text ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/\bwhats\b/g, "what's").trim();
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t.replace(/^(?:hey|ok|okay|so|um|uh|and|dixi|please)[\s,]+/, '').replace(/[\s,]+(?:dixi|please)[?.!]*$/, '').replace(/(?<!\bfrom)[\s,]+(?:right now|now|currently)(?=[?.!]*$)/, '').replace(/[\s?.!]+$/, '').trim();
  }
  return t;
};
const WEB = [
  /\b(weather|forecast|will it (?:rain|snow)|is it (?:going to )?(?:rain|snow)ing?|how (?:hot|cold) is it)\b/,
  /\b(?:news|headlines)\b/,
  /\b(?:who won|who'?s winning|who is winning|final score|score of|did the \w+ (?:win|lose))\b/,
  /\bwho (?:is|was|'s) the (?:ceo|president|prime minister|founder|owner|chairman|governor|mayor|leader|richest \w+) (?:of|at|in)\b/,
  /\b(?:stock price|share price|price of (?:bitcoin|ethereum|gold|silver|oil)|how much is (?:bitcoin|btc|ethereum|eth|gold|silver|oil))\b/,
  /\b(?:capital|population|currency|tallest|largest|biggest|longest|oldest) (?:of|in)\b/,
  /^how (?:tall|old|far|big|deep) (?:is|are|was) (?!it\b|the (?:button|screen|page|file|window|app|meeting|email))/,
];

/** → { kind, ... } for the questions in this file, else null. Pure: no clock, no network. */
export function quickIntent(text) {
  const t = clean(text);
  if (!t || t.length > 140 || SCREEN.test(t)) return null;
  let m;
  if ((m = t.match(/^(?:what(?:'s| is) (?:the )?(?:current )?time|what time is it|(?:the )?current time|time)(?: (?:in|at|for) (.+))?$/))) return { kind: 'time', place: m[1]?.replace(/^the\s+/, '') ?? null };
  if ((m = t.match(/^what(?:'s| is)(?: the)? (?:date|day)(?: is it)? (tomorrow|yesterday)$|^what(?:'s| is) (tomorrow|yesterday)(?:'s date)?$/))) return { kind: 'dateIn', days: (m[1] ?? m[2]) === 'tomorrow' ? 1 : -1 };
  if ((m = t.match(/^(?:what(?:'s| is)? |what will )(?:the )?(?:date|day)(?: (?:it )?(?:will )?be)?(?: in)? (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (day|week|month|year)s?(?: from (?:now|today))?$/))) return { kind: 'dateIn', n: WORDS[m[1]] ?? +m[1], unit: m[2] };
  if (/^(?:what(?:'s| is)(?: the)?(?: today'?s)? (?:date|day)(?: (?:is it|today))?|what day is (?:it|today)|what(?:'s| is) today|what(?:'s| is) the date today|today'?s date)$/.test(t)) return { kind: 'date' };
  if ((m = t.match(/^(?:how do you spell|how to spell|spell|how is (\S+) spelled|how do i spell|how do you spell the word)\s*(\S+)?$/)) && /^[a-z'-]{1,30}$/.test(m[1] ?? m[2] ?? '') && !/^(this|that|it|here|these|those)$/.test(m[1] ?? m[2])) return { kind: 'spell', word: m[1] ?? m[2] };
  if ((m = t.match(/^(?:how many days|how long|how many sleeps)(?: are there| is it)? (?:until|till|to|before) (.+)$/) || t.match(/^days (?:until|till|to|before) (.+)$/))) {
    const target = targetDate(m[1]);
    return target ? { kind: 'until', target } : null;
  }
  if ((m = t.match(CONV_A))) return { kind: 'convert', n: WORDS[m[1]] ?? Number(m[1].replace(/,/g, '')), a: m[2], b: m[3] };
  if ((m = t.match(CONV_B))) return { kind: 'convert', n: m[2] ? WORDS[m[2]] ?? Number(m[2].replace(/,/g, '')) : 1, a: m[3], b: m[1] };
  // "I got a five out of thirty two, what's my grade?": the percentage
  if ((m = numerals(t).match(/\b(\d+(?:\.\d+)?) out of (\d+(?:\.\d+)?)\b/)) && +m[2] > 0 && /\b(?:grade|percent(?:age)?|score|what(?:'s| is) (?:that|it|my))\b/.test(t)) return { kind: 'outof', a: +m[1], b: +m[2] };
  if (WEB.some((r) => r.test(t))) return { kind: 'web', question: String(text).trim().slice(0, 300) };
  const tok = mathTokens(t);
  if (tok && tok.some((x) => /^(?:[*/+]|sqrt|sq|cube|pctof|-)$/.test(x)) && tok.some((x) => /\d/.test(x))) {
    // "5 - 3" is math but a lone "-2" is not a question.
    if (tok.length >= 2 && !(tok.length === 2 && tok[0] === '-')) return { kind: 'math', tokens: tok };
  }
  return null;
}

// ---------- answers ----------
const done = (say, text, title) => ({ say: speakable(say), title, text });

/** → { say, title, text } or null. `webAnswer(question)` is injected (main.js's web-search answerer). */
export async function quickAnswer(text, { webAnswer, now = new Date(), tz } = {}) {
  const q = quickIntent(text);
  if (!q) return null;
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const at = new Date(now);
  const base = today(at, zone);

  if (q.kind === 'time') {
    let z = zone, where = '';
    if (q.place) {
      const key = q.place.replace(/[.,]/g, '').trim();
      z = ZONES[key];
      if (!z) return done(`I don't have a time zone for ${q.place}.`, `No time zone for ${q.place}`, 'Time');
      where = ` in ${place(key)}`;
    }
    const c = clockWords(at, z);
    const diff = (today(at, z) - base) / DAY;
    const day = diff === 1 ? ' tomorrow' : diff === -1 ? ' yesterday' : '';
    return { say: speakable(`It's ${c.say}${day}${where}.`.replace(/\b(\d+) (oh \d+|\d+)/, (_, h, m) => `${h} ${m}`)), title: 'Time', text: `${c.text}${day}${where}` };
  }
  if (q.kind === 'date' || q.kind === 'dateIn') {
    let d = base;
    if (q.days) d += q.days * DAY;
    else if (q.unit) {
      const x = new Date(base);
      if (q.unit === 'day') x.setUTCDate(x.getUTCDate() + q.n);
      if (q.unit === 'week') x.setUTCDate(x.getUTCDate() + 7 * q.n);
      if (q.unit === 'month') x.setUTCMonth(x.getUTCMonth() + q.n);
      if (q.unit === 'year') x.setUTCFullYear(x.getUTCFullYear() + q.n);
      d = x.getTime();
    }
    const lead = q.kind === 'date' ? "It's " : q.days === -1 ? 'Yesterday was ' : q.days ? "Tomorrow's " : `In ${plural(q.n, q.unit)} it'll be `;
    return done(`${lead}${longDate(d).replace(/\d+$/, (x) => nth(+x))}.`, longDate(d, true), 'Date');
  }
  if (q.kind === 'outof') {
    const p = Math.round((q.a / q.b) * 1000) / 10;
    return done(`${q.a} out of ${q.b} is ${p} percent.`, `${q.a}/${q.b} = ${p}%`, 'Percent');
  }
  if (q.kind === 'spell') {
    const letters = [...q.word.toUpperCase()].filter((c) => /[A-Z]/.test(c));
    return done(`${q.word} is spelled ${letters.join(', ')}.`, `${q.word}: ${letters.join(' ')}`, 'Spelling');
  }
  if (q.kind === 'until') {
    const { target } = q;
    if (!target.md) return done('Tell me the date too, like my birthday is May 3rd.', 'Which date?', 'Days until');
    const y = new Date(base).getUTCFullYear();
    const at2 = (yy) => { const [mo, dd] = typeof target.md === 'function' ? target.md(yy) : target.md; return Date.UTC(yy, mo - 1, dd); };
    const when = at2(y) >= base ? at2(y) : at2(y + 1);
    const n = Math.round((when - base) / DAY);
    const verb = target.bday ? 'Your birthday is' : `${target.label} is`;
    const say = n === 0 ? `${target.label} is today!` : n === 1 ? `${verb} tomorrow.` : `${verb} in ${n} days.`;
    return done(say.replace('Your birthday is', 'Your birthday is'), `${n} ${n === 1 ? 'day' : 'days'} until ${target.label}`, 'Days until');
  }
  if (q.kind === 'convert') {
    const r = convert(q.n, q.a, q.b);
    if (r.cant) return done(`I can't turn ${r.na} into ${r.nb}.`, `${r.na} to ${r.nb} doesn't convert`, 'Convert');
    const from = `${pretty(q.n)} ${sayUnit(q.n, r.na)}`;
    const to = `${pretty(r.v)} ${sayUnit(r.v, r.nb)}`;
    return done(`${from} is ${r.exact ? '' : 'about '}${to}.`, `${from} ≈ ${to}`, 'Convert');
  }
  if (q.kind === 'math') {
    let v;
    try { v = evalTokens(q.tokens); } catch (e) {
      return e.message === 'zero' ? done("You can't divide by zero.", 'Divide by zero', 'Math') : null;
    }
    const r = Math.round(v * 100) / 100;
    const about = Math.abs(v - r) > 1e-9;
    return done(`It's ${about ? 'about ' : ''}${pretty(r)}.`, `${q.tokens.join(' ').replace('pctof', '% of')} = ${pretty(r)}`, 'Math');
  }
  // web
  let a = null;
  try { a = webAnswer ? await webAnswer(q.question) : null; } catch { a = null; }
  a = typeof a === 'string' ? a.trim() : a?.answer?.trim?.();
  if (!a) return done("I couldn't look that up just now.", "Couldn't look that up", 'Web');
  return done(a, a, 'Web');
}
