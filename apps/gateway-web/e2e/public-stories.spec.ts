import { expect, test } from '@playwright/test';
import { ARTICLE_1, VERSION_1949, VERSION_2022 } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('visitor follows the country, legal version, article and history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Germany' }).click();
  await expect(page.getByRole('heading', { name: 'Basic Law' })).toBeVisible();
  await expect(page.getByRole('link', { name: '1949' })).toHaveAttribute('href', `/countries/DE/versions/${VERSION_1949}`);
  await page.getByRole('link', { name: 'Read latest' }).click();
  await expect(page).toHaveURL(new RegExp(`/versions/${VERSION_2022}$`));
  await page.getByRole('link', { name: 'Permalink' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/articles/${ARTICLE_1}#article-1$`));
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await page.getByRole('link', { name: 'History of Article 1' }).click();
  await expect(page.getByRole('link', { name: 'Compare with previous' })).toBeVisible();
});

test('visitor filters search and result retains its version', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('dignity');
  await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click();
  const result = page.getByRole('link', { name: /Article 1 — Human dignity/ });
  await expect(result).toHaveAttribute('href', `/countries/DE/versions/${VERSION_2022}/articles/${ARTICLE_1}`);
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/versions/${VERSION_2022}/articles/${ARTICLE_1}$`));
});

test('visitor compares versions and changes the article scope', async ({ page }) => {
  await page.goto(`/countries/DE/compare?from=${VERSION_1949}&to=${VERSION_2022}`);
  await expect(page.getByRole('heading', { name: /side by side/ })).toBeVisible();
  await expect(page.locator('ins.diff-add, del.diff-remove').first()).toBeVisible();
  await page.getByRole('link', { name: /Show all/ }).click();
  await expect(page.getByText('All articles are shown.')).toBeVisible();
  await page.getByRole('link', { name: 'Only changed' }).click();
  await expect(page.getByText('Only changed articles are shown.')).toBeVisible();
});

test('visitor reads the legal timeline and its source context', async ({ page }) => {
  await page.goto('/countries/DE/timeline');
  const change = page.locator('.timeline-item').filter({ hasText: 'Update to Article 1' });
  await expect(change).toContainText('The published legal-change comment.');
  await expect(change.getByRole('link', { name: /Compare with previous/ })).toHaveAttribute('href', new RegExp(`from=${VERSION_1949}&to=${VERSION_2022}`));
  await change.getByRole('link', { name: /Compare with previous/ }).click();
  await expect(page.getByText('Update to Article 1')).toBeVisible();
});

test('visitor can reach provenance and a print action on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/countries/DE/versions/${VERSION_2022}/articles/${ARTICLE_1}`);
  await expect(page.getByRole('complementary', { name: 'Source and trust' }).getByText('Verification')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
});
