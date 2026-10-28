import { expect, test, type Page } from '../fixtures/consent';
import { authenticatorCode, signIn, signOut, startFromViewer } from './auth';
import { createIsolatedConstitution } from './api-fixtures';

async function sessionDetails(page: Page) {
  const summary = page.locator('summary').filter({ hasText: 'Session and publication' });
  if (!(await summary.evaluate(element => element.parentElement!.hasAttribute('open')))) await summary.click();
}

test('editor, reviewer, and publisher release a real legal successor with its source document', async ({ page, request }) => {
  test.setTimeout(180_000);
  const pair = await createIsolatedConstitution(request, `Journey legal successor ${Date.now()}`);
  const recordTitle = `Journey dignity amendment ${Date.now()}`;
  await signIn(page, 'editor');
  await startFromViewer(page, pair.countryIso, pair.targetVersionId, 'legal');
  await page.locator('#draft-form textarea').first().fill('A new legal duty protects public dignity in this journey.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await sessionDetails(page);
  await page.locator('#editor-change-record').getByLabel('Title', { exact: true }).fill(recordTitle);
  await page.getByLabel('Comment').fill('The legislature updated Article 1.');
  await page.getByLabel('Document URL').fill('https://example.org/atlas-e2e/journey-law.pdf');
  await page.getByLabel('Document label').fill('Journey source act');
  await page.getByRole('button', { name: 'Save change record' }).click();
  await expect(page).toHaveURL(/detailsSaved=1/);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  const sessionUrl = page.url();
  await signOut(page);

  await signIn(page, 'reviewer');
  await page.goto(sessionUrl);
  await sessionDetails(page);
  await expect(page.getByText(recordTitle)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journey source act' })).toHaveAttribute('href', 'https://example.org/atlas-e2e/journey-law.pdf');
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page.getByText('Review approved. A publisher can now publish.')).toBeVisible();
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(sessionUrl);
  await sessionDetails(page);
  await page.getByRole('button', { name: 'Publish new legal version' }).click();
  await expect(page).toHaveURL(/(?:published=1|\/account\/step-up\?)/, { timeout: 15_000 });
  if (page.url().includes('/account/step-up')) {
    const secret = process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22';
    await page.getByLabel('Authenticator code').fill(authenticatorCode(secret));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/editor\?/);
    await sessionDetails(page);
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
  await page.getByRole('button', { name: recordTitle, exact: true }).click();
  await expect(page.getByRole('heading', { name: recordTitle })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journey source act' })).toBeVisible();
});
