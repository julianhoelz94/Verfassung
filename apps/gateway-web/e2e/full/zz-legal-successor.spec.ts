import { expect, test } from '@playwright/test';
import { authenticatorCode, signIn, signOut } from './auth';
import { createIsolatedConstitution } from './api-fixtures';

test('editor, reviewer, and publisher release a real legal successor with its source document', async ({ page, request }) => {
  test.setTimeout(180_000);
  const pair = await createIsolatedConstitution(request, `Journey legal successor ${Date.now()}`);
  const recordTitle = `Journey dignity amendment ${Date.now()}`;
  await signIn(page, 'editor');
  await page.getByLabel('Current law').selectOption(pair.targetVersionId);
  await page.getByRole('button', { name: 'Record the next legal change' }).click();
  await expect(page).toHaveURL(/sessionId=/);
  await page.getByLabel('Article text').fill('A new legal duty protects public dignity in this journey.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).last().fill(recordTitle);
  await page.getByLabel('Comment').fill('The legislature updated Article 1.');
  await page.getByLabel('Document URL').fill('https://example.org/atlas-e2e/journey-law.pdf');
  await page.getByLabel('Document label').fill('Journey source act');
  await page.getByRole('button', { name: 'Save change record' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  const sessionUrl = page.url();
  await signOut(page);

  await signIn(page, 'reviewer');
  await page.goto(sessionUrl);
  await expect(page.getByText(recordTitle)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journey source act' })).toHaveAttribute('href', 'https://example.org/atlas-e2e/journey-law.pdf');
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page.getByText('Review approved. A publisher can now publish.')).toBeVisible();
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'Publish new legal version' }).click();
  await expect(page).toHaveURL(/(?:published=1|\/account\/step-up\?)/, { timeout: 15_000 });
  if (page.url().includes('/account/step-up')) {
    const secret = process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22';
    await page.getByLabel('Authenticator code').fill(authenticatorCode(secret));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/editor\?/);
    await page.getByRole('button', { name: 'Publish new legal version' }).click();
    await expect(page).toHaveURL(/published=1/, { timeout: 15_000 });
  }
  await expect(page.getByText(/Published as version/)).toBeVisible();
  const newVersionId = new URL(page.url()).searchParams.get('newVersionId');
  expect(newVersionId).toBeTruthy();
  await signOut(page);
  const articles = await (await request.get(`/api/content/versions/${newVersionId}/articles?includeBody=true`)).json();
  expect(articles[0].body).toContain('A new legal duty protects public dignity');
  await page.goto(`/countries/${pair.countryIso}/versions/${newVersionId}/articles/${articles[0].id}`);
  await expect(page.getByText('A new legal duty protects public dignity in this journey.')).toBeVisible();
  await page.goto(`/countries/${pair.countryIso}/timeline`);
  await expect(page.getByRole('heading', { name: recordTitle })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journey source act' })).toBeVisible();
});
