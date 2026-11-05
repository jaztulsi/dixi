// Builds qa/dashboard.html from qa/results/*.json, qa/STATUS.md and qa/feedback/*.md: the QA, performance,
// reliability and retrieval dashboards plus the release-readiness score. Static, no libraries, opens offline.
//   node qa/dashboard.js        (npm run qa calls it at the end)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QA = path.dirname(fileURLToPath(import.meta.url));
const BUDGET = 2000;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pctTxt = (x) => (x == null || Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);
const msTxt = (x) => (x == null ? '–' : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);

export function load() {
  const dir = path.join(QA, 'results');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  const runs = files.filter((f) => /^run-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const soaks = files.filter((f) => /^soak-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  // Bugs: "## BUG-001 · blocker · open · title" in qa/feedback/<feature>.md
  const bugs = [];
  const fb = path.join(QA, 'feedback');
  for (const f of fs.existsSync(fb) ? fs.readdirSync(fb).filter((x) => x.endsWith('.md')) : []) {
    for (const m of fs.readFileSync(path.join(fb, f), 'utf8').matchAll(/^## (BUG-\d+) · (blocker|major|minor) · (\w+) · (.+)$/gm)) bugs.push({ id: m[1], sev: m[2], state: m[3], title: m[4], feature: f.replace(/\.md$/, '') });
  }
  // Features: the table rows of qa/STATUS.md (| feature | owner | status | last tested | p95 | open bugs | notes |)
  const status = fs.existsSync(path.join(QA, 'STATUS.md')) ? fs.readFileSync(path.join(QA, 'STATUS.md'), 'utf8') : '';
  const features = status.split('\n').filter((l) => /^\| `/.test(l)).map((l) => {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    return { id: c[0].replace(/`/g, ''), owner: c[1], status: c[2], tested: c[3], p95: c[4], bugs: c[5], notes: c[6] };
  });
  return { runs, soaks, bugs, features };
}

// ---- marks ----
const STATE = { pass: ['good', '✓', 'Pass'], passing: ['good', '✓', 'Passing'], fail: ['critical', '✕', 'Fail'], failing: ['critical', '✕', 'Failing'], flaky: ['warning', '≈', 'Flaky'], blocked: ['serious', '■', 'Blocked'], building: ['muted', '…', 'Building'], 'ready for qa': ['info', '→', 'Ready for QA'], 'not started': ['muted', '○', 'Not started'], skip: ['muted', '–', 'Skipped'], error: ['critical', '!', 'Error'] };
const pill = (s) => { const k = String(s ?? '').toLowerCase().replace(/\*/g, '').trim(); const [c, i, label] = STATE[k] ?? ['muted', '·', s || '–']; return `<span class="pill ${c}">${i} ${esc(label)}</span>`; };

/** Horizontal bars, one row per item. rows: [{ label, value, color?, title? }]; budget draws a dashed line. */
function hbars(rows, { max, budget, fmt = String, w = 640 } = {}) {
  if (!rows.length) return '<p class="empty">No data yet.</p>';
  const L = 170, R = 70, rowH = 26, H = rows.length * rowH + 24;
  const top = Math.max(max ?? 0, budget ?? 0, ...rows.map((r) => r.value ?? 0)) || 1;
  const x = (v) => L + ((w - L - R) * v) / top;
  const bars = rows.map((r, i) => {
    const y = 6 + i * rowH, v = r.value ?? 0;
    return `<g><title>${esc(r.title ?? `${r.label}: ${fmt(v)}`)}</title>
      <rect x="0" y="${y}" width="${w}" height="${rowH}" fill="transparent"/>
      <text x="${L - 8}" y="${y + 16}" text-anchor="end" class="lab">${esc(r.label)}</text>
      <rect x="${L}" y="${y + 5}" width="${Math.max(2, x(v) - L)}" height="14" rx="3" fill="var(--${r.color ?? 's1'})"/>
      <text x="${Math.max(2, x(v)) + 6}" y="${y + 16}" class="val">${esc(fmt(v))}</text></g>`;
  }).join('');
  const b = budget ? `<line x1="${x(budget)}" x2="${x(budget)}" y1="0" y2="${H - 18}" class="budget"/><text x="${x(budget)}" y="${H - 4}" text-anchor="middle" class="lab">budget ${fmt(budget)}</text>` : '';
  return `<svg viewBox="0 0 ${w} ${H}" role="img" class="chart"><line x1="${L}" x2="${L}" y1="0" y2="${H - 18}" class="axis"/>${bars}${b}</svg>`;
}

/** Lines over runs. series: [{ name, color, points: [{ x: label, y }] }], y in [0, yMax]. */
function lines(series, { yMax = 1, fmt = pctTxt, w = 640, h = 220, budget } = {}) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  if (xs.length < 1) return '<p class="empty">No data yet.</p>';
  const L = 48, R = 110, T = 12, B = 28;
  const top = Math.max(yMax, budget ?? 0, ...series.flatMap((s) => s.points.map((p) => p.y ?? 0)));
  const X = (i) => L + (xs.length === 1 ? (w - L - R) / 2 : ((w - L - R) * i) / (xs.length - 1));
  const Y = (v) => T + (h - T - B) * (1 - v / top);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${w - R}" y1="${Y(top * f)}" y2="${Y(top * f)}" class="grid"/><text x="${L - 6}" y="${Y(top * f) + 4}" text-anchor="end" class="lab">${esc(fmt(top * f))}</text>`).join('');
  const b = budget ? `<line x1="${L}" x2="${w - R}" y1="${Y(budget)}" y2="${Y(budget)}" class="budget"/><text x="${w - R + 4}" y="${Y(budget) + 4}" class="lab">budget</text>` : '';
  const ticks = xs.map((x, i) => (xs.length <= 8 || i % Math.ceil(xs.length / 8) === 0 ? `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" class="lab">${esc(x)}</text>` : '')).join('');
  const marks = series.map((s) => {
    const pts = s.points.filter((p) => p.y != null).map((p) => ({ ...p, i: xs.indexOf(p.x) }));
    if (!pts.length) return '';
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.i)},${Y(p.y)}`).join('');
    const last = pts.at(-1);
    // ponytail: native <title> tooltips per point; a crosshair tooltip if these charts get dense
    return `<path d="${d}" fill="none" stroke="var(--${s.color})" stroke-width="2"/>
      ${pts.map((p) => `<circle cx="${X(p.i)}" cy="${Y(p.y)}" r="4" fill="var(--${s.color})" stroke="var(--surface)" stroke-width="2"><title>${esc(`${s.name} · ${p.x}: ${fmt(p.y)}`)}</title></circle>`).join('')}
      <text x="${X(last.i) + 8}" y="${Y(last.y) + 4}" class="val">${esc(s.name)}</text>`;
  }).join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:var(--${s.color})"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<svg viewBox="0 0 ${w} ${h}" role="img" class="chart">${grid}${b}${ticks}${marks}</svg>`;
}
const tile = (label, value, sub = '', cls = '') => `<div class="tile ${cls}"><div class="tl">${esc(label)}</div><div class="tv">${value}</div><div class="ts">${sub}</div></div>`;
const table = (head, rows) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="empty">None.</td></tr>`}</tbody></table></div>`;

