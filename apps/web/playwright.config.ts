import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// No browser download anywhere: CI uses the Google Chrome preinstalled on GitHub's ubuntu-24.04 runners;
// locally a Chromium path can be given (this repo's cloud dev machines have one at /opt/pw-browsers/chromium).
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const browser = process.env.CI ? { channel: 'chrome' } : existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {};

/** A migrated PostgreSQL database for e2e/fullstack.spec.ts; unset skips those tests. */
const fullstack = process.env.E2E_DATABASE_URL;
export const CORE_LOG = 'reports/core.log';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a browser test that only passes on retry is a bug to fix, not to hide
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'reports/e2e-junit.xml' }], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browser }, testIgnore: /fullstack/ },
    { name: 'phone', use: { ...devices['Pixel 7'], ...browser }, testIgnore: /fullstack/ },
    // The website against the real core API and PostgreSQL. Runs when a database is given (CI always gives one).
    ...(fullstack ? [{ name: 'fullstack', use: { ...devices['Desktop Chrome'], ...browser }, testMatch: /fullstack/ }] : []),
  ],
  webServer: [
    { command: 'pnpm start', url: 'http://localhost:3000/sv', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    ...(fullstack
      ? [
          {
            // Core in development mode writes account emails to its log; the tests read the links from there.
            // Ordering is open so the whole journey runs; without Stripe keys, core uses its test checkout (no money).
            command: `mkdir -p reports && exec node ../../services/core/dist/main.js > ${CORE_LOG} 2>&1`,
            url: 'http://localhost:4000/health/ready',
            reuseExistingServer: false,
            timeout: 60_000,
            env: { DATABASE_URL: fullstack, PORT: '4000', NODE_ENV: 'development', COOKIE_SECURE: 'false', PUBLIC_WEB_URL: 'http://localhost:3000', NO_COLOR: '1', ORDERING_ENABLED: 'true' },
          },
        ]
      : []),
  ],
});
