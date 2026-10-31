// Guardian: a scam tripwire on every screen Dixi reads. Plain code, no AI call: it's fast, and neither a
// page nor someone coaching you on the phone can talk it out of a decision.
// What it checks:
//  · Where you are: a web address that only looks like a big brand (paypa1.com, chase.com.login-secure.net,
//    letters from another alphabet), and a remote-access app (AnyDesk, TeamViewer…) in front.
//  · Text Dixi already has (what you said, the page title, Accessibility labels): fake virus popups with a
//    number to call, gift-card / crypto / wire demands, "your account will be closed" pressure, and
//    "we refunded you too much".
//  · After a stop, a 15-minute cooling-off: Dixi won't act on that site or app. Scammers rush you; this waits.
//  · While a finding is open, or any cooling-off runs, no approval can be given (blocking()).
// It only warns and blocks: it never clicks, types or speaks. Its sentences go out through everywhere.js say().
// What it can't do: it's a tripwire, not an antivirus. It doesn't scan files or find malware, can't hear the
// phone call, can't read words inside pictures it wasn't given, and only knows the brands in its table and
// the phrases below. A new scam in new words gets past it; Dixi's gate (asks before pay/send) still holds.

import { domainToUnicode } from 'node:url';

// ---- folding look-alike letters: аpple (Cyrillic а), paypa1, arnazon, micr0soft all fold to the brand ----
const CONFUSE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', һ: 'h', ո: 'n', ս: 'u', ӏ: 'l', ɡ: 'g', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't' };
const fold = (s) => [...String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()].map((c) => CONFUSE[c] ?? c).join('')
  .replace(/0/g, 'o').replace(/[1i|!]/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/rn/g, 'm').replace(/vv/g, 'w');

// ---- the brands scammers copy most, with their real addresses ----
// ponytail: a hand-kept table; add a brand when fixtures show a new favourite.
const BRANDS = [
  ['PayPal', 'paypal.com', 'paypal.me'],
  ['Apple', 'apple.com', 'apple.news'],
  ['iCloud', 'icloud.com'],
  ['Amazon', 'amazon.com', 'amazon.jobs'],
  ['Chase', 'chase.com'],
  ['Wells Fargo', 'wellsfargo.com'],
  ['Bank of America', 'bankofamerica.com'],
  ['Microsoft', 'microsoft.com', 'microsoftonline.com'],
  ['Google', 'google.com'],
  ['Netflix', 'netflix.com'],
  ['the IRS', 'irs.gov'],
  ['Social Security', 'ssa.gov'],
  ['the Postal Service', 'usps.com'],
  ['FedEx', 'fedex.com'],
  ['UPS', 'ups.com'],
  ['Coinbase', 'coinbase.com'],
].map(([name, ...domains]) => { const label = domains[0].split('.')[0]; return { name, domains, label, key: fold(label) }; });
// The brand's own name on an ordinary or country ending (amazon.co.uk, google.de) is the brand itself.
const SAFE_TLD = new Set('com net org edu gov us uk ca au nz ie de fr es it nl be at ch se no dk fi pl pt jp kr in sg mx br'.split(' '));
// Words scam addresses pair with a brand: paypal-secure-login, apple-id-verify, usps-tracking-help.
const LURE = new Set(['login', 'logon', 'signin', 'verify', 'verification', 'secure', 'security', 'account', 'accounts', 'update', 'support',
  'help', 'helpdesk', 'service', 'billing', 'refund', 'unlock', 'alert', 'recovery', 'suspended', 'confirm', 'auth', 'id', 'customer', 'care',
  'track', 'tracking', 'delivery', 'redelivery', 'claim', 'reward'].map(fold));
// How many typos still count as the brand: 2 edits on a short name matches half the web (ups → cups, abs),
// so short names need an exact match after folding.
const slack = (key) => (key.length <= 5 ? 0 : key.length <= 8 ? 1 : 2);

/** Edits between two words; swapping two neighbours counts as one (microsfot). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\d*\./, ''); } catch { return ''; } };
/** "login.paypal.co.uk" → site "paypal.co.uk", label "paypal", sub ["login"]. */
function split(host) {
  const l = host.split('.');
  // ponytail: two-part endings by pattern (co.uk, com.au), not the full public-suffix list.
  const n = l.length > 2 && /^(co|com|net|org|gov|ac|edu)\.[a-z]{2}$/.test(l.slice(-2).join('.')) ? 3 : 2;
  return { site: l.slice(-n).join('.'), label: l.at(-n), tld: l.at(-1), sub: l.slice(0, -n) };
}

