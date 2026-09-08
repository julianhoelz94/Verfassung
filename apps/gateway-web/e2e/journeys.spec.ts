/* eslint-disable */
import { test, expect } from '@playwright/test';
import { ARTICLE_1, VERSION_2022, signInEditor } from './helpers';

test('browse from countries to an article', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Countries' })).toBeVisible();
  await page.getByRole('link', { name: 'Germany' }).click();
  await expect(page.getByRole('heading', { name: 'Germany', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /2022/ }).click();
  await expect(page.getByRole('heading', { name: /Version in force since/ })).toBeVisible();
  await page.getByRole('link', { name: 'Permalink' }).first().click();
  await expect(page.getByRole('heading', { name: /Human dignity/ })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/countries/DE/versions/${VERSION_2022}/articles/${ARTICLE_1}`));
  await expect(page.getByRole('navigation', { name: 'Article navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'History of Article 1' }).click();
  await expect(page.getByRole('heading', { name: 'History of Article 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare with previous' })).toBeVisible();
});

test('search finds a published article', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Keyword').fill('dignity');
  await page.locator('main').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: /Article 1 — Human dignity/ })).toBeVisible();
});

test('linear compare shows a structured change', async ({ page }) => {
  await page.goto('/countries/DE');
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { name: /side by side/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Changed' }).first()).toBeVisible();
  await expect(page.locator('ins.diff-add, del.diff-remove').first()).toBeVisible();
});

test('login with MFA then logout', async ({ page }) => {
  await signInEditor(page);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText('local-editor@example.local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});

test('edit, review, and publish a draft', async ({ page }) => {
  await signInEditor(page);
  await page.getByRole('button', { name: 'Open session' }).click();
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Human dignity (draft)');
  await page.getByLabel('Article text').fill('Draft body for the e2e journey.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page.getByText('Review approved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published as version 2022-1.')).toBeVisible();
});
