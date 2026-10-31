import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doctorIntent, diagnose, DOCTOR, parseProcs, parseDf, parseBoot, parsePower, parseHardware, parseGateway, parseWifiName, pingOk, parseFreePct, gigs } from '../../src/main/doctor.js';
import { desktopIntent } from '../../src/main/desktop.js';

const PS = `  3.1  4194304 Google Chrome
 92.5  1048576 Google Chrome Helper (Renderer)
  8.0  2097152 Google Chrome Helper (GPU)
 40.2  1500000 WindowServer
  1.0   300000 Slack
  0.0     1200 ps`;
const DF = `Filesystem   1024-blocks      Used Available Capacity iused ifree %iused  Mounted on
/dev/disk3s1s1   488245288  15000000  12582912    93%  400000 125829120    0%   /`;
const POWER = `Battery Information:
      Cycle Count: 312
      Condition: Normal
      Maximum Capacity: 91%`;
const HW = `Hardware Overview:
      Model Name: MacBook Air
      Chip: Apple M2
      Memory: 16 GB`;
const PORTS = 'Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: aa';
const PING_OK = '2 packets transmitted, 2 packets received, 0.0% packet loss';
const PING_BAD = '2 packets transmitted, 0 packets received, 100.0% packet loss';
const NOW = new Date(2026, 9, 30, 12);

// A fake exec: answers by program name from `r`; a function result may be an Error.
const rig = (r = {}) => {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const v = typeof r[cmd] === 'function' ? r[cmd](args) : r[cmd];
    if (v instanceof Error || v === undefined) throw v ?? new Error('no');
    return v;
  };
  return { calls, deps: { exec, now: () => NOW, home: '/Users/sam', lookup: async () => '17.0.0.1' } };
};
const ask = (topic, r) => { const g = rig(r); return diagnose({ verb: 'doctor', topic }, g.deps).then((o) => ({ ...o, calls: g.calls })); };

test('phrasings match the right topic', () => {
  const cases = {
    slow: ['why is my Mac slow', 'Why is my computer so slow?', 'why is everything slow', 'Dixi, why is my laptop running slow'.replace('running ', '')],
    memory: ["what's using my memory", 'what is taking up all my RAM', 'am I out of memory'],
    space: ['am I running out of space', 'how much storage do I have', 'is my disk full', 'how much free space do I have'],
    net: ['is my internet working', 'why is my wifi not working', 'why is my Wi-Fi down', 'am I connected to the internet'],
    battery: ['is my battery healthy', 'check my battery health', 'how many battery cycles do I have'],
    fan: ['why is my fan loud', 'why is my Mac so hot', 'why is my fan so loud?'],
    model: ["what's my Mac", 'what Mac do I have', 'what version of macOS am I on'],
    uptime: ['when did I last restart', 'how long has my Mac been on', 'when was my Mac last restarted'],
  };
  for (const [topic, lines] of Object.entries(cases)) for (const l of lines) {
    assert.equal(doctorIntent(l)?.topic, topic, l);
    assert.ok(DOCTOR.test(l), l);
  }
});

test('must not match', () => {
  for (const l of ['why is this page slow to load', 'what is this', 'battery', "what's my battery", 'how much battery do I have', 'quit Chrome', 'open youtube.com', '', 'why is my website slow']) {
    assert.equal(doctorIntent(l), null, l);
    assert.ok(!DOCTOR.test(l), l);
  }
  assert.equal(doctorIntent(null), null);
  assert.equal(desktopIntent('is my battery healthy'), null, 'no overlap with S9');
});

test('parsers read real output', () => {
  const p = parseProcs(PS);
  assert.deepEqual(p.find((x) => x.name === 'Google Chrome'), { name: 'Google Chrome', cpu: 103.6, rss: 7340032 });
  assert.ok(!p.some((x) => x.name === 'ps'));
  assert.deepEqual(parseDf(DF), { totalKb: 488245288, availKb: 12582912 });
  assert.equal(parseDf('garbage'), null);
  assert.equal(parseBoot('kern.boottime: { sec = 1761000000, usec = 0 } Mon Oct 20 2025')?.getTime(), 1761000000000);
  assert.deepEqual(parsePower(POWER), { cycles: 312, capacity: 91, condition: 'Normal' });
  assert.deepEqual(parseHardware(HW), { name: 'MacBook Air', chip: 'Apple M2', memory: '16 GB' });
  assert.equal(parseGateway('   gateway: 192.168.1.1\n  interface: en0'), '192.168.1.1');
  assert.equal(parseGateway('route: writing to routing socket: not in table'), null);
  assert.equal(parseWifiName('Current Wi-Fi Network: Home'), 'Home');
  assert.equal(parseWifiName('You are not associated with an AirPort network.'), null);
  assert.ok(pingOk(PING_OK)); assert.ok(!pingOk(PING_BAD)); assert.ok(!pingOk(''));
  assert.equal(parseFreePct('System-wide memory free percentage: 42%'), 42);
  assert.equal(gigs(12 * 1073741824), 'about 12 gigabytes');
  assert.equal(gigs(4.2 * 1073741824), 'about 4 gigabytes');
  assert.equal(gigs(0.3 * 1073741824), 'about 0.3 gigabytes');
});

test('memory names the biggest app and offers to quit it', async () => {
  const r = await ask('memory', { ps: PS, sysctl: '17179869184' });
  assert.equal(r.say, 'Google Chrome is using the most, about 7 gigabytes of your 16. Say “quit Google Chrome” if you want.');
  assert.deepEqual(r.calls[0], ['ps', '-Aceo', 'pcpu,rss,comm', '-r']);
});

