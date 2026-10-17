// Orders straight through the executor on the live stores (no voice, no AI calls, so no cost): checks
// that each product really lands in the cart, and how long it takes, step by step.
//   node eval/orders.js                       every Apple product family below
//   node eval/orders.js "iPad Air" "HomeView"  just these (no store named: the Apple shortcut)
// Adds to a throwaway test profile's cart only; never checks out.
import { launchApp } from './harness.js';

const items = process.argv.slice(2).length ? process.argv.slice(2)
  : ['iPhone 18 Pro', 'iPhone 18 Pro Max in black', 'iPhone 18 Pro with 512GB in silver', 'MacBook Air', 'iMac', 'iPad Air', 'Apple Watch Series 12', 'AirPods Pro', 'HomeView'];
const { app, page } = await launchApp({ env: { DIXI_VISION: 'none:none', DIXI_AGENT: 'none:none' } });
let ok = 0;
for (const item of items) {
  const t0 = Date.now();
  await page.evaluate((item) => window.__dixi.execute({ clarify: '', steps: [{ act: 'order', said: '', item }] }, { said: `buy me ${item}` }), item);
  const [r] = await page.evaluate(() => window.__dixi.voice.plan.map((p) => ({ label: p.label, state: p.state })));
  if (r?.state === 'done') ok++;
  console.log(`${r?.state === 'done' ? 'ADDED' : 'FAIL '}  ${String(Date.now() - t0).padStart(6)}ms  ${item.padEnd(36)} ${r?.label ?? ''}`);
}
console.log(`\n${ok}/${items.length} added`);
await app.close();