export function build() {
  const { runs, soaks, bugs, features } = load();
  const latest = runs.at(-1) ?? { tests: [], latency: [], stages: {}, checks: [], errors: [], perf: {} };
  const label = (r) => r.at.slice(5, 16).replace('T', ' ');
  const open = bugs.filter((b) => b.state === 'open');
  const sevCount = (s) => open.filter((b) => b.sev === s).length;

  // ---- release gate ----
  const simple = latest.perf?.simple?.totalMs;
  const lastStage = (s) => [...runs].reverse().find((r) => r.stages?.[s])?.stages[s];
  const soak = soaks.at(-1);
  const gates = [
    ['Every feature passing on this Mac', features.length > 0 && features.every((f) => /passing/i.test(f.status)), `${features.filter((f) => /passing/i.test(f.status)).length}/${features.length} features`],
    ['No open blocker or major bugs', sevCount('blocker') + sevCount('major') === 0, `${sevCount('blocker')} blocker · ${sevCount('major')} major`],
    ['p95 of simple commands ≤ 2 s', simple?.p95 != null && simple.p95 <= BUDGET, simple?.p95 != null ? `p95 ${msTxt(simple.p95)} (n=${simple.n})` : 'not measured'],
    ['Soak test clean', soak?.status === 'pass', soak ? `${soak.minutes} min · ${soak.status}` : 'not run'],
    ['Clean install + upgrade tested', features.some((f) => f.id === 'packaging' && /passing/i.test(f.status)), 'needs a signed build'],
    ['Secrets scan clean', lastStage('secrets')?.status === 'pass', lastStage('secrets')?.summary ?? 'not run'],
    ['Unit + gate suites green', ['unit', 'gate'].every((s) => lastStage(s)?.status === 'pass'), ['unit', 'gate'].map((s) => `${s}: ${lastStage(s)?.status ?? '–'}`).join(' · ')],
  ];
  const score = Math.round((100 * gates.filter((g) => g[1]).length) / gates.length);

  // ---- QA ----
  const byFeature = {};
  for (const t of latest.tests) (byFeature[t.feature] ??= []).push(t);
  const featureRows = features.map((f) => {
    const ts = byFeature[f.id] ?? [];
    const pass = ts.filter((t) => t.status === 'pass').length;
    return [`<code>${esc(f.id)}</code>`, esc(f.owner), pill(f.status), esc(f.tested), ts.length ? `${pass}/${ts.length}` : '–', esc(f.p95), esc(f.bugs)];
  });
  const trend = [{ name: 'pass rate', color: 's1', points: runs.map((r) => ({ x: label(r), y: r.tests.length ? r.tests.filter((t) => t.status === 'pass').length / r.tests.filter((t) => t.status !== 'skip').length : null })) }];
  const flaky = runs.flatMap((r) => r.tests.filter((t) => t.status === 'flaky').map((t) => ({ ...t, at: label(r) })));
  const flakyRows = Object.values(Object.fromEntries(flaky.map((t) => [t.id, t]))).map((t) => [esc(t.id), `<code>${esc(t.loc ?? t.stage)}</code>`, `${t.fails ?? '?'}/${t.runs ?? '?'} runs failed`, esc(t.at)]);
  const failing = latest.tests.filter((t) => t.status === 'fail' || t.status === 'blocked');

  // ---- performance ----
  const types = Object.keys(latest.perf ?? {});
  const perfBars = types.flatMap((ty) => [
    { label: `${ty} p50`, value: latest.perf[ty].totalMs.p50, color: 's1' },
    { label: `${ty} p95`, value: latest.perf[ty].totalMs.p95, color: latest.perf[ty].totalMs.p95 > BUDGET && ty === 'simple' ? 'critical' : 's7' },
  ]).filter((r) => r.value != null);
  const SEG = [['listenMs', 'listen'], ['routeMs', 'route'], ['modelMs', 'model'], ['toolMs', 'tool'], ['speakMs', 'speak (first audio)']];
  const segRows = types.flatMap((ty) => SEG.map(([k, n]) => [esc(ty), n, msTxt(latest.perf[ty][k].p50), msTxt(latest.perf[ty][k].p95), String(latest.perf[ty][k].n)]));
  const latTrend = types.map((ty, i) => ({ name: ty, color: `s${i + 1}`, points: runs.map((r) => ({ x: label(r), y: r.perf?.[ty]?.totalMs?.p95 ?? null })) }));
  const cmdRows = latest.latency.map((l) => [esc(l.id), esc(l.type), msTxt(l.totalMs), msTxt(l.firstActMs), msTxt(l.routeMs) + (l.routeSource ? ` <span class="muted">${esc(l.routeSource)}</span>` : ''), msTxt(l.modelMs), String(l.aiCalls ?? 0), msTxt(l.toolMs), msTxt(l.speakMs), l.type === 'simple' && l.totalMs > BUDGET ? pill('fail') : '']);

  // ---- reliability ----
  const live = latest.tests.filter((t) => ['commands', 'failures', 'e2e', 'retrieval'].includes(t.stage));
  const relByFeature = Object.entries(Object.groupBy?.(live, (t) => t.feature) ?? {}).map(([f, ts]) => ({ label: f, value: ts.filter((t) => t.status === 'fail').length / ts.length, color: 'critical', title: `${f}: ${ts.filter((t) => t.status === 'fail').length} of ${ts.length} failed` })).sort((a, b) => b.value - a.value);
  const errTypes = Object.entries(Object.groupBy?.(latest.errors ?? [], (e) => e.type) ?? {}).map(([k, es]) => ({ label: k, value: es.length, color: 's2', title: es.slice(0, 3).map((e) => e.text).join(' | ') })).sort((a, b) => b.value - a.value);
  const retried = live.filter((t) => t.retried);
  const retryRate = retried.length ? retried.filter((t) => t.retryOk).length / retried.length : null;
  const crashes = runs.reduce((a, r) => a + (r.crashes ?? 0), 0) + soaks.reduce((a, s) => a + (s.crashes ?? 0), 0);
  const relTrend = [{ name: 'live failure rate', color: 's8', points: runs.map((r) => { const l = r.tests.filter((t) => ['commands', 'failures', 'e2e'].includes(t.stage)); return { x: label(r), y: l.length ? l.filter((t) => t.status === 'fail').length / l.length : null }; }) }];

  // ---- retrieval ----
  const rr = runs.filter((r) => r.retrieval);
  const R = rr.at(-1)?.retrieval;
  const retTrend = [['hitAt3', 'hit@3', 's1'], ['citationAcc', 'citations', 's3'], ['idkRate', 'grounded IDK', 's7']].map(([k, n, c]) => ({ name: n, color: c, points: rr.map((r) => ({ x: label(r), y: r.retrieval[k] })) }));
  const retRows = (R?.rows ?? []).map((r) => [esc(r.q), r.expect ? `<code>${esc(r.expect)}</code>` : '<span class="muted">nothing</span>', r.rank ? String(r.rank) : '–', r.known ? 'answered' : "I don't know", esc(r.cited?.join(', ')), esc((r.say ?? '').slice(0, 140)), pill(r.ok ? 'pass' : 'fail')]);

  const soakBlock = soak ? `${lines([{ name: 'memory (MB)', color: 's1', points: soak.samples.map((s) => ({ x: `${Math.round(s.t / 60000)}m`, y: s.rssMB })) }], { yMax: 100, fmt: (v) => `${Math.round(v)} MB` })}
    ${lines([{ name: 'CPU %', color: 's2', points: soak.samples.map((s) => ({ x: `${Math.round(s.t / 60000)}m`, y: s.cpu })) }], { yMax: 10, fmt: (v) => `${v.toFixed(0)}%` })}
    <p class="muted">${esc(soak.at)} · ${soak.minutes} min · ${soak.commands} commands · leak slope ${soak.leakMBPerHour?.toFixed?.(1) ?? '–'} MB/h · ${soak.crashes} crashes · ${pill(soak.status)}</p>` : '<p class="empty">No soak run yet: <code>node qa/soak.js --minutes 60</code></p>';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dixi QA</title><style>
:root{--surface:#fcfcfb;--page:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#6250d6;--s8:#e34948;--good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;--info:#2a78d6}
@media (prefers-color-scheme:dark){:root{--surface:#1a1a19;--page:#0d0d0d;--ink:#f0efec;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s7:#9085e9;--s8:#e66767;--info:#3987e5}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}
header{padding:20px 16px 8px;max-width:1180px;margin:auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}h3{font-size:14px;margin:18px 0 6px;color:var(--ink2)}
nav{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}nav a{color:var(--ink);text-decoration:none;border:1px solid var(--ring);border-radius:8px;padding:4px 10px;background:var(--surface)}nav a:focus-visible{outline:2px solid var(--s1)}
main{max-width:1180px;margin:auto;padding:0 16px 40px}section{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:4px 16px 16px;margin:16px 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}.tile{border:1px solid var(--ring);border-radius:10px;padding:10px 12px}.tl{color:var(--ink2);font-size:12px}.tv{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums}.ts{color:var(--muted);font-size:12px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}.chart{width:100%;height:auto;display:block}.lab{fill:var(--muted);font-size:11px}.val{fill:var(--ink2);font-size:11px;font-variant-numeric:tabular-nums}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis)}.budget{stroke:var(--critical);stroke-width:1.5;stroke-dasharray:5 4}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:4px 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--grid);vertical-align:top}th{color:var(--ink2);font-weight:600}
.pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:12px;white-space:nowrap;border:1px solid currentColor}
.pill.good{color:var(--good)}.pill.critical{color:var(--critical)}.pill.warning{color:#a06d00}.pill.serious{color:#b4532a}.pill.muted{color:var(--muted)}.pill.info{color:var(--info)}
@media (prefers-color-scheme:dark){.pill.warning{color:var(--warning)}.pill.serious{color:var(--serious)}}
.score{font-size:44px}.gate td:first-child{width:28px}.muted{color:var(--muted)}.empty{color:var(--muted);font-style:italic}code{font:12px ui-monospace,Menlo,monospace}
</style></head><body>
<header><h1>Dixi QA</h1><div class="muted">Built ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} · ${runs.length} runs · latest ${esc(latest.at ?? '–')} on ${esc(latest.sha ?? '')}${latest.dirtyFiles ? ` + ${latest.dirtyFiles} uncommitted files` : ''} · ${esc(latest.mac ?? '')}</div>
<nav><a href="#release">Release</a><a href="#qa">QA</a><a href="#perf">Performance</a><a href="#rel">Reliability</a><a href="#ret">Retrieval</a><a href="#soak">Soak</a></nav></header>
<main>
<section id="release"><h2>Release readiness</h2>
<div class="tiles">${tile('Readiness score', `<span class="score">${score}</span>`, `${gates.filter((g) => g[1]).length} of ${gates.length} gates`)}${tile('Open blockers', String(sevCount('blocker')), 'severity: blocker')}${tile('Open major', String(sevCount('major')))}${tile('Open minor', String(sevCount('minor')))}${tile('Failing / blocked now', String(failing.length), 'latest run')}</div>
<table class="gate"><tbody>${gates.map(([n, ok, d]) => `<tr><td>${pill(ok ? 'pass' : 'fail')}</td><td>${esc(n)}</td><td class="muted">${esc(d)}</td></tr>`).join('')}</tbody></table>
<p>${score === 100 ? '<b>Production ready.</b>' : '<b>Not production ready.</b> Every gate must pass.'}</p></section>

