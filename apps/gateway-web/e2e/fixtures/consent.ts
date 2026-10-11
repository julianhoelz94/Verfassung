import { test as base, expect } from '@playwright/test';

// Ordinary journeys make a valid choice before their first navigation. Consent
// tests import Playwright directly so they can observe the untouched first visit.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ca_cookie_notice_v1', 'dismissed');
      } catch {
        // Browsers with disabled storage can still use the site.
      }
    });
    await use(page);
  },
});

export { expect };
export type { Page, APIRequestContext } from '@playwright/test';
