// Mac doctor: "why is my Mac slow", "am I running out of space", "is my internet working". Read-only:
// every check is a fixed program run with execFile and an argv array (no shell), through an injected exec.
// Answers are one or two calm sentences ending in ONE thing you can say. It never fixes anything itself:
// "quit Chrome" goes to desktop.js, which asks first. Never deletes a file.

import dns from 'node:dns/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { exec as realExec, parseBattery } from './desktop.js';

// ---- what was said → which check (pure) ----
const PRE = String.raw`(?:(?:hey |ok |okay )?dixi,? ?)?(?:please |can you |could you |will you )?(?:tell me |check )?`;
const POST = String.raw`(?:,? please)?[.!?]?`;
const MAC = String.raw`(?:mac|macbook|computer|laptop|imac)`;
const TOPICS = [
  ['slow', String.raw`why (?:is|does) (?:my |the )?${MAC} (?:so |very |really )?(?:slow|sluggish|lagging|laggy|freezing)|why (?:is|does) (?:everything|it) (?:so |running |going )?(?:slow|sluggish|laggy)(?: today| lately| right now)?|(?:my |the )?${MAC} (?:is|seems|feels) (?:so |very |really )?(?:slow|sluggish|laggy)|why am i so slow`],
  ['memory', String.raw`(?:what(?:['’]?s| is)|which (?:app|program) is) (?:using|taking up|eating|hogging) (?:all )?(?:of )?(?:my |the )?(?:memory|ram)|how much (?:memory|ram) (?:do i have|am i using|is (?:left|free|in use))|am i (?:running )?out of (?:memory|ram)|(?:is|do i have) (?:my )?(?:memory|ram) (?:full|low|short)`],
  ['space', String.raw`am i (?:running |getting )?(?:out of|low on|short on) (?:disk |hard drive |storage )?(?:space|storage)|how much (?:free )?(?:disk |hard drive )?(?:storage|space)(?: do i have| is (?:left|free)| have i got)?(?: left| free)?|(?:is|are) (?:my )?(?:disk|hard drive|storage|mac) (?:full|almost full)|(?:what(?:['’]?s| is)|what) (?:using|taking up|eating) (?:all )?(?:of )?(?:my |the )?(?:space|storage)|how full is my (?:disk|hard drive|storage|mac)`],
  ['net', String.raw`is (?:my |the )?(?:internet|wi[- ]?fi|network) (?:working|down|connected|ok|okay|out)|why is (?:my |the )?(?:internet|wi[- ]?fi|network) (?:not working|down|so slow|slow|broken|acting up)|why (?:isn['’]?t|is not) (?:my |the )?(?:internet|wi[- ]?fi|network) working|(?:my |the )?(?:internet|wi[- ]?fi) (?:is|isn['’]?t|is not) (?:not )?working|(?:my |the )?(?:internet|wi[- ]?fi) (?:is )?(?:down|broken)|am i (?:connected|online)(?: to the internet)?|why can['’]?t i (?:connect to|get on) the (?:internet|wi[- ]?fi)|why (?:isn['’]?t|is not) (?:my )?${MAC} (?:connecting|online)`],
  ['battery', String.raw`is (?:my |the )?battery (?:healthy|ok|okay|good|ok to use|worn|wearing out|dying)|(?:how )?(?:healthy|good) is my battery|(?:how many )?battery (?:cycles|cycle count|health|condition)(?: do i have)?|(?:check )?(?:my |the )?battery health|does my battery need (?:replacing|to be replaced|service)|should i replace my battery|why (?:is|does) my battery (?:dying|draining|dead|drain)(?: so)?(?: fast| quickly)?`],
  ['fan', String.raw`why (?:is|does) (?:my |the )?(?:fan|${MAC}(?:['’]?s fan)?) (?:so |very |really )?(?:loud|noisy|running|spinning|hot|blowing|making noise)(?: so loud| so much| so fast)?|why is (?:my |the )?${MAC} (?:so )?(?:hot|warm|noisy|loud)|(?:my |the )?fan is (?:so |very |really )?(?:loud|noisy|running|spinning)`],
  ['model', String.raw`what(?:['’]?s| is) my ${MAC}|what (?:kind|type|model) of (?:a )?${MAC}(?: do i have| is this)?|what (?:${MAC}|macbook) do i have|which (?:mac|macbook) do i have|what (?:version of )?mac ?os (?:am i (?:on|using|running)|do i have)|what(?:['’]?s| is) my mac ?os(?: version)?|what mac ?os is this`],
  ['uptime', String.raw`when did i (?:last )?(?:restart|reboot)(?: my ${MAC})?|when was (?:my |the )?${MAC} last (?:restarted|rebooted)|how long (?:has|have) (?:my |the )?${MAC} been (?:on|running|up)|how long since (?:i|my ${MAC} )?(?:last )?(?:restart|reboot)(?:ed)?`],
];
/** One regex for every doctor line, for everywhere-words.js: these go to Everywhere. */
export const DOCTOR = new RegExp(TOPICS.map(([, b]) => `^${PRE}(?:${b})${POST}$`).join('|'), 'i');
const RES = TOPICS.map(([topic, b]) => [topic, new RegExp(`^${PRE}(?:${b})${POST}$`, 'i')]);

