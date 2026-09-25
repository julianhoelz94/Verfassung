import { expect, test } from '@playwright/test';
import { signIn, signOut } from './auth';

const roles = [
  { role: 'editor', admin: false, canEdit: true },
  { role: 'reviewer', admin: false, canEdit: false },
  { role: 'publisher', admin: false, canEdit: false },
  { role: 'admin', admin: true, canEdit: true },
] as const;

for (const story of roles) {
  test(`${story.role} signs in and sees real role permissions`, async ({ page }) => {
    const email = await signIn(page, story.role);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(story.admin ? 1 : 0);
    await page.goto('/editor');
    await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Correct this text' })).toHaveCount(story.canEdit ? 1 : 0);
    await page.goto('/admin/constitutions');
    if (story.admin) {
      await expect(page.getByRole('heading', { name: 'Constitution outlines' })).toBeVisible();
      await expect(page.getByText('Atlas Test Charter')).toBeVisible();
    } else {
      await expect(page.getByText('Administrator role required.')).toBeVisible();
    }
  });
}

test('editor, reviewer, and publisher carry a real transcription correction to the public reader', async ({ page, request }) => {
  test.setTimeout(120_000);
  await signIn(page, 'editor');
  const sourceVersionId = await page.getByLabel('Correct this text').locator('option').first().getAttribute('value');
  expect(sourceVersionId).toBeTruthy();
  await page.getByLabel('Correct this text').selectOption(sourceVersionId!);
  const countries = await (await request.get('/api/catalog/countries')).json();
  let sourceCountryIso: string | undefined;
  for (const summary of countries) {
    const detail = await (await request.get(`/api/catalog/countries/${summary.isoCode}`)).json();
    if (detail.constitutions.some((constitution: { versions: Array<{ id: string; currentVersionId?: string }> }) =>
      constitution.versions.some((version) => version.id === sourceVersionId || version.currentVersionId === sourceVersionId))) {
      sourceCountryIso = summary.isoCode;
      break;
    }
  }
  expect(sourceCountryIso).toBeTruthy();
  await page.getByRole('button', { name: 'Correct this text' }).click();
  await expect(page).toHaveURL(/sessionId=/);
  await page.getByLabel('Article text').fill('Dignity and civic equality protect every person. Verified transcription.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill('Verified Article 1 transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submitted for review.')).toBeVisible();
  const sessionUrl = page.url();
  await signOut(page);

  await signIn(page, 'reviewer');
  await page.goto(sessionUrl);
  await expect(page.getByText('Dignity and civic equality protect every person. Verified transcription.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await expect(page.getByText('Review approved. A publisher can now publish.')).toBeVisible();
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText(/Published as version/)).toBeVisible();
  const newVersionId = new URL(page.url()).searchParams.get('newVersionId');
  expect(newVersionId).toBeTruthy();
  await signOut(page);
  const publishedArticles = await (await request.get(`/api/content/versions/${newVersionId}/articles?includeBody=true`)).json();
  expect(publishedArticles[0].body).toContain('Verified transcription.');
  await page.goto(`/countries/${sourceCountryIso}/versions/${newVersionId}/articles/${publishedArticles[0].id}`);
  await expect(page.getByText('Dignity and civic equality protect every person. Verified transcription.').first()).toBeVisible();
});

test('administrator imports a new constitution through the website', async ({ page }) => {
  const slug = `admin-journey-${Date.now()}`;
  await signIn(page, 'admin');
  await page.goto('/admin/import');
  await page.getByLabel('Import JSON').fill(JSON.stringify({
    isoCode: 'XC',
    countryName: 'Atlas Admin Testland',
    constitutionSlug: slug,
    constitutionTitle: 'Admin Imported Charter',
    versionLabel: '2025',
    effectiveDate: '2025-01-01',
    articles: [{ articleNumber: '1', title: 'Public trust', body: 'Public trust protects every person.', sortOrder: 1 }],
  }));
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByRole('heading', { name: 'Import job' })).toBeVisible();
  await expect(page.getByText('Status: completed')).toBeVisible();
  await page.getByRole('link', { name: 'Open the published version' }).click();
  await expect(page.getByRole('link', { name: 'Art. 1 Public trust' }).first()).toBeVisible();
});
