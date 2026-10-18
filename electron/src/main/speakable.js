// Text for the voice: numbers written out the way a person says them. The fast ElevenLabs model reads
// digits badly ("$1,615.16", "256GB", "4.8"); words it says right. Only what's spoken changes; the
// screen keeps the numbers.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const BIG = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];

/** 1615 → "one thousand six hundred fifteen". */
export function say(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `minus ${say(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${say(n % 100)}` : ''}`;
  for (const [v, w] of BIG) if (n >= v) return `${say(Math.floor(n / v))} ${w}${n % v ? ` ${say(n % v)}` : ''}`;
  return String(n);
}
const ORDINAL = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
const ordinal = (n) => say(n).replace(/(\w+)$/, (w) => ORDINAL[w] ?? (w.endsWith('y') ? `${w.slice(0, -1)}ieth` : `${w}th`));
const num = (s) => Number(String(s).replace(/,/g, ''));
const decimal = (s) => { const [i, f] = String(s).replace(/,/g, '').split('.'); return f ? `${say(i)} point ${[...f].map((d) => ONES[d]).join(' ')}` : say(i); };
const UNITS = { gb: 'gigabytes', tb: 'terabytes', mb: 'megabytes', hz: 'hertz', mm: 'millimeters', cm: 'centimeters', kg: 'kilograms', lbs: 'pounds', lb: 'pounds', mah: 'milliamp hours', w: 'watts', h: 'hours', hr: 'hours', hrs: 'hours', min: 'minutes' };
// A number as written: 1,615 / 1615 / 15.8 (a comma only between groups of three).
const N = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const unit = (n, u) => (Number(n) === 1 && /s$/.test(u) ? u.slice(0, -1) : u);

export function speakable(text) {
  return String(text ?? '')
    // $1,615.16 → one thousand six hundred fifteen dollars and sixteen cents; $249 → two hundred forty-nine dollars
    .replace(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d\d))?\b/g, (_, d, c) => `${say(num(d))} ${num(d) === 1 ? 'dollar' : 'dollars'}${c && Number(c) ? ` and ${say(c)} ${Number(c) === 1 ? 'cent' : 'cents'}` : ''}`)
    // 4.8/5, 4.8 out of 5 → four point eight out of five
    .replace(/(\d+(?:\.\d+)?)\s?\/\s?(\d+)\b/g, (_, a, b) => `${decimal(a)} out of ${decimal(b)}`)
    .replace(/(\d+(?:\.\d+)?)\s?%/g, (_, a) => `${decimal(a)} percent`)
    // 15.8M subscribers, 2.5K → fifteen point eight million (capital letter right after the number; "4K" video stays)
    .replace(/(\d+\.\d+|\d{2,})([KMB])\b/g, (_, a, u) => `${decimal(a)} ${{ K: 'thousand', M: 'million', B: 'billion' }[u]}`)
    // 256GB, 120Hz, 6.3-inch, 50H
    .replace(new RegExp(`(${N})[\\s-]?(gb|tb|mb|hz|mm|cm|kg|lbs?|mah|w|hrs?|h|min)\\b`, 'gi'), (_, a, u) => `${decimal(a)} ${unit(num(a), UNITS[u.toLowerCase()])}`)
    .replace(/(\d+(?:\.\d+)?)-(inch|hour|day|pack|core)\b/gi, (_, a, u) => `${decimal(a)} ${u}`)
    // 1st, 22nd → first, twenty-second
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, a) => ordinal(Number(a)))
    // ×2 → times two; 4–7 → four to seven
    .replace(/×\s?(\d)/g, ' times $1').replace(/(\d)\s?[–—]\s?(\d)/g, '$1 to $2')
    // Model names: A19 → A nineteen, 4K → four K (numbers glued to letters get a space).
    .replace(/([a-z])(\d)/gi, '$1 $2').replace(/(\d)([a-z])/gi, '$1 $2')
    // Whatever is left: 1,615 → one thousand six hundred fifteen; 15.8 → fifteen point eight.
    .replace(new RegExp(N, 'g'), decimal)
    .replace(/\s{2,}/g, ' ').trim();
}