test('slow: a busy app, otherwise reassurance; never offers to quit macOS parts', async () => {
  assert.match((await ask('slow', { ps: PS })).say, /^Google Chrome is working very hard/);
  const calm = await ask('slow', { ps: '40.2 1500000 WindowServer\n 1.0 300000 Slack', memory_pressure: 'System-wide memory free percentage: 60%', df: DF.replace('12582912', '300000000') });
  assert.match(calm.say, /^Nothing looks wrong/);
  const low = await ask('slow', { ps: '1.0 300000 Slack', memory_pressure: 'System-wide memory free percentage: 8%', df: DF.replace('12582912', '300000000') });
  assert.match(low.say, /low on memory.*Slack.*quit Slack/);
});

test('space: rounded numbers, and where the space went', async () => {
  const ok = await ask('space', { df: DF.replace('12582912', '300000000'), du: ['-sk'].length && ((a) => `100\t${a[1]}`) });
  assert.equal(ok.say, 'You have about 286 gigabytes free of 466. That is plenty.');
  const full = await ask('space', { df: DF.replace('488245288', '488245288'), du: (a) => `${a[1].endsWith('Downloads') ? 9437184 : 100}\t${a[1]}` });
  assert.match(full.say, /^You have about 12 gigabytes free of 466\. That is getting full\. Your Downloads holds about 9 gigabytes\. Say “open Downloads”/);
  assert.ok(full.calls.some((c) => c[0] === 'du' && c[2] === '/Users/sam/Downloads'));
  assert.ok(full.calls.some((c) => c[0] === 'du' && c[2] === '/Users/sam/.Trash'));
  const slowDu = await ask('space', { df: DF }); // du fails: skipped, still answers
  assert.match(slowDu.say, /getting full\.$/);
});

test('battery health', async () => {
  const pm = 'Now drawing from AC Power\n -InternalBattery-0 (id=1)\t84%; charging; 0:40 remaining';
  assert.match((await ask('battery', { pmset: pm, system_profiler: POWER })).say, /^Your battery is in good shape\. It holds about 91 percent of its original charge and has been charged 312 times\.$/);
  const worn = await ask('battery', { pmset: pm, system_profiler: POWER.replace('Normal', 'Service Recommended').replace('91', '72') });
  assert.match(worn.say, /wearing out.*72 percent.*open battery settings/);
  assert.equal((await ask('battery', { pmset: 'Now drawing from AC Power' })).say, 'This Mac has no battery.');
});

test('fan, model, uptime', async () => {
  assert.match((await ask('fan', { ps: PS })).say, /Google Chrome is working hard.*quit Google Chrome/);
  assert.match((await ask('fan', { ps: '1.0 3 Slack' })).say, /Nothing is working hard/);
  assert.equal((await ask('model', { system_profiler: HW, sw_vers: '15.1' })).say, 'You have a MacBook Air, Apple M2 with 16 gigabytes of memory, running macOS 15.1.');
  assert.equal((await ask('model', { sysctl: 'Mac14,2', sw_vers: '15.1' })).say, 'You have a Mac14,2, running macOS 15.1.');
  const boot = Math.floor(Number(NOW) / 1000) - 20 * 86400;
  assert.match((await ask('uptime', { sysctl: `{ sec = ${boot}, usec = 0 }` })).say, /^You last restarted 20 days ago\. A restart now and then/);
  assert.equal((await ask('uptime', { sysctl: 'x' })).say, "I couldn't tell when you last restarted.");
});

test('network says where it breaks', async () => {
  const base = { networksetup: (a) => (a[0] === '-listallhardwareports' ? PORTS : 'Current Wi-Fi Network: Home'), route: 'gateway: 192.168.1.1' };
  const pingBy = (ok) => (a) => (ok.includes(a[4]) ? PING_OK : Object.assign(new Error('100% loss'), { code: 2 }));
  assert.match((await ask('net', { ...base, ping: pingBy(['192.168.1.1', '1.1.1.1']) })).say, /working fine/);
  assert.match((await ask('net', { ...base, ping: pingBy([]) })).say, /^Your Wi-Fi is connected, but it can't reach your router/);
  assert.match((await ask('net', { ...base, ping: pingBy(['192.168.1.1']) })).say, /^Your Wi-Fi works; the problem is past your router\. Try restarting the router/);
  assert.match((await ask('net', { ...base, route: new Error('no'), networksetup: 'You are not associated with an AirPort network.' })).say, /not connected to Wi-Fi.*turn Wi-Fi on/);
  const g = rig({ ...base, ping: pingBy(['192.168.1.1', '1.1.1.1']) });
  g.deps.lookup = async () => { throw new Error('ENOTFOUND'); };
  assert.match((await diagnose({ topic: 'net' }, g.deps)).say, /website names/);
  assert.deepEqual(g.calls.find((c) => c[0] === 'ping'), ['ping', '-c', '2', '-t', '3', '192.168.1.1']);
});

test('read-only, never throws, no shell', async () => {
  const r = await ask('slow', {});
  assert.ok(r.say && r.title);
  assert.match((await diagnose({ topic: 'nope' }, rig().deps)).say, /don't know/);
  const g = rig({ ps: PS, df: DF, du: '5\tx', sysctl: '1' });
  for (const t of ['slow', 'memory', 'space', 'fan', 'uptime']) await diagnose({ topic: t }, g.deps);
  const allowed = new Set(['ps', 'sysctl', 'memory_pressure', 'df', 'du', 'pmset', 'system_profiler', 'sw_vers', 'networksetup', 'route', 'ping']);
  for (const [cmd, ...args] of g.calls) { assert.ok(allowed.has(cmd), cmd); assert.ok(!['-rf', 'rm', 'kill'].includes(args[0])); }
});
