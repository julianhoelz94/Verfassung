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
  await page.getByRole('link', { name: '1949' }).click();
  await expect(page).toHaveURL(new RegExp(`/versions/${VERSION_1949}$`));
  await expect(page.getByRole('heading', { name: /Version in force since/ })).toBeVisible();
  await page.getByRole('link', { name: 'Germany' }).click();
  await page.getByRole('link', { name: 'Read latest' }).click();
  await expect(page).toHaveURL(new RegExp(`/versions/${VERSION_2022}$`));
  await page.getByRole('link', { name: 'Permalink' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/articles/${ARTICLE_1}#article-1$`));
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await page.getByRole('link', { name: /Article 2/ }).click();
  await expect(page.getByRole('heading', { name: /Article 2/ })).toBeVisible();
  await page.getByRole('link', { name: /Article 1/ }).click();
  await page.getByRole('link', { name: 'History of Article 1' }).click();
  await expect(page.getByRole('link', { name: 'Compare with previous' })).toBeVisible();
});

test('visitor reads the site scope, sources and accessibility statement', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verification labels' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible();
});

test('visitor filters search and result retains its version', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('dignity');
  await page.getByLabel(/Germany/).check();
  await page.getByLabel(/Basic Law · 2022/).check();
  await page.getByLabel(/2022-12-19/).check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(new RegExp(`country=DE.*versionId=${VERSION_2022}.*effectiveDate=2022-12-19`));
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
  const sourceDocument = change.getByRole('link', { name: 'Official change document' });
  await expect(sourceDocument).toHaveAttribute('href', 'https://example.gov/update-article-1.pdf');
  await expect(change.getByRole('link', { name: /Compare with previous/ })).toHaveAttribute('href', new RegExp(`from=${VERSION_1949}&to=${VERSION_2022}`));
  await change.getByRole('link', { name: /Compare with previous/ }).click();
  await expect(page.getByText('Update to Article 1')).toBeVisible();
});

test('visitor can reach provenance and a print action on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/countries/DE/versions/${VERSION_2022}/articles/${ARTICLE_1}`);
  await expect(page.getByRole('complementary', { name: 'Source and trust' }).getByText('Verification')).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { printCalled?: boolean }).printCalled = false;
    window.print = () => { (window as Window & { printCalled?: boolean }).printCalled = true; };
  });
  await page.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { printCalled?: boolean }).printCalled)).toBe(true);
});
