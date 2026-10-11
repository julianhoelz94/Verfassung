import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${MOCK_ORIGIN}/__reset`)).ok()).toBeTruthy();
});

test('cookie information stays compact and can be dismissed and reopened', async ({ page }) => {
  await page.goto('/');
  const notice = page.getByRole('region', { name: 'Cookie-Einstellungen' });
  await expect(notice).toBeVisible();
  const desktopBounds = await notice.boundingBox();
  expect(desktopBounds?.width).toBeLessThanOrEqual(460);
  expect(desktopBounds?.height).toBeLessThanOrEqual(250);
  await expect(notice.getByText('Keine Analyse- oder Werbe-Cookies.')).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
  await notice.getByRole('button', { name: 'Verstanden' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
  await page.getByRole('button', { name: 'Cookie-Einstellungen' }).click();
  await expect(notice).toBeVisible();
});

test('Impressum remains linked but is excluded from search indexing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByText('Example Operator')).toBeVisible();
  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toContain('/impressum');
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).not.toContain('Disallow: /impressum');
});

test('admin saves a private legal draft and publishes escaped text', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
  await signInAdmin(page);
  await page.goto('/admin/legal/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum bearbeiten' })).toBeVisible();
  const revised = 'Example Operator\nExample Street 2\nexample@example.org\n<script>window.injected=true</script>';
  await page.getByLabel('Impressum text').fill(revised);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved. The public page has not changed.')).toBeVisible();
  await page.goto('/impressum');
  await expect(page.getByText('Example Street 1')).toBeVisible();
  await page.goto('/admin/legal/impressum');
  await page.getByRole('button', { name: 'Publish reviewed text' }).click();
  await expect(page.getByText('Published revision updated.')).toBeVisible();
  await page.goto('/impressum');
  await expect(page.getByText('Example Street 2')).toBeVisible();
  await expect(page.getByText('<script>window.injected=true</script>')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { injected?: boolean }).injected)).toBeUndefined();
});
