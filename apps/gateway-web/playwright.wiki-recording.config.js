/* eslint-disable */
const base = require('./playwright.config');
module.exports = {
  ...base,
  testMatch: /wiki-recording\.spec\.ts/,
  timeout: 360_000,
  use: { ...base.use, actionTimeout: 15_000, navigationTimeout: 30_000, launchOptions: { slowMo: 450 } },
  webServer: base.webServer?.map((server, index) => index === 1 ? { ...server, command: `npx next dev -p ${process.env.E2E_WEB_PORT ?? 3100}` } : server),
};
