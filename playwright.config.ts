import { defineConfig } from '@playwright/test';

// Extensions require a persistent context and Chromium's bundled build, so the
// suite runs single-threaded with no parallelism.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
});
