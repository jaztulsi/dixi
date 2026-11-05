// npm test: the unit suite, offline (test/no-network.js), each test ≤ 20 s, and the whole run ≤ 30 s (the speed gate).
import { spawnSync } from 'node:child_process';
const LIMIT_MS = Number(process.env.DIXI_TEST_GATE_MS || 30000);
const t0 = Date.now();
const r = spawnSync(process.execPath, ['--test', '--test-timeout=20000', '--import', './test/no-network.js', ...process.argv.slice(2)], { stdio: 'inherit' });
const ms = Date.now() - t0;
if (r.status === 0 && ms > LIMIT_MS) { console.error(`\n✖ gate: the suite took ${ms} ms, over ${LIMIT_MS} ms (slowest: index.test retrieval check, ~41 on-device osascript embeddings)`); process.exit(1); }
console.error(`gate: ${ms} ms wall (limit ${LIMIT_MS})`);
process.exit(r.status ?? 1);
