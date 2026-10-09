import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mockOrigin}/__sprint50_content`)).ok()).toBeTruthy();
});

test('visitor reads sourced country and constitution context with dated lifecycle', async ({ page }) => {
  await page.goto('/countries/DE');
  await expect(page.getByRole('heading', { name: 'About Germany' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source 1' })).toHaveAttribute('href', 'https://example.org/country-history');
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'A historic flag' })).toBeVisible();
  expect(await page.getByRole('img', { name: 'A historic flag' }).evaluate((image) =>
    Boolean(image.compareDocumentPosition(document.querySelector('.wiki-body h3')!) & Node.DOCUMENT_POSITION_FOLLOWING),
  )).toBeTruthy();
  await page.getByRole('link', { name: 'Constitution timeline' }).click();
  await expect(page.getByText('Circa 1949-05-08')).toBeVisible();
  await page.getByLabel('Date').fill('1949-05-10');
  await page.getByRole('button', { name: 'Show status' }).click();
  await page.getByText('All constitution statuses').click();
  await expect(page.getByText('uncertain (last event date is approximate)')).toBeVisible();
  await page.getByRole('link', { name: 'Basic Law for the Federal Republic of Germany' }).first().click();
  await expect(page.getByRole('heading', { name: 'About this constitution' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source 1' })).toHaveAttribute('href', 'https://example.org/basic-law');
  await expect(page.getByRole('heading', { name: 'Lifecycle dates' })).toBeVisible();
});

test('staff can review a structured wiki draft, picture, and revision history', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/editor/wiki/country/01900000-0000-4000-8000-000000000001?code=DE');
  await expect(page.getByRole('heading', { name: 'Review draft' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /^First era$/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'A historic flag' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page revision history' })).toBeVisible();
  await expect(page.getByText(/2022-01-01 · Published/)).toBeVisible();
});
