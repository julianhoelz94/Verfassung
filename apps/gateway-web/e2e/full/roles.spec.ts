import { expect, test, type APIRequestContext } from '@playwright/test';
import { signIn, signOut, startFromViewer } from './auth';

async function publishedVersion(request: APIRequestContext, requirePlainArticle = false): Promise<{ countryIso: string; versionId: string }> {
  const countries = await (await request.get('/api/catalog/countries')).json();
  for (const summary of countries) {
    const country = await (await request.get(`/api/catalog/countries/${summary.isoCode}`)).json();
    for (const constitution of country.constitutions ?? []) {
      for (const version of constitution.versions ?? []) {
        const versionId = version.currentVersionId ?? version.id;
        if (!versionId) continue;
        if (requirePlainArticle) {
          const response = await request.get(`/api/content/versions/${versionId}/articles?includeBody=true`);
          if (!response.ok() || !(await response.json()).some((article: { children?: unknown[] }) => !article.children?.length)) continue;
        }
        return { countryIso: summary.isoCode, versionId };
      }
    }
  }
  throw new Error('No published constitution version available for role journey');
}

const roles = [
  { role: 'editor', admin: false, canEdit: true },
  { role: 'reviewer', admin: false, canEdit: false },
  { role: 'publisher', admin: false, canEdit: false },
  { role: 'admin', admin: true, canEdit: true },
] as const;

for (const story of roles) {
  test(`${story.role} signs in and sees real role permissions`, async ({ page, request }) => {
    const email = await signIn(page, story.role);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(story.admin ? 1 : 0);
    await page.goto('/editor');
    await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
    const source = await publishedVersion(request);
    await page.goto(`/countries/${source.countryIso}/versions/${source.versionId}`);
    await expect(page.getByRole('link', { name: 'Edit this constitution' })).toHaveCount(story.canEdit ? 1 : 0);
    await page.goto('/admin/constitutions');
    if (story.admin) {
      await expect(page.getByRole('heading', { name: 'Constitutions', exact: true })).toBeVisible();
      await expect(page.getByText('Atlas Test Charter')).toBeVisible();
    } else {
      await expect(page.getByText('Administrator role required.')).toBeVisible();
    }
  });
}

test('editor, reviewer, and publisher carry a real transcription correction to the public reader', async ({ page, request }) => {
  test.setTimeout(120_000);
  const source = await publishedVersion(request, true);
  const sourceCountryIso = source.countryIso;
  const sourceVersionId = source.versionId;
  await signIn(page, 'editor');
  await startFromViewer(page, sourceCountryIso, sourceVersionId, 'editorial_correction');
  const sourceArticles = await (await request.get(`/api/content/versions/${sourceVersionId}/articles?includeBody=true`)).json();
  const plainArticle = sourceArticles.find((article: { children?: unknown[] }) => !article.children?.length);
  expect(plainArticle).toBeTruthy();
  const sessionPage = new URL(page.url());
  sessionPage.searchParams.set('articleId', plainArticle.id);
  await page.goto(sessionPage.toString());
  await page.locator('#draft-form textarea').first().fill('Dignity and civic equality protect every person. Verified transcription.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.getByLabel('What was corrected in this transcription?').fill(`Verified Article ${plainArticle.articleNumber} transcription.`);
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
  const corrected = publishedArticles.find((article: { articleNumber: string }) => article.articleNumber === plainArticle.articleNumber);
  expect(corrected.body).toContain('Verified transcription.');
  expect(publishedArticles.find((article: { articleNumber: string }) => article.articleNumber === sourceArticles[0].articleNumber).children.length).toBe(sourceArticles[0].children.length);
  await page.goto(`/countries/${sourceCountryIso}/versions/${newVersionId}/articles/${corrected.id}`);
  await expect(page.getByText('Dignity and civic equality protect every person. Verified transcription.').first()).toBeVisible();
});

test('editorial roles stage, review, and publish a new constitution through the website', async ({ page }) => {
  const slug = `admin-journey-${Date.now()}`;
  await signIn(page, 'admin');
  await page.goto('/admin/import');
  await page.getByLabel('Import JSON').fill(JSON.stringify({
    isoCode: 'XC',
    countryName: 'Atlas Admin Testland',
    constitutionSlug: slug,
    constitutionTitle: 'Admin Imported Charter',
    outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article' }] },
    versionLabel: '2025',
    sourceUrl: 'https://example.org/atlas-e2e/admin-2025',
    effectiveDate: '2025-01-01',
    articles: [{ articleNumber: '1', title: 'Public trust', body: 'Public trust protects every person.', sortOrder: 1 }],
  }));
  await page.getByRole('button', { name: 'Stage for review' }).click();
  await expect(page.getByRole('heading', { name: 'Import job' })).toBeVisible();
  await expect(page.getByText('Status: pending_review')).toBeVisible();
  const reviewUrl = page.url();
  await page.getByRole('button', { name: 'Confirm proposed outline' }).click();
  await page.getByRole('button', { name: 'Prepare unpublished draft' }).click();
  await signOut(page);
  await signIn(page, 'reviewer');
  await page.goto(reviewUrl);
  await page.getByLabel('Review reason').first().fill('Source wording and article structure match the submitted text.');
  await page.getByRole('button', { name: 'Approve prepared draft' }).click();
  await expect(page.getByText('Status: approved')).toBeVisible();
  await signOut(page);
  await signIn(page, 'publisher');
  await page.goto(reviewUrl);
  await page.getByRole('button', { name: 'Publish approved version' }).click();
  await expect(page.getByText('Status: completed')).toBeVisible();
  await page.getByRole('link', { name: 'Open the published version' }).click();
  await expect(page.getByRole('button', { name: /Article 1.*Public trust/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Article 1.*Public trust/ }).first().click();
  await expect(page.getByText('Public trust protects every person.')).toBeVisible();
});
