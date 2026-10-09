import { expect, test } from '@playwright/test';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
  expect((await request.post(`${mockOrigin}/__sprint50_content`)).ok()).toBeTruthy();
});

test('visitor reads sourced country and constitution context with dated lifecycle', async ({ page }) => {
  await page.goto('/countries/DE');
  await expect(page.getByRole('heading', { name: 'About Germany' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source 1' })).toHaveAttribute('href', 'https://example.org/country-history');
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