/** The brand this address pretends to be, or null (also null for the brand's real sites). */
function lookalike(host) {
  if (!host.includes('.') || /^[\d.]+$|:/.test(host)) return null;   // localhost, an IP address
  const { site, label, tld } = split(host);
  if (BRANDS.some((b) => b.domains.includes(site) || (b.label === label && SAFE_TLD.has(tld)))) return null;
  const uni = domainToUnicode(host) || host;
  const parts = uni.split('.').flatMap((x) => [x, ...x.split('-')]).map(fold);   // each label, and each word in it
  const near = fold(split(uni).label.replaceAll('-', ''));
  for (const b of BRANDS) {
    const k = b.key;
    const named = (p) => p === k || (p.startsWith(k) && LURE.has(p.slice(k.length))) || (p.endsWith(k) && LURE.has(p.slice(0, -k.length)));
    if (b.domains.some((d) => new RegExp(`(^|\\.)${d.replaceAll('.', '\\.')}[.-]`).test(host))) return b;   // paypal.com.secure-login.xyz
    if (parts.some(named) && parts.some((p) => LURE.has(p) || (p !== k && named(p)))) return b;       // apple-id-verify.com
    if (Math.abs(near.length - k.length) <= slack(k) && distance(near, k) <= slack(k)) return b;      // paypa1, arnazon, аpple
  }
  return null;
}

// ---- remote-access tools: the #1 tool of "tech support" callers ----
const REMOTE_APP = /any ?desk|team ?viewer|ultra ?viewer|connectwise|screen ?connect|logmein|gotoassist|goto ?resolve|rust ?desk|splashtop|zoho[ .]?assist|quick ?assist|aeroadmin|supremo|bomgar|beyondtrust|remote ?utilities|chrome remote desktop/i;
const REMOTE_SITE = /(^|\.)(anydesk\.com|teamviewer\.com|ultraviewer\.net|screenconnect\.com|connectwise\.com|logmein\.com|logme\.in|rustdesk\.com|splashtop\.com|remotedesktop\.google\.com|assist\.zoho\.com|join\.zoho\.com|aeroadmin\.com|supremocontrol\.com)$/;

// ---- the rules as a small table checked in code (Progent's idea) ----
// Narrowing (turning a rule on, warn → stop) is free. Widening (off, stop → warn) needs { approved: true },
// which must come from a local settings action, never from a spoken yes or anything on screen.
export const POLICY = Object.freeze(Object.fromEntries(Object.entries({
  lookalike: 'stop', punycode: 'warn', 'remote-access': 'warn',
  'tech-support': 'stop', 'gift-card': 'stop', 'crypto-wire': 'stop', urgency: 'warn', refund: 'stop',
}).map(([id, level]) => [id, Object.freeze({ level, enabled: true })])));
const strength = (r) => (r.enabled ? (r.level === 'stop' ? 2 : 1) : 0);
/** A new policy with one rule changed, or the old one and why not. */
export function setRule(policy, id, change, { approved = false } = {}) {
  const was = policy[id];
  if (!was) return { ok: false, policy, why: `There's no Guardian rule called ${id}.` };
  const next = { level: change.level ?? was.level, enabled: change.enabled ?? was.enabled };
  if (!['warn', 'stop'].includes(next.level) || typeof next.enabled !== 'boolean') return { ok: false, policy, why: 'A rule is warn or stop, on or off.' };
  if (strength(next) < strength(was) && approved !== true) return { ok: false, policy, why: 'Loosening a Guardian rule needs approval.' };
  return { ok: true, policy: Object.freeze({ ...policy, [id]: Object.freeze(next) }) };
}
const hit = (policy, rule, say) => (policy[rule]?.enabled ? [{ level: policy[rule].level, rule, say }] : []);
const stopsFirst = (found) => found.sort((a, b) => (a.level === 'stop' ? 0 : 1) - (b.level === 'stop' ? 0 : 1));

