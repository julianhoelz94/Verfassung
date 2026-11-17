import { test, expect } from './fixtures/consent';
import path from 'node:path';

const version = '01900000-0000-4000-8000-000000000004';
const article = '01900000-0000-4000-8000-000000000201';
const mock = 'http://127.0.0.1:' + (process.env.E2E_MOCK_PORT ?? 4010);
const axePath = path.join(process.cwd(), 'node_modules/axe-core/axe.min.js');

for (const locale of ['en', 'de']) for (const width of [320, 820, 1440]) {
  test('Search workspace, passage preview and reader return in ' + locale + ' at ' + width, async ({ browser, request }, info) => {
    await request.post(mock + '/__reset');
    const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), locale, viewport: { width, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
    const page = await context.newPage(), english = locale === 'en';
    try {
      await page.goto('/search?q=dignity&country=DE&versionId=' + version);
      await expect(page.locator('.topbar input[type="search"]')).toHaveCount(0);
      await expect(page.locator('main input[name="q"]')).toHaveCount(1);
      const filters = page.locator('button[aria-controls="search-filters"]');
      await filters.click();
      await expect(page.locator('#filter-country')).toHaveValue('DE');
      await page.locator('#filter-effectiveDate').selectOption('2022-12-19');
      await expect(page).toHaveURL(/effectiveDate=2022-12-19/);
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.keyboard.press('Escape'); await expect(filters).toBeFocused();
      await expect(page.locator('#filter-country')).toBeHidden();
      await expect(page.locator('.applied-filters .chip')).toHaveCount(3);
      const origin = page.getByRole('button', { name: english ? 'Preview passage' : 'Textstelle ansehen', exact: true });
      await origin.click();
      const dialog = page.locator('#search-preview');
      await expect(dialog.locator('[data-constitution-document]')).toContainText('Human dignity shall be inviolable.');
      await expect(dialog.getByRole('button', { name: english ? 'Close preview' : 'Vorschau schließen' })).toBeFocused();
      await expect(dialog.locator('[lang="en"]')).not.toHaveCount(0);
      const footer = dialog.getByRole('link', { name: english ? 'Open in constitution' : 'In Verfassung öffnen' });
      const bounds = await footer.boundingBox(); expect(bounds).not.toBeNull();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run(): Promise<{ violations: unknown[] }> } }).axe.run()).violations);
      expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath('search-preview-' + locale + '-' + width + '.png'), fullPage: true, animations: 'disabled' });
      const returnTo = new URL(page.url()).pathname + new URL(page.url()).search;
      const target = new URL((await footer.getAttribute('href'))!, page.url());
      expect(target.pathname).toBe('/countries/DE/versions/' + version); expect(target.hash).toBe('#' + article);
      expect(target.searchParams.get('fromSearch')).toBe(returnTo);
      await footer.click();
      await expect(page.locator('[data-constitution-document]').first()).toContainText('Human dignity shall be inviolable.');
      await page.getByRole('link', { name: english ? 'Back to search results' : 'Zurück zu den Suchergebnissen' }).click();
      await expect(page).toHaveURL(new RegExp('/search\\?q=dignity&country=DE&versionId=' + version + '&effectiveDate=2022-12-19$'));
      await expect(page.locator('.applied-filters .chip')).toHaveCount(3);
      await expect(page.locator('.search-hits h2 a')).toBeFocused();
      await expect(page.locator('#search-preview [data-constitution-document]')).toBeVisible();
      await page.getByRole('button', { name: english ? 'Close preview' : 'Vorschau schließen' }).click();
      await origin.click(); await page.keyboard.press('Escape'); await expect(origin).toBeFocused();
      await expect(page.locator('#search-preview')).toBeHidden();
    } finally { await context.close(); }
  });
}

test('a failed preview can be retried and native Search still works without JavaScript', async ({ page, browser, request }, info) => {
  await request.post(mock + '/__reset');
  await page.route('**/api/reader/search-preview?**', route => route.fulfill({ status: 503, json: { code: 'passage_unavailable' } }), { times: 1 });
  await page.goto('/search?q=dignity');
  await page.getByRole('button', { name: 'Preview passage', exact: true }).click();
  await expect(page.locator('#search-preview [role="alert"]')).toContainText('could not be loaded');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#search-preview [data-constitution-document]')).toBeVisible();
  const native = await browser.newContext({ baseURL: String(info.project.use.baseURL), javaScriptEnabled: false });
  try {
    const tab = await native.newPage(); await tab.goto('/search');
    await tab.locator('#search-q').fill('dignity'); await tab.locator('#search-filters > summary').click();
    await tab.locator('#filter-country').selectOption('DE');
    await tab.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(tab.locator('.search-hits h2 a')).toBeVisible();
    expect(new URL(tab.url()).searchParams.get('country')).toBe('DE');
    expect(new URL(tab.url()).searchParams.get('q')).toBe('dignity');
  } finally { await native.close(); }
});