<section id="qa"><h2>QA</h2><h3>Feature status</h3>${table(['Feature', 'Owner', 'Status', 'Last tested', 'Latest run', 'p95', 'Open bugs'], featureRows)}
<div class="grid2"><div><h3>Pass rate over runs</h3>${lines(trend)}</div><div><h3>Open bugs by severity</h3>${hbars([['blocker', 'critical'], ['major', 'serious'], ['minor', 'warning']].map(([s, c]) => ({ label: s, value: sevCount(s), color: c })), { fmt: String })}</div></div>
<h3>Open bugs</h3>${table(['Bug', 'Severity', 'Feature', 'Title'], open.sort((a, b) => ['blocker', 'major', 'minor'].indexOf(a.sev) - ['blocker', 'major', 'minor'].indexOf(b.sev)).map((b) => [b.id, pill(b.sev === 'blocker' ? 'fail' : b.sev === 'major' ? 'blocked' : 'flaky').replace(/Fail|Blocked|Flaky/, b.sev), `<a href="feedback/${esc(b.feature)}.md">${esc(b.feature)}</a>`, esc(b.title)]))}
<h3>Flaky tests</h3>${table(['Test', 'Where', 'How often', 'Seen'], flakyRows)}
<h3>Failing in the latest run</h3>${table(['Stage', 'Test', 'Feature', 'Status', 'Why'], failing.map((t) => [esc(t.stage), esc(t.id), esc(t.feature), pill(t.status), esc(t.error ?? '')]))}
<h3>Stages</h3>${table(['Stage', 'Status', 'Time', 'Summary'], Object.entries(latest.stages).map(([s, v]) => [s, pill(v.status), msTxt(v.ms), esc(v.summary)]))}</section>