/** "why is my Mac slow" → { verb: 'doctor', topic: 'slow' }, or null. */
export function doctorIntent(text) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 150) return null;
  const hit = RES.find(([, re]) => re.test(t));
  return hit ? { verb: 'doctor', topic: hit[0] } : null;
}

// ---- reading the output of each program (pure) ----
/** Rounded for speaking: 12.4 GB → "about 12 gigabytes", 0.6 → "under 1 gigabyte". */
export function gigs(bytes) {
  const g = bytes / 1073741824;
  if (g < 0.95) return g < 0.1 ? 'under 1 gigabyte' : `about ${Math.round(g * 10) / 10} gigabytes`;
  const r = g < 10 ? Math.round(g * 2) / 2 : Math.round(g);   // halves under 10, wholes above
  return `about ${r} ${r === 1 ? 'gigabyte' : 'gigabytes'}`;
}
const num = (g) => (g < 10 ? Math.round(g * 2) / 2 : Math.round(g));   // a bare number, for "of 500"
export const days = (ms) => Math.floor(ms / 86400000);

/** `ps -Aceo pcpu,rss,comm -r` → [{ name, cpu, rss }] grouped by app (helpers fold into their app), busiest first.
 *  rss is in kilobytes. "Google Chrome Helper (Renderer)" → "Google Chrome". */
export function parseProcs(out) {
  const by = new Map();
  for (const line of String(out).split('\n')) {
    const m = line.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const name = m[3].replace(/ Helper(?: \(.*\))?$/i, '').replace(/ Web Content$/i, '').trim();
    if (name === 'ps') continue;
    const g = by.get(name) ?? { name, cpu: 0, rss: 0 };
    g.cpu += Number(m[1]); g.rss += Number(m[2]);
    by.set(name, g);
  }
  return [...by.values()];
}
// Parts of macOS itself: never offered for quitting.
const SYSTEM = /^(kernel_task|WindowServer|launchd|loginwindow|Finder|Dock|SystemUIServer|mds|mds_stores|mdworker.*|corespotlightd|coreaudiod|bluetoothd|distnoted|cfprefsd|trustd|fseventsd|syslogd|opendirectoryd|powerd|hidd|airportd|useractivityd|sharingd|nsurlsessiond|backupd|photoanalysisd|com\.apple\..*)$/i;
export const quittable = (procs) => procs.filter((p) => !SYSTEM.test(p.name));

/** `memory_pressure` → free memory percent, or null. */
export const parseFreePct = (out) => Number(String(out).match(/free percentage:\s*(\d+)%/i)?.[1] ?? NaN);
/** `df -k /` → { totalKb, availKb }, or null. */
export function parseDf(out) {
  const f = String(out).trim().split('\n')[1]?.trim().split(/\s+/);
  const total = Number(f?.[1]), avail = Number(f?.[3]);
  return total > 0 && avail >= 0 ? { totalKb: total, availKb: avail } : null;
}
/** `sysctl kern.boottime` → a Date, or null. */
export function parseBoot(out) {
  const s = Number(String(out).match(/sec\s*=\s*(\d+)/)?.[1]);
  return s ? new Date(s * 1000) : null;
}
/** `system_profiler SPPowerDataType` → { cycles, condition, capacity } (any can be missing). */
export function parsePower(out) {
  const s = String(out);
  const cycles = Number(s.match(/Cycle Count:\s*(\d+)/)?.[1] ?? NaN);
  const capacity = Number(s.match(/Maximum Capacity:\s*(\d+)%/)?.[1] ?? NaN);
  const condition = s.match(/Condition:\s*([^\n]+)/)?.[1].trim();
  return { cycles: Number.isNaN(cycles) ? null : cycles, capacity: Number.isNaN(capacity) ? null : capacity, condition };
}
/** `system_profiler SPHardwareDataType` → { name, chip, memory } e.g. "MacBook Air", "Apple M2", "16 GB". */
export function parseHardware(out) {
  const g = (k) => String(out).match(new RegExp(`${k}:\\s*([^\\n]+)`))?.[1].trim();
  return { name: g('Model Name'), chip: g('Chip') ?? g('Processor Name'), memory: g('Memory') };
}
/** `route -n get default` → the router's address, or null. */
export const parseGateway = (out) => String(out).match(/gateway:\s*([\d.]+)/)?.[1] ?? null;
/** `networksetup -getairportnetwork en0` → the Wi-Fi name, or null when not joined. */
export const parseWifiName = (out) => String(out).match(/Current Wi-Fi Network:\s*(.+)/i)?.[1].trim() ?? null;
/** ping output → true when at least some replies came back. */
export const pingOk = (out) => { const l = Number(String(out).match(/([\d.]+)% packet loss/)?.[1] ?? 100); return l < 100; };

