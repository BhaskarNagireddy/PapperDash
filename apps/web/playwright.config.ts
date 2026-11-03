import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// No browser download anywhere: CI uses the Google Chrome preinstalled on GitHub's ubuntu-24.04 runners;
// locally a Chromium path can be given (this repo's cloud dev machines have one at /opt/pw-browsers/chromium).
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const browser = process.env.CI ? { channel: 'chrome' } : existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a browser test that only passes on retry is a bug to fix, not to hide
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'reports/e2e-junit.xml' }], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browser } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...browser } },
  ],
  webServer: { command: 'pnpm start', url: 'http://localhost:3000/sv', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
