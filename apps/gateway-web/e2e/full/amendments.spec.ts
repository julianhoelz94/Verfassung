import { expect, test, type APIRequestContext } from '@playwright/test';
import { signIn, signOut } from './auth';
import { adminHeaders, createIsolatedConstitution } from './api-fixtures';

async function createPublishedRecord(request: APIRequestContext, title: string, constitutionId: string, sourceVersionId: string, targetVersionId: string, twoRevisions = false) {
  const headers = await adminHeaders(request);
  const payload = {
    title, comment: `Journey source for ${title}.`,
    documents: [{ url: 'https://example.org/atlas-e2e/journey-law.pdf', label: 'Journey source document' }],
    enactedOn: '2023-01-01', effectiveOn: '2023-02-01', sourceVersionId, targetVersionId,
    changes: [{ articleNumber: '1', changeType: 'changed', note: 'Journey legal revision.' }],
  };
  const created = await request.post(`/api/amendment/constitutions/${constitutionId}/amendments`, { data: payload, headers });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  if (twoRevisions) {
    const revision = await request.post(`/api/amendment/amendments/${id}/revisions`, { data: payload, headers });
    expect(revision.ok()).toBeTruthy();
  }
  const published = await request.post(`/api/amendment/amendments/${id}/publish`, { headers });
  expect(published.ok(), `publish: HTTP ${published.status()} ${await published.text()}`).toBeTruthy();
  return id as string;
}

test('editor restores a real change-record revision and publisher republishes it', async ({ page, request }) => {
  test.setTimeout(120_000);
  const pair = await createIsolatedConstitution(request, `Journey restoration constitution ${Date.now()}`);
  const amendmentId = await createPublishedRecord(request, `Journey restoration ${Date.now()}`, pair.constitutionId, pair.sourceVersionId, pair.targetVersionId, true);
  await signIn(page, 'editor');
  await page.goto(`/editor/amendments/${amendmentId}`);
  const history = page.getByRole('complementary', { name: 'Revision history' });
  await expect(history.locator('button.revision-item')).toHaveCount(2);
  await history.locator('button.revision-item').first().click();
  await expect(page.getByText('Viewing a past revision read-only.')).toBeVisible();
  await history.getByRole('button', { name: 'Restore as new draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(/Journey restoration/);
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(`/editor/amendments/${amendmentId}`);
  await page.getByRole('button', { name: 'Publish law' }).click();
  await expect(page.getByText('Amending law published.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Revision history' }).locator('button.revision-item')).toHaveCount(3);
});

test('publisher reviews stale quotes after a historical transcription correction', async ({ page, request }) => {
  test.setTimeout(120_000);
  const pair = await createIsolatedConstitution(request, `Journey quote constitution ${Date.now()}`);
  const sourceVersionId = pair.sourceVersionId;
  const amendmentId = await createPublishedRecord(request, `Journey quote review ${Date.now()}`, pair.constitutionId, sourceVersionId, pair.targetVersionId);
  await signIn(page, 'editor');
  await page.getByLabel('Correct this text').selectOption(sourceVersionId);
  await page.getByRole('button', { name: 'Correct this text' }).click();
  await page.getByLabel('Article text').fill('The historical dignity text was checked and corrected.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByLabel('What was corrected in this transcription?').fill('Corrected the historical transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  const sessionUrl = page.url();
  await signOut(page);

  await signIn(page, 'reviewer');
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'Approve review' }).click();
  await signOut(page);

  await signIn(page, 'publisher');
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText(/Published as version/)).toBeVisible();
  await page.goto(`/editor/amendments/${amendmentId}`);
  await expect(page.getByRole('heading', { name: 'Flagged record review' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm live quotes and republish' }).click();
  await expect(page.getByText('Quotes confirmed and the legal change republished.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Flagged record review' })).toHaveCount(0);
});

test('publisher withdraws an incorrect real legal-change record', async ({ page, request }) => {
  const pair = await createIsolatedConstitution(request, `Journey withdrawal constitution ${Date.now()}`);
  const title = `Journey withdrawn law ${Date.now()}`;
  const amendmentId = await createPublishedRecord(request, title, pair.constitutionId, pair.sourceVersionId, pair.targetVersionId);
  await signIn(page, 'publisher');
  await page.goto(`/editor/amendments/${amendmentId}`);
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByText('Amending law withdrawn.')).toBeVisible();
  await signOut(page);
  await page.goto(`/countries/${pair.countryIso}/timeline`);
  await expect(page.getByText(title)).toHaveCount(0);
});
