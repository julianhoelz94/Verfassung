import { expect, test } from '@playwright/test';
import { signIn, signOut } from './auth';

test('editor, reviewer, and publisher release a real legal successor with its source document', async ({ page, request }) => {
  test.setTimeout(120_000);
  await signIn(page, 'editor');
  const sourceVersionId = await page.getByLabel('Current law').locator('option').first().getAttribute('value');
  expect(sourceVersionId).toBeTruthy();
  const countries = await (await request.get('/api/catalog/countries')).json();
  let countryIso: string | undefined;
  for (const summary of countries) {
    const detail = await (await request.get(`/api/catalog/countries/${summary.isoCode}`)).json();
    if (detail.constitutions.some((constitution: { versions: Array<{ id: string; currentVersionId?: string }> }) =>
      constitution.versions.some((version) => version.id === sourceVersionId || version.currentVersionId === sourceVersionId))) {
      countryIso = summary.isoCode;
      break;
    }
  }
  expect(countryIso).toBeTruthy();
  await page.getByRole('button', { name: 'Record the next legal change' }).click();
  await expect(page).toHaveURL(/sessionId=/);
  await page.getByLabel('Article text').fill('A new legal duty protects public dignity in this journey.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).last().fill('Journey dignity amendment');
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
  await expect(page.getByText('Journey dignity amendment')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journey source act' })).toHaveAttribute('href', 'https://example.org/atlas-e2e/journey-law.pdf');
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page.getByText('Review approved. A publisher can now publish.')).toBeVisible();
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'Publish new legal version' }).click();
  await expect(page.getByText(/Published as version/)).toBeVisible();
  const newVersionId = new URL(page.url()).searchParams.get('newVersionId');
  expect(newVersionId).toBeTruthy();
  await signOut(page);
  const articles = await (await request.get(`/api/content/versions/${newVersionId}/articles?includeBody=true`)).json();
  expect(articles[0].body).toContain('A new legal duty protects public dignity');
  await page.goto(`/countries/${countryIso}/versions/${newVersionId}/articles/${articles[0].id}`);
  await expect(page.getByText('A new legal duty protects public dignity in this journey.')).toBeVisible();
  await page.goto(`/countries/${countryIso}/timeline`);
  await expect(page.getByRole('heading', { name: 'Journey dignity amendment' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journey source act' })).toBeVisible();
});