/** Findings about where you are: { name (front app), bundle, url, title }. */
export function checkContext(ctx, policy = POLICY) {
  const host = hostOf(ctx?.url ?? '');
  const brand = host ? lookalike(host) : null;
  const found = [];
  if (brand) found.push(...hit(policy, 'lookalike', `This web address only looks like ${brand.name}'s, so please don't sign in or pay here.`));
  else if (host.split('.').some((l) => l.startsWith('xn--'))) found.push(...hit(policy, 'punycode', 'This web address uses look-alike letters, so check it carefully before you sign in or pay.'));
  if (REMOTE_APP.test(`${ctx?.name ?? ''} ${ctx?.bundle ?? ''}`) || REMOTE_SITE.test(host)) found.push(...hit(policy, 'remote-access', "If someone on the phone asked you to open this, it's likely a scam. Hang up first."));
  return stopsFirst(found);
}

// ---- scam words in text Dixi already has (never instructions; only matched) ----
// ponytail: tuned on what you said and page titles; AX labels on bank pages ("Wire money") will need fixture tuning.
const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const TECH = /\byour (computer|pc|mac|device|system|iphone|browser)\b.{0,30}\b(is|has been|was|may be) (infected|compromised|hacked|locked|blocked)\b|\bcall (microsoft|windows) (tech )?(support|technicians?|help ?desk)\b|\b(do not|don't) (close|restart|shut ?down|turn off) (this (window|page)|your (computer|pc|mac))\b|\b(microsoft|windows|apple) (defender|security) (alert|warning)\b/i;
const VIRUS = /\b(virus(es)?|malware|trojan|spyware|infected|hacked)\b/i;
const LOCKED = /\b(locked|blocked)\b/i, DEVICE = /\b(computer|pc|mac|device|windows|browser|system)\b/i;
const GIFT_ASK = /\b(fines?|bail|taxes|warrant|penalty|arrest|lawsuit|owe|debt|settle|irs|police|social security)\b[^.]{0,60}\bgift ?cards?|\bgift ?cards?\b[^.]{0,60}\b(to pay|as payment|bail|taxes|warrant|penalty|arrest)\b|\b(read|give|tell|text|send|email)\b (me|us|him|her|them) (the |those |all the )?(card )?(numbers?|codes?|pins?)\b|\bscratch (off )?the (back|silver|strip)|\bback of the cards?\b/i;
const COUNT = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, several: 3, multiple: 3, many: 3 };
const CRYPTO = /\b(send|pay|transfer|deposit|wire|move|put)\b[^.]{0,50}\b(bitcoin|btc|crypto(currency)?|usdt|tether|ethereum)\b|\bbitcoin (atm|machine|kiosk)\b|\b(pay|send)\b[^.]{0,30}\b(by|via|through|with|using) (a )?(western union|moneygram)\b|\bwire (me|us|them|him|her|the (money|funds|payment)|\$?\s?\d)|\b(send|make|do) (a |the )?wire\b|\b(move|transfer|put) (your|all your|all of your|the) (money|savings|funds)\b[^.]{0,40}\b(safe|secure|protected|new) account\b/i;
const URGENT = /\bact (now|immediately|fast)\b|\bimmediate action\b|\bfinal (notice|warning)\b|\bwithin (24|48|twenty-four|forty-eight) hours\b|\b(your|the) account (will be|has been|is being|was) (closed|suspended|locked|terminated|deactivated|disabled|limited|frozen)\b|\b(verify|confirm|update) your (account|identity|information|payment)( details)? (now|immediately|today|within)\b|\bwarrant for your arrest\b|\byour social security number (has been|is|was) (suspended|blocked|compromised)\b/i;
const REFUND = /\b(refunded|credited|sent|deposited|transferred|paid) (you |your account |into your account )?(too much|extra|an extra|more than|by mistake|by accident)|\b(accidentally|mistakenly) (refunded|sent|deposited|transferred|credited)\b|\brefund(ed)? (you )?too much\b|\boverpaid (you|your refund)\b|\b(pay|send|give) (us |it |the money )?back (the )?(difference|extra|excess|overpayment)\b|\breturn the (extra|excess|difference|overpayment)\b/i;

