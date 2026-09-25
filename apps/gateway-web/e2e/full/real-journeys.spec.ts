import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ids = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'generated', '.runtime', 'prepopulate-ids.json'), 'utf8')) as {
  constitutions: Record<string, string>;
  versions: Record<string, string>;
  amendments: Record<string, string>;
};

test('visitor reads a published constitution and an article through the real stack', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Atlas Testland' }).click();
  await expect(page.getByRole('heading', { name: 'Atlas Testland' })).toBeVisible();
  await page.getByRole('link', { name: 'Read latest' }).click();
  await expect(page).toHaveURL(new RegExp(`/countries/XA/versions/${ids.versions['xa-2024']}$`));
  const articles = await (await request.get(`/api/content/versions/${ids.versions['xa-2024']}/articles`)).json();
  await page.goto(`/countries/XA/versions/${ids.versions['xa-2024']}/articles/${articles[0].id}`);
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await expect(page.getByText('Dignity and civic equality protect every person.')).toBeVisible();
});

test('visitor compares legal versions and reads the source document timeline', async ({ page }) => {
  await page.goto('/countries/XA');
  await page.getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('heading', { name: /side by side/ })).toBeVisible();
  await expect(page.locator('ins.diff-add, del.diff-remove').first()).toBeVisible();
  await page.goto('/countries/XA/timeline');
  await expect(page.getByRole('heading', { name: 'Amendment timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atlas Testland Civic Revision 2024' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic source document' }).first()).toBeVisible();
});

test('visitor finds imported text through the real search index', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('dignity');
  await page.locator('main').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: /Article 1 — Human dignity/ }).first()).toBeVisible();
});

test('visitor reads historical article context, provenance, and site guidance', async ({ page, request }) => {
  const articles = await (await request.get(`/api/content/versions/${ids.versions['xa-2020']}/articles`)).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/countries/XA/versions/${ids.versions['xa-2020']}/articles/${articles[0].id}`);
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Source and trust' })).toBeVisible();
  await page.getByRole('link', { name: 'History of Article 1' }).click();
  await expect(page.getByRole('heading', { name: 'History of Article 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare with previous' })).toBeVisible();
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible();
});

test('visitor filters real search results and opens their original version', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('dignity');
  await page.locator('main').getByRole('button', { name: 'Search' }).click();
  await page.getByRole('radio', { name: /Atlas Testland/ }).check();
  await page.getByRole('radio', { name: /Atlas Test Charter.*2020/ }).check();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  const result = page.getByRole('link', { name: /Article 1 — Human dignity/ });
  await expect(result).toHaveAttribute('href', new RegExp(`/versions/${ids.versions['xa-2020']}/articles/`));
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/versions/${ids.versions['xa-2020']}/articles/`));
});

test('viewer signs in, sees the public site, and signs out', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.CI_VIEWER_EMAIL ?? 'ci-viewer@example.local');
  await page.getByLabel('Password').fill(process.env.CI_VIEWER_PASSWORD ?? 'change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === 'ca_session')).toBe(false);
});
