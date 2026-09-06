/* eslint-disable */
const { defineConfig, devices } = require('@playwright/test');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const mockPort = Number(process.env.E2E_MOCK_PORT ?? 4010);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3100);
const mockOrigin = `http://127.0.0.1:${mockPort}`;
const built = existsSync(join(__dirname, '.next'));

const apiEnv = {
  CATALOG_API_URL: `${mockOrigin}/api/catalog`,
  CONTENT_API_URL: `${mockOrigin}/api/content`,
  AMENDMENT_API_URL: `${mockOrigin}/api/amendment`,
  SEARCH_API_URL: `${mockOrigin}/api/search`,
  IDENTITY_API_URL: `${mockOrigin}/api/identity`,
  EDITOR_API_URL: `${mockOrigin}/api/editor`,
  INGESTION_API_URL: `${mockOrigin}/api/ingestion`,
  SESSION_COOKIE_SECURE: 'false',
};

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_REMOTE
    ? undefined
    : [
        {
          command: 'node e2e/mock-api.mjs',
          url: `${mockOrigin}/health`,
          reuseExistingServer: !process.env.CI,
          env: { ...process.env, E2E_MOCK_PORT: String(mockPort) },
        },
        {
          command: built ? `npx next start -p ${webPort}` : `npx next dev -p ${webPort}`,
          url: `http://127.0.0.1:${webPort}`,
          reuseExistingServer: !process.env.CI,
          env: { ...process.env, ...apiEnv },
        },
      ],
  projects: [{ name: 'chromium' }],
});
