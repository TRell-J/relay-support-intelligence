import { defineConfig, devices } from '@playwright/test';

/**
 * Workflow tests.
 *
 * Every test starts from a fresh browser context, which means fresh
 * sessionStorage, which means the seeded state — so no test depends on another
 * having reset it (ADR D-004).
 *
 * Set PLAYWRIGHT_BASE_URL to run the same suite against a deployed build
 * instead of a local dev server. The suite drives the UI and asserts on state
 * it created, so it is a real smoke test of a deployment, not a health check.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const isRemote = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
  ],
  // A deployed target needs no server started for it.
  ...(isRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000/help',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