// ---- the checks ----
const out = (say, title = 'Mac check') => ({ say, title, text: say });
const quitLine = (n) => ` Say “quit ${n}” if you want.`;
// A slow program shouldn't hold the answer: after ms, give up and treat it as "no answer".
const within = (p, ms = 3000) => Promise.race([p, new Promise((r) => { setTimeout(() => r(''), ms).unref?.(); })]);
const sh = (d, cmd, args = []) => d.exec(cmd, args).catch(() => '');
const dirKb = async (d, dir) => Number(String(await within(sh(d, 'du', ['-sk', dir]))).match(/^(\d+)/)?.[1] ?? 0);   // ponytail: skipped (0) when du is slow
const memBytes = async (d) => Number(await sh(d, 'sysctl', ['-n', 'hw.memsize'])) || 0;

async function busy(d) {
  const procs = parseProcs(await sh(d, 'ps', ['-Aceo', 'pcpu,rss,comm', '-r']));
  const q = quittable(procs);
  return { procs, byCpu: [...q].sort((a, b) => b.cpu - a.cpu)[0], byMem: [...q].sort((a, b) => b.rss - a.rss)[0] };
}
const memUse = (p) => gigs(p.rss * 1024);

const DO = {
  async slow(d) {
    const { byCpu, byMem } = await busy(d);
    const free = parseFreePct(await sh(d, 'memory_pressure'));
    const df = parseDf(await sh(d, 'df', ['-k', '/']));
    if (byCpu && byCpu.cpu >= 60) return out(`${byCpu.name} is working very hard right now, which is slowing your Mac down.${quitLine(byCpu.name)}`);
    if (free < 15 && byMem) return out(`Your Mac is running low on memory, and ${byMem.name} is using the most, ${memUse(byMem)}.${quitLine(byMem.name)}`);
    if (df && df.availKb / df.totalKb < 0.08) return out(`Your Mac is almost out of storage, which makes it slow. Say “how much storage do I have” for details.`);
    return out('Nothing looks wrong right now. If it stays slow, restarting your Mac usually helps. Say “when did I last restart” to see how long it has been.');
  },
  async memory(d) {
    const { byMem } = await busy(d);
    const total = await memBytes(d);
    if (!byMem) return out("I couldn't read what's using your memory.");
    const of = total ? ` of your ${num(total / 1073741824)}` : '';
    return out(`${byMem.name} is using the most, ${memUse(byMem)}${of}.${quitLine(byMem.name)}`);
  },
  async space(d) {
    const df = parseDf(await sh(d, 'df', ['-k', '/']));
    if (!df) return out("I couldn't read your storage.");
    const free = df.availKb * 1024, total = df.totalKb * 1024;
    const base = `You have ${gigs(free)} free of ${num(total / 1073741824)}.`;
    const dl = await dirKb(d, path.join(d.home, 'Downloads')), trash = await dirKb(d, path.join(d.home, '.Trash'));
    if (free / total < 0.1) {
      const big = trash > dl ? ['Trash', trash] : ['Downloads', dl];
      return out(`${base} That is getting full.${big[1] > 524288 ? ` Your ${big[0]} holds ${gigs(big[1] * 1024)}. Say “open ${big[0]}” to look through it.` : ''}`);
    }
    return out(`${base} That is plenty.`);
  },
  async battery(d) {
    const b = parseBattery(await sh(d, 'pmset', ['-g', 'batt']));
    if (!b) return out('This Mac has no battery.', 'Battery');
    const p = parsePower(await sh(d, 'system_profiler', ['SPPowerDataType']));
    const bits = [p.capacity != null && `holds about ${p.capacity} percent of its original charge`, p.cycles != null && `has been charged ${p.cycles} times`].filter(Boolean).join(' and ');
    if (!bits && !p.condition) return out(`Your battery is at ${b}. I couldn't read its health.`, 'Battery');
    const bad = p.condition && !/^normal$/i.test(p.condition);
    const fine = !bad && (p.capacity == null || p.capacity >= 80);
    return out(fine ? `Your battery is in good shape. It ${bits || 'reports normal'}.` : `Your battery is wearing out. It ${bits || `says “${p.condition}”`}. Say “open battery settings” for details.`, 'Battery');
  },
  async fan(d) {
    const { byCpu } = await busy(d);
    if (byCpu && byCpu.cpu >= 40) return out(`${byCpu.name} is working hard, which makes the fan spin up.${quitLine(byCpu.name)}`, 'Fan');
    return out('Nothing is working hard right now, so the fan should quiet down soon. Make sure the vents are not blocked, and keep the Mac on a hard surface.', 'Fan');
  },
  async model(d) {
    const hw = parseHardware(await sh(d, 'system_profiler', ['SPHardwareDataType']));
    const model = hw.name ?? (await sh(d, 'sysctl', ['-n', 'hw.model'])) ?? 'Mac';
    const v = await sh(d, 'sw_vers', ['-productVersion']);
    const more = [hw.chip, hw.memory && `${hw.memory.replace(/ ?GB/i, '')} gigabytes of memory`].filter(Boolean).join(' with ');
    return out(`You have a ${model || 'Mac'}${more ? `, ${more}` : ''}${v ? `, running macOS ${v}` : ''}.`, 'Your Mac');
  },
  async uptime(d) {
    const t = parseBoot(await sh(d, 'sysctl', ['-n', 'kern.boottime']));
    if (!t) return out("I couldn't tell when you last restarted.");
    const n = days(Number(d.now()) - Number(t));
    const when = n < 1 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
    return out(`You last restarted ${when}.${n >= 14 ? ' A restart now and then keeps your Mac running smoothly.' : ''}`, 'Restart');
  },
  async net(d) {
    const ports = await sh(d, 'networksetup', ['-listallhardwareports']);
    const dev = ports.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\w+)/)?.[1] ?? 'en0';
    const wifi = parseWifiName(await sh(d, 'networksetup', ['-getairportnetwork', dev]));
    const gw = parseGateway(await sh(d, 'route', ['-n', 'get', 'default']));
    const T = 'Internet';
    if (!gw) return out(wifi ? `Your Mac sees the Wi-Fi network “${wifi}” but isn't online. Say “turn Wi-Fi off” and then “turn Wi-Fi on” to reconnect.` : 'Your Mac is not connected to Wi-Fi. Say “turn Wi-Fi on” to connect.', T);
    const ping = (host) => d.exec('ping', ['-c', '2', '-t', '3', host]).then(pingOk, () => false);   // ping fails with an error when nothing answers
    if (!(await ping(gw))) return out(`${wifi ? 'Your Wi-Fi is connected, but' : 'Your Mac is connected, but'} it can't reach your router. Try moving closer to it. Say “turn Wi-Fi off” and then “turn Wi-Fi on” to reconnect.`, T);
    if (!(await ping('1.1.1.1'))) return out('Your Wi-Fi works; the problem is past your router. Try restarting the router: unplug it for 30 seconds, then plug it back in.', T);
    const dnsOk = await within(d.lookup('apple.com').then(() => true, () => false), 4000);
    if (dnsOk !== true) return out('The internet is reaching your Mac, but website names are not being looked up. Restarting your router usually fixes this.', T);
    return out('Your internet is working fine. If one website is slow or broken, the problem is probably that website.', T);
  },
};

/** Run one intent from doctorIntent(). Returns { say, title, text }; never throws.
 *  deps: exec(cmd, args) → stdout, now() → Date, home, lookup(host) → address (for the DNS check). */
export async function diagnose(intent, deps = {}) {
  const d = { exec: realExec, now: () => new Date(), home: homedir(), lookup: (h) => dns.lookup(h), ...deps };
  try {
    const fn = DO[intent?.topic];
    return fn ? await fn(d) : out("I don't know how to check that.");
  } catch {
    return out("I couldn't check that just now.");
  }
}
