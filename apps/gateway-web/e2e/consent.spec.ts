import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${MOCK_ORIGIN}/__reset`)).ok()).toBeTruthy();
});

test('cookie information stays compact and can be dismissed and reopened', async ({ page }) => {
  await page.goto('/');
  const notice = page.getByRole('region', { name: 'Cookie settings' });
  await expect(notice).toBeVisible();
  const desktopBounds = await notice.boundingBox();
  expect(desktopBounds?.width).toBeLessThanOrEqual(460);
  expect(desktopBounds?.height).toBeLessThanOrEqual(250);
  await expect(notice.getByText(/No analytics or advertising cookies/)).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/impressum');
  await notice.getByRole('button', { name: 'Understood' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await expect(notice).toBeVisible();
});

test('Impressum remains linked but is excluded from search indexing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Imprint' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByText('Atlas Foundation')).toBeVisible();
  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toContain('/impressum');
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).not.toContain('Disallow: /impressum');
});

test('admin saves and publishes imprint text and shared contact in two steps', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ca_cookie_notice_v1', 'dismissed'));
  await signInAdmin(page);
  await page.goto('/admin/legal/impressum_en');
  const revised = 'Reviewed English legal prose\n<script>window.injected=true</script>';
  await page.getByLabel('Imprint text').fill(revised);
  await page.getByLabel('Street address', { exact: true }).fill('Main Street 2');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. The public page has not changed.')).toBeVisible();
  await page.goto('/impressum');
  await expect(page.getByText('English publisher information')).toBeVisible();
  await expect(page.getByText('Main Street 1')).toBeVisible();
  await page.goto('/admin/legal/impressum_en');
  await expect(page.locator('address')).toContainText('Main Street 2');
  await page.getByRole('button', { name: 'Publish reviewed imprint' }).click();
  await expect(page.getByText('Published revision updated.')).toBeVisible();
  await page.goto('/impressum');
  await expect(page.getByText('Main Street 2')).toBeVisible();
  await expect(page.getByText('<script>window.injected=true</script>', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { injected?: boolean }).injected)).toBeUndefined();
  const germanHtml = await (await page.request.get('/impressum', { headers: { 'accept-language': 'de-DE' } })).text();
  expect(germanHtml).toContain('Example publisher information');
  expect(germanHtml).toContain('Main Street 2');
  expect(germanHtml).not.toContain('Main Street 1');
});

test('first imprint setup uses the same combined draft and publication actions', async ({ page, request }) => {
  await request.post(`${MOCK_ORIGIN}/__unpublished_imprint_contact`);
  await signInAdmin(page);
  for (const key of ['impressum', 'impressum_en']) {
    await page.goto(`/admin/legal/${key}`);
    await expect(page.getByLabel('Name or organization', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish reviewed imprint' })).toBeDisabled();
    await expect(page.getByText('Save the imprint draft with complete contact details before publishing.')).toBeVisible();
  }
  await page.getByLabel('Name or organization', { exact: true }).fill('Atlas Test Operator');
  await page.getByLabel('Street address', { exact: true }).fill('Test Lane 2');
  await page.getByLabel('Postal code', { exact: true }).fill('12345');
  await page.getByLabel('City', { exact: true }).fill('Test City');
  await page.getByLabel('Country', { exact: true }).fill('Test Country');
  await page.getByLabel('Email', { exact: true }).fill('operator@example.test');
  await page.getByLabel('Imprint text').fill('Reviewed imprint prose.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved. The public page has not changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish reviewed imprint' }).click();
  await expect(page.getByText('Published revision updated.')).toBeVisible();
  await page.goto('/impressum');
  await expect(page.getByText('Reviewed imprint prose.')).toBeVisible();
  await expect(page.getByText('Atlas Test Operator')).toBeVisible();
});