<section id="perf"><h2>Performance</h2><p class="muted">From the last word said to done (last step finished or first spoken audio). Text mode: the harness's end of turn adds ~450 ms where real Flux takes ~200 ms. Simple commands must finish in ≤ 2 s.</p>
<div class="tiles">${types.map((ty) => tile(`${ty} p95`, msTxt(latest.perf[ty].totalMs.p95), `p50 ${msTxt(latest.perf[ty].totalMs.p50)} · n=${latest.perf[ty].totalMs.n}`, ty === 'simple' && latest.perf[ty].totalMs.p95 > BUDGET ? 'bad' : '')).join('') || tile('No live run yet', '–')}</div>
<div class="grid2"><div><h3>p50 / p95 by command type</h3>${hbars(perfBars, { budget: BUDGET, fmt: msTxt })}</div><div><h3>p95 over runs</h3>${lines(latTrend, { yMax: BUDGET, budget: BUDGET, fmt: msTxt })}</div></div>
<h3>Per step (p50 / p95)</h3>${table(['Type', 'Step', 'p50', 'p95', 'n'], segRows)}
<h3>Every command, latest run</h3>${table(['Command', 'Type', 'Total', 'First action', 'Route', 'Model', 'AI calls', 'Tool', 'Speak', ''], cmdRows)}</section>

