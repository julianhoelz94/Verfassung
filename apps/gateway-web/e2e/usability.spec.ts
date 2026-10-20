import { test, expect } from './fixtures/consent';
import path from 'node:path';
import { VERSION_2022 } from './helpers';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const jobId = '01900000-0000-4000-8000-000000000701';

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mock}/__usability_content`)).ok()).toBeTruthy();
});

for (const locale of ['en', 'de']) for (const width of [390, 820, 1440]) {
  test(`dense layouts and progressive controls in ${locale} at ${width}px`, async ({ browser, request }, testInfo) => {
    const english = locale === 'en';
    await request.post(`${mock}/api/identity/login`, { data: { email: 'local-admin@example.local', password: 'change-me' } });
    await request.post(`${mock}/api/identity/login/mfa`, { data: { challengeToken: 'e2e-mfa-challenge', code: '123456' } });
    await request.post(`${mock}/api/ingestion/import-jobs`, { data: {
      isoCode: 'DE', countryName: 'Germany', constitutionSlug: 'review-charter', constitutionTitle: 'Review charter', versionLabel: '2026',
      articles: [{ articleNumber: '1', title: 'Rights', body: 'All people are equal.' }],
    } });
    await request.post(`${mock}/api/ingestion/import-jobs/${jobId}/prepare`);
    const baseURL = String(testInfo.project.use.baseURL);
    const context = await browser.newContext({ baseURL, locale, viewport: { width, height: 900 } });
    await context.addCookies([{ name: 'ca_session', value: 'e2e-session-token', url: baseURL }]);
    await context.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
    const page = await context.newPage();
    async function audit(name: string) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name).toBeTruthy();
      await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => {
        // @ts-expect-error axe is injected for verification
        return (await window.axe.run(document)).violations.map(({ id }) => id);
      });
      expect(violations, name).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}-${width}.png`), fullPage: true });
    }
    try {
      await page.goto('/admin/users');
      const user = page.locator('.data-row').filter({ hasText: 'long.editorial.account.0@' });
      await expect(user.getByRole('checkbox')).toHaveCount(0);
      await user.locator('summary').click();
      const reader = user.getByRole('checkbox').first();
      await expect(reader).toBeChecked();
      await reader.uncheck();
      await user.getByRole('button', { name: english ? 'Cancel' : 'Abbrechen', exact: true }).click();
      await expect(user.getByRole('checkbox')).toHaveCount(0);
      await user.locator('summary').click();
      await expect(reader).toBeChecked();
      await audit('users-expanded');
      await user.locator('summary').click();
      await audit('users');
      await page.getByRole('button', { name: english ? 'Account menu' : 'Kontomenü' }).click();
      const menu = page.locator('.menu-panel');
      await expect(menu.locator('details[open]')).toHaveCount(1);
      const editorial = menu.locator('details').filter({ has: page.locator('a[href="/editor?status=reviewing"]') });
      await editorial.locator('summary').click();
      await expect(editorial.locator('a[href="/editor?status=reviewing"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: english ? 'Account menu' : 'Kontomenü' })).toBeFocused();
      await page.goto(`/editor?importJobId=${jobId}`);
      await expect(page.locator('#reason-approve')).toBeVisible();
      await expect(page.locator('.technical-identifiers code').first()).toBeHidden();
      await audit('import-review');
      await page.goto(`/search?q=dignity&country=DE&versionId=${VERSION_2022}`);
      if (width < 1024) await page.locator('.filters-disclosure > summary').click();
      await page.locator('#filter-country').selectOption('FR');
      await expect(page.locator('#filter-versionId')).toHaveValue('');
      await expect(page.getByRole('status')).toContainText(english ? 'cleared' : 'zurückgesetzt');
      await page.locator('.searchable-filter input[type="search"]').fill('1959');
      await page.locator('#filter-versionId').selectOption('01900000-0000-4000-8000-000000001059');
      await page.locator('.search-page-form button[type="submit"]').last().click();
      await expect(page).toHaveURL(/country=FR.*versionId=01900000-0000-4000-8000-000000001059/);
      await expect(page.locator('#search-q')).toHaveValue('dignity');
      await audit('search');
      await page.getByRole('link', { name: english ? 'Clear filters' : 'Filter zurücksetzen', exact: true }).click();
      await expect(page).toHaveURL(/search\?q=dignity$/);
      await page.goBack();
      await expect(page.locator('#filter-country')).toHaveValue('FR');
      await page.goto('/countries/DE/timeline');
      const milestones = page.locator('.history-milestone');
      await expect(milestones.first()).toHaveAttribute('aria-pressed', 'true');
      await milestones.first().focus();
      await page.keyboard.press('End');
      await expect(milestones.last()).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.reload();
      await expect(milestones.last()).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.history-details > li:visible')).toHaveCount(1);
      await milestones.last().focus();
      await page.keyboard.press('Home');
      await expect(milestones.first()).toBeFocused();
      await audit('history');
      await page.locator('#history-event-type').selectOption('amendment');
      await page.getByRole('button', { name: english ? 'Apply' : 'Anwenden', exact: true }).click();
      await expect(page).toHaveURL(/countries\/DE\/timeline\?events=amendment$/);
      await expect(page.locator('.history-details > li:not([data-kind="amendment"])')).toHaveCount(0);
    } finally { await context.close(); }
  });
}

test('pending filters survive responsive changes and applied links preserve the keyword', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/search?q=dignity&offset=20');
  await page.locator('#filter-country').selectOption('FR');
  await page.locator('#filter-versionId').selectOption('01900000-0000-4000-8000-000000001059');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('.filters-disclosure > summary').click();
  await expect(page.locator('#filter-country')).toHaveValue('FR');
  await expect(page.locator('#filter-versionId')).toHaveValue('01900000-0000-4000-8000-000000001059');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  expect(new URL(page.url()).searchParams.has('offset')).toBe(false);
  await page.locator('.applied-filters a').nth(1).click();
  await expect(page).toHaveURL(/q=dignity&country=FR$/);
  await page.goto('/search?q=dignity&country=DE&versionId=01900000-0000-4000-8000-000000001059');
  await page.locator('.filters-disclosure > summary').click();
  await expect(page.locator('#filter-versionId')).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('cleared');
});

test('the complete chronology remains available for print and without JavaScript', async ({ page, browser }, testInfo) => {
  await page.goto('/countries/DE/timeline');
  const count = await page.locator('.history-details > li').count();
  expect(count).toBeGreaterThan(1);
  await expect(page.locator('.history-details > li:visible')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.history-details > li:visible')).toHaveCount(count);
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), javaScriptEnabled: false });
  try {
    const fallback = await context.newPage();
    await fallback.goto('/countries/DE/timeline');
    await expect(fallback.locator('.history-details > li:visible')).toHaveCount(count);
    await expect(fallback.locator('.history-details').getByText('Circa 1949-05-08')).toBeVisible();
  } finally { await context.close(); }
});
