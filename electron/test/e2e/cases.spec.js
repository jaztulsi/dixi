// Break-it suite: 100 real spoken tasks (cases.js) through the real app, real AI, real websites.
// Each command is fed word by word the way Flux delivers speech (~4 updates a second), then checked
// for what actually happened. Run a slice with CASES=1-20, repeat with ROUNDS=3.
// Results: test-results/cases.json (per case: pass, seconds after the last word, AI calls).
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [from, to] = (process.env.CASES ?? `1-${CASES.length}`).split('-').map(Number);
const ROUNDS = Number(process.env.ROUNDS ?? 1);
const TIMEOUT_S = 15;   // after the last word
const WORD_MS = 240;    // Flux's update rhythm

test.setTimeout(0);

test('100 real tasks, said the messy way', async () => {
  // Own profile: never touches your real settings, and doesn't collide with an open copy of the app.
  const app = await electron.launch({ args: [root, `--user-data-dir=${path.join(root, 'test-results/profile')}`], cwd: root });
  const results = [];
  try {
    const page = await app.firstWindow();
    page.on('console', (m) => { if (m.type() === 'error') console.log('   [console]', m.text().slice(0, 200)); });
    await page.waitForFunction(() => (window.__app = window.__dixi));
    await page.evaluate(async () => {
      const { voice, llm, tabs, agent } = window.__app;
      await voice.stop();  // only our words, never the room
      window.__aiCalls = 0;
      const transport = llm.transport;
      llm.transport = (body) => { window.__aiCalls++; return transport(body); };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Helpers the checks use.
      Object.assign(window, {
        url: async (re) => re.test(tabs.getCurrentURL()),
        js: async (code) => String(await tabs.executeJS(code)),
        answer: async (re) => re.test(voice.answer?.text ?? ''),
        done: async (re) => voice.plan.some((p) => p.state === 'done' && re.test(p.label)),  // the step's own result, not what was said
        result: async (re) => re.test(agent.finalResult ?? ''),
        tabCount: async () => tabs.visibleTabs.length,
        zoom: async () => tabs.activeTab?.webview.getZoomLevel() ?? 0,
      });
      window.__reset = async () => {
        voice.cancelAll();
        for (let i = 0; i < 50 && agent.isRunning; i++) await sleep(100);
        voice.resetDispatchState();
        Object.assign(voice, { plan: [], pendingSteps: [], answer: null, lastNavigatedSite: null, navigating: Promise.resolve() });
        voice.session.history = [];
        for (const t of [...tabs.tabs]) tabs.closeTab(t.id);
        tabs.createTab('about:blank');
        window.__aiCalls = 0;
      };
      window.__setup = async (u, code) => {
        await tabs.navigate(u);
        if (code) for (let i = 0; i < 40 && !String(await tabs.executeJS(code)).startsWith('ok'); i++) await sleep(250);
      };
      // Flux-style: the whole turn so far, ~4x a second; then end of turn.
      window.__say = async (text, wordMS) => {
        voice.awakeUntil = Date.now() + 1e9;  // as if the wake word was said (works whatever it's called)
        const words = text.split(' ');
        const send = (event, transcript) => voice.handleMessage(JSON.stringify({ type: 'TurnInfo', event, transcript }));
        for (let i = 1; i <= words.length; i++) { send('Update', words.slice(0, i).join(' ')); await sleep(wordMS); }
        const done = /[.?!]$/.test(text) ? text : `${text}${/^(who|what|how|when|where|why|is|are|does|do|can)\b/i.test(text) ? '?' : '.'}`;
        send('Update', done);
        const lastWord = performance.now();
        await sleep(300);
        send('EndOfTurn', done);
        return lastWord;
      };
      window.__check = (src) => new Function(`return (async () => (${src}))()`);
    });

    for (let round = 1; round <= ROUNDS; round++) {
      for (let n = from; n <= to; n++) {
        const c = CASES[n - 1];
        await page.evaluate(() => window.__reset());
        if (c.setup) await page.evaluate(({ url, js }) => window.__setup(url, js), c.setup);
        const r = await page.evaluate(async ({ c, TIMEOUT_S, WORD_MS }) => {
          const check = window.__check(c.check);
          const lastWord = await window.__say(c.say, WORD_MS);
          for (;;) {
            const s = (performance.now() - lastWord) / 1000;
            let ok = false;
            try { ok = Boolean(await check()); } catch {}
            if (ok || s > TIMEOUT_S) {
              const { voice, tabs } = window.__app;
              return { pass: ok, s: ok ? s : null, ai: window.__aiCalls, url: tabs.getCurrentURL().slice(0, 100),
                plan: voice.plan.map((p) => `${p.label} [${p.state}]`).join(' | '), answer: voice.answer?.text ?? '' };
            }
            await new Promise((res) => setTimeout(res, 100));
          }
        }, { c, TIMEOUT_S, WORD_MS });
        results.push({ n, round, say: c.say, ...r });
        console.log(`${r.pass ? 'PASS' : 'FAIL'} ${String(n).padStart(3)} ${r.pass ? `${r.s.toFixed(2)}s` : '  -  '} ai=${r.ai}  "${c.say}"${r.pass ? '' : `\n       url: ${r.url}\n       plan: ${r.plan}${r.answer ? `\n       answer: ${r.answer}` : ''}`}`);
      }
    }
  } finally {
    await app.close();
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test-results/cases.json'), JSON.stringify(results, null, 2));
  }
  const passed = results.filter((r) => r.pass);
  const times = passed.map((r) => r.s).sort((a, b) => a - b);
  console.log(`\n${passed.length}/${results.length} passed · median ${times[times.length >> 1]?.toFixed(2)}s · slowest ${times.at(-1)?.toFixed(2)}s after the last word · ${results.reduce((a, r) => a + r.ai, 0)} AI calls`);
  expect(passed.length).toBe(results.length);
});
