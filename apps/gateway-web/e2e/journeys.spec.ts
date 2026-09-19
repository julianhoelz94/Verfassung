/* eslint-disable */
import { test, expect } from '@playwright/test';
import { ARTICLE_1, VERSION_1949, VERSION_2022, signInEditor, signInPublisher, signOut } from './helpers';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${MOCK_ORIGIN}/__reset`);
  expect(response.ok()).toBeTruthy();
});

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
  await page.goto('/editor');
  await page.getByLabel('Correct this text').selectOption(VERSION_2022);
  await page.getByRole('button', { name: 'Correct this text' }).click();
  await expect(page).toHaveURL(/sessionId=/);
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Human dignity (draft)');
  await page.getByLabel('Article text').fill('Draft body for the e2e journey.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected text.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await expect(page.getByText('Publish details saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/reviewed=1/);
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page).toHaveURL(/approved=1/);
  await expect(page.getByText('Review approved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText('Published as version 2022-1.')).toBeVisible();
});

test('recorded amending law appears on the public timeline', async ({ page }) => {
  await signInEditor(page);
  await page.goto('/editor/amendments');
  await page.getByRole('link', { name: 'Add legal change' }).click();
  await page.getByLabel('Title', { exact: true }).fill('E2E amending law');
  await page.getByLabel('Comment').fill('Recorded for the timeline journey.');
  await expect(page.locator('form.stack').first()).toHaveJSProperty('noValidate', false);
  expect(await page.locator('form.stack').first().evaluate((form) => form.checkValidity())).toBeTruthy();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish law' }).click();
  await expect(page).toHaveURL(/published=1/);
  await expect(page.getByText('Amending law published.')).toBeVisible();
  await signOut(page);
  await page.goto('/countries/DE/timeline');
  await expect(page.getByRole('heading', { name: 'Amendment timeline' })).toBeVisible();
  await expect(page.getByText('E2E amending law')).toBeVisible();
});

test('publisher confirms stale old-law quotes without changing the public comment', async ({ page }) => {
  await signInEditor(page);
  await page.goto('/editor');
  await page.getByLabel('Correct this text').selectOption(VERSION_1949);
  await page.getByRole('button', { name: 'Correct this text' }).click();
  await expect(page).toHaveURL(/sessionId=/);
  await page.getByLabel('Article text').fill('Corrected 1949 transcription.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected the historical transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText('Published as version 1949-1.')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('link', { name: /Legal changes/ })).toContainText('1');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await signInPublisher(page);
  await page.goto('/editor/amendments');
  await expect(page.locator('.badge', { hasText: 'Needs review' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Update to Article 1' }).click();
  await expect(page.getByRole('heading', { name: 'Flagged record review' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Comment' })).toHaveValue('The published legal-change comment.');
  await page.getByRole('button', { name: 'Confirm live quotes and republish' }).click();
  await expect(page.getByText('Quotes confirmed and the legal change republished.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Comment' })).toHaveValue('The published legal-change comment.');
  await page.reload();
  await page.goto('/editor/amendments');
  await expect(page.locator('.badge', { hasText: 'Needs review' })).toHaveCount(0);
  await signOut(page);
  await page.goto('/countries/DE/timeline');
  await expect(page.getByText('Update to Article 1')).toBeVisible();
  await expect(page.getByText('The published legal-change comment.')).toBeVisible();
});

test('editorial correction hop stays off the public timeline', async ({ page }) => {
  await page.goto('/countries/DE/timeline');
  const timelineCount = await page.locator('.timeline-item').count();
  await signInEditor(page);
  await page.goto('/editor');
  await page.getByLabel('Correct this text').selectOption(VERSION_2022);
  await page.getByRole('button', { name: 'Correct this text' }).click();
  await expect(page).toHaveURL(/sessionId=/);
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Human dignity (typo fix)');
  await page.getByLabel('Article text').fill('Corrected transcription.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected text.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await expect(page.getByText('Publish details saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page).toHaveURL(/reviewed=1/);
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page).toHaveURL(/approved=1/);
  await expect(page.getByText('Review approved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText('Published as version 2022-1.')).toBeVisible();
  await signOut(page);
  await page.goto('/countries/DE/timeline');
  await expect(page.locator('.timeline-item')).toHaveCount(timelineCount);
  await expect(page.getByText('Update to Article 1')).toBeVisible();
  await signInEditor(page);
  await page.goto('/editor/history');
  await expect(page.getByRole('heading', { name: 'Snapshot history' })).toBeVisible();
  await expect(page.getByRole('link', { name: '2022-1' })).toBeVisible();
  await expect(page.getByText('Editorial correction', { exact: true })).toBeVisible();
  await expect(page.getByText('No publication comment')).toBeVisible();
});
