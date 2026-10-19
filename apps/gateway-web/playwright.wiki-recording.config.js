const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e/full',
  testMatch: /wiki-recording\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 900_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18080',
    trace: 'off',
    screenshot: 'off',
    ...devices['Desktop Chrome'],
    launchOptions: { slowMo: 0 },
  },
});
