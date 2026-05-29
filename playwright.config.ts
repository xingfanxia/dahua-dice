import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Per-test timeout: the dev server (Turbopack) compiles routes lazily, and the
  // bidding screen pulls in the heavy 3D bundle (three.js + Rapier WASM). On a cold
  // server + slower WebKit, the first full-game flow can exceed the 30s default.
  timeout: 90 * 1000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
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
