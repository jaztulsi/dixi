// End-to-end: launches the real app. Live Groq + Deepgram calls (keys from .env), real websites.
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = (name) => path.join(root, 'test/e2e/fixtures', name);

async function launch(env = {}) {
  const app = await electron.launch({ args: [root], cwd: root, env: { ...process.env, ...env } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => window.__runic);
  return { app, page, errors };
}
const url = (page) => page.evaluate(() => window.__runic.tabs.getCurrentURL());
const submit = (page, text) => page.evaluate((t) => { window.__runic.submit(t); }, text);

test.describe('typed commands (live)', () => {
  let app, page, errors;
  test.beforeAll(async () => ({ app, page, errors } = await launch()));
  test.afterAll(async () => app?.close());

  test('launches to the hands-free start page with no errors', async () => {
    await expect(page).toHaveTitle('Runic');
    await expect(page.locator('#start-page h1')).toHaveText('Just say what you want.');
    await expect(page.locator('#examples li')).toHaveCount(3);
    await expect(page.locator('#caption')).toBeVisible();
    await page.screenshot({ path: 'test-results/01-start.png' });
    expect(errors).toEqual([]);
  });

  test('"go to youtube" opens it with no AI call', async () => {
    await submit(page, 'go to youtube');
    await expect.poll(() => url(page), { timeout: 30_000 }).toContain('youtube.com');
    await expect(page.locator('#start-page')).toBeHidden();
  });

  test('"search for lofi beats" goes straight to results', async () => {
    await submit(page, 'search for lofi beats');
    await expect.poll(() => url(page), { timeout: 30_000 }).toContain('search_query=lofi%20beats');
  });

  test('"play the first video" opens a video (site action)', async () => {
    await submit(page, 'play the first video');
    await expect.poll(() => url(page), { timeout: 30_000 }).toContain('/watch');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test-results/02-video.png' });
  });

  test('question about the page is answered from the page, video untouched', async () => {
    const before = await url(page);
    await submit(page, 'Who uploaded this video and how many subscribers do they have?');
    await expect.poll(() => page.evaluate(() => window.__runic.voice.answer?.text ?? null), { timeout: 60_000 }).not.toBeNull();
    const answer = await page.evaluate(() => window.__runic.voice.answer);
    console.log('Answer:', answer);
    expect(answer.text.length).toBeGreaterThan(5);
    expect(await url(page)).toBe(before);
    await page.screenshot({ path: 'test-results/03-answer.png' });
  });

  test('AI agent completes a multi-step task on a site it has no shortcut for', async () => {
    await page.evaluate(() => window.__runic.tabs.navigate('https://en.wikipedia.org/wiki/Main_Page'));
    await submit(page, 'use the search box on this page to search for Golden Gate Bridge');
    await expect.poll(() => url(page), { timeout: 120_000, intervals: [2000] }).toMatch(/Golden_Gate_Bridge|search=Golden/i);
    const log = await page.evaluate(() => window.__runic.agent.log.map((e) => `${e.kind}: ${e.message}`));
    console.log(log.join('\n'));
    await page.screenshot({ path: 'test-results/04-agent.png' });
    expect(errors).toEqual([]);
  });
});

test('voice end to end: recorded speech → Deepgram → instant navigate + search (live)', async () => {
  // The WAV plays as the microphone (see RUNIC_FAKE_AUDIO in main.js): real mic pipeline, real Deepgram.
  const { app, page, errors } = await launch({ RUNIC_FAKE_AUDIO: fixture('voice-youtube-lofi.wav') });
  try {
    await expect.poll(() => page.evaluate(() => window.__runic.voice.isListening), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => url(page), { timeout: 40_000 }).toMatch(/youtube\.com\/results\?search_query=lofi/);
    // History is recorded when each step finishes, so wait for both.
    const history = () => page.evaluate(() => window.__runic.voice.session.history.map((h) => `${h.action} ${h.target} ${h.detail}`));
    await expect.poll(history, { timeout: 20_000 }).toContain('search youtube lofi beats');
    const heard = await history();
    console.log('Voice dispatched:', heard);
    expect(heard[0]).toMatch(/^open https:\/\/www\.youtube\.com/);
    await page.screenshot({ path: 'test-results/05-voice.png' });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
