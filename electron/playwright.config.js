// End-to-end tests drive the real Electron app with live Groq + Deepgram (keys from .env).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 150_000,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
});