<section id="rel"><h2>Reliability</h2>
<div class="tiles">${tile('Live failure rate', pctTxt(live.length ? live.filter((t) => t.status === 'fail').length / live.length : null), `${live.length} live checks`)}${tile('Retry success', pctTxt(retryRate), `${retried.length} retried`)}${tile('Crashes', String(crashes), 'all runs + soaks')}${tile('Errors logged', String((latest.errors ?? []).length), 'latest run')}</div>
<div class="grid2"><div><h3>Failure rate by feature</h3>${hbars(relByFeature, { max: 1, fmt: pctTxt })}</div><div><h3>Most common error types</h3>${hbars(errTypes, { fmt: String })}</div></div>
<h3>Failure rate over runs</h3>${lines(relTrend)}
<h3>Errors, latest run</h3>${table(['Type', 'Feature', 'Command', 'Text'], (latest.errors ?? []).slice(0, 40).map((e) => [esc(e.type), esc(e.feature ?? ''), esc(e.id ?? ''), `<code>${esc(e.text)}</code>`]))}</section>

<section id="ret"><h2>Retrieval quality</h2><p class="muted">A fixed folder of files with known facts, indexed for real (FTS5 + macOS on-device embeddings), answered by the app's own fast-model chain.</p>
<div class="tiles">${tile('Hit @ 3', pctTxt(R?.hitAt3))}${tile('Answers right', pctTxt(R?.answerAcc))}${tile('Citations right', pctTxt(R?.citationAcc))}${tile('Grounded "I don\'t know"', pctTxt(R?.idkRate), 'when nothing answers')}${tile('False "I don\'t know"', pctTxt(R?.falseIdk))}${tile('Secrets read out', String(R?.secretLeaks ?? '–'))}</div>
<h3>Over runs</h3>${lines(retTrend)}
<h3>Questions, latest run</h3>${table(['Question', 'Answer is in', 'Rank', 'Said', 'Cited', 'Answer', ''], retRows)}</section>

<section id="soak"><h2>Soak</h2>${soakBlock}</section>
</main></body></html>`;
  fs.writeFileSync(path.join(QA, 'dashboard.html'), html);
  return { score, gates };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(build());