/** "five $100 gift cards", "pay the fine in gift cards", "read me the numbers": a demand, not a birthday present. */
function giftDemand(t) {
  for (const m of t.matchAll(/gift ?cards?/gi)) {
    const around = t.slice(Math.max(0, m.index - 80), m.index + 80);
    if (GIFT_ASK.test(around)) return true;
    const before = t.slice(Math.max(0, m.index - 50), m.index);
    // ponytail: three or more cards, or $200+ with a buy/send word, holds; thresholds from the coached-scam rule.
    const n = before.match(/(?<!\$ ?)\b(\d+|three|four|five|six|seven|eight|nine|ten|several|multiple|many) (?:\$ ?\d[\d,]* )?(?:[a-z]+ ){0,2}$/i)?.[1]?.toLowerCase();
    if ((COUNT[n] ?? Number(n)) >= 3) return true;
    const dollars = before.match(/\b(buy|purchase|pay|send|load|put)\b[^.]{0,30}\$ ?(\d[\d,]*)/i)?.[2];
    if (Number(dollars?.replaceAll(',', '')) >= 200) return true;
  }
  return false;
}
function techSupport(t) {
  if (TECH.test(t)) return true;
  for (const m of t.matchAll(PHONE)) {   // a number to call next to "virus", or "computer … locked"
    const near = t.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
    if (VIRUS.test(near) || (LOCKED.test(near) && DEVICE.test(near))) return true;
  }
  return false;
}

/** Findings in text Dixi already has. */
export function checkText(text, policy = POLICY) {
  const t = String(text ?? '').slice(0, 20000).replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  const found = [];
  if (techSupport(t)) found.push(...hit(policy, 'tech-support', "This looks like a fake virus warning; real ones never give you a number to call, so please don't call it."));
  if (giftDemand(t)) found.push(...hit(policy, 'gift-card', 'Real companies and the government never ask to be paid in gift cards, so this is almost certainly a scam.'));
  if (CRYPTO.test(t)) found.push(...hit(policy, 'crypto-wire', 'Real banks, police and the government never ask you to pay by crypto or wire, so this is likely a scam.'));
  if (REFUND.test(t)) found.push(...hit(policy, 'refund', "\"We refunded you too much\" is a common scam, so please don't send any money back."));
  if (URGENT.test(t)) found.push(...hit(policy, 'urgency', 'This is trying to rush you, which is a common scam trick, so take a moment before you do anything.'));
  return stopsFirst(found);
}

/** For the talk prompt: what the code found, so the answer never calls the screen safe. */
export const findingsNote = (found) => (found?.length ? `\nDixi's own scam checks (plain code, not a guess) found: ${found.map((f) => f.say).join(' ')} The user is being told this. Never contradict it or call this screen safe; if the screenshot shows more signs, say which.` : '');

// ---- cooling-off: after a stop, no agent actions on that site or app for 15 minutes ----
// ponytail: every stop rule is a money scam, so any stop starts the hold; split by rule if one isn't.
export const COOL_MS = 15 * 60000;
const placeOf = (ctx) => { const h = hostOf(ctx?.url ?? ''); return h ? split(h).site : String(ctx?.name || 'this app').toLowerCase(); };
/** The new state after a finding (expired holds dropped). */
export function coolingOff(state, finding, ctx, now = Date.now()) {
  const holds = Object.fromEntries(Object.entries(state?.holds ?? {}).filter(([, h]) => h.until > now));
  if (finding?.level === 'stop') holds[placeOf(ctx)] = { until: now + COOL_MS, rule: finding.rule };
  return { ...state, holds };
}
/** The hold on this site or app right now, with a sentence to say, or null. */
export function held(state, ctx, now = Date.now()) {
  const h = state?.holds?.[placeOf(ctx)];
  if (!h || h.until <= now) return null;
  const mins = Math.ceil((h.until - now) / 60000);
  return { ...h, mins, say: `I won't do anything here for ${mins} more minute${mins === 1 ? '' : 's'} because it looked like a scam, and the wait is on purpose: scammers rush you.` };
}

// ---- open findings: while one is open, no approval can be given (council condition) ----
/** After each request's scan: its findings stay open until the next scan replaces them; each stop starts a hold. */
export function track(state, found = [], ctx, now = Date.now()) {
  let s = coolingOff({ ...state, open: stopsFirst([...found]) }, null, ctx, now);
  for (const f of found) s = coolingOff(s, f, ctx, now);
  return s;
}
/** Why no approval may be given now, or null: a finding on this screen is open, or any cooling-off is running. */
export function blocking(state, now = Date.now()) {
  const f = state?.open?.[0];
  if (f) return { rule: f.rule, say: "I won't approve that while a scam warning is open on this screen." };
  const h = Object.values(state?.holds ?? {}).find((x) => x.until > now);
  if (!h) return null;
  const mins = Math.ceil((h.until - now) / 60000);
  return { rule: h.rule, mins, say: `I won't approve anything for ${mins} more minute${mins === 1 ? '' : 's'} after that scam warning; the wait is on purpose.` };
}
