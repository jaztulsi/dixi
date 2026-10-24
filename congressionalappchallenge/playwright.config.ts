import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3001' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3001', reuseExistingServer: true, timeout: 120_000 },
});
