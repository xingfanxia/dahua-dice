import { defineConfig, devices } from '@playwright/test';

// Port is env-overridable so the suite can dodge a foreign dev server squatting on
// the default port — `reuseExistingServer` can't tell apps apart, so a stale :3000
// from another project would otherwise be silently reused and every test would run
// against the wrong app. Run on a free port: `PLAYWRIGHT_PORT=3100 pnpm e2e`.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Per-test timeout: the dev server (Turbopack) compiles routes lazily, so the
  // first cold-compile of a route (esp. on slower WebKit) can exceed the 30s default.
  timeout: 90 * 1000,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Pin Accept-Language so the suite runs against the zh-CN bundle (its string
    // assertions are Chinese). Without this, Chromium's default en-US would now
    // resolve to the English bundle via i18n's Accept-Language fallback.
    locale: 'zh-CN',
  },
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    // The suite creates many rooms/sessions from one shared localhost IP, which
    // would trip the per-IP rate limits. Disable them for the test server only.
    env: { RATE_LIMIT_DISABLED: '1' },
  },
  projects: [
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone 14 Pro'] },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
