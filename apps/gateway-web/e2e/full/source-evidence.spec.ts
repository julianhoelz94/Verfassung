import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/consent';
import { adminHeaders } from './api-fixtures';
import { signIn, signOut } from './auth';

test('source corrections are reviewed, attributed and published without changing constitutional text', async ({ page, request, context }) => {
  test.setTimeout(180_000);
  const headers = await adminHeaders(request);
  async function json(response: Awaited<ReturnType<typeof request.get>>) {
    const body = await response.json(); expect(response.ok(), JSON.stringify(body)).toBeTruthy(); return body;
  }
  const constitution = await json(await request.post('/api/catalog/countries/XA/constitutions', { headers, data: {
    slug: `source-review-${randomUUID()}`, title: 'Source review journey',
    outline: [{ kindCode: 'article', displayLabel: 'Article', labelPolicy: 'required', titlePolicy: 'optional' }],
  } }));
  const original = { dateWording: 'Last amended in 2025', datePrecision: 'year', coverage: 'Excerpt', statusWording: 'Archived source', attribution: 'Original archive' };
  const version = await json(await request.post(`/api/catalog/constitutions/${constitution.id}/versions`, { headers, data: { versionLabel: '2025', languageCode: 'en', sourceEvidence: original } }));
  const content = await json(await request.put(`/api/content/versions/${version.id}/content`, { headers, data: {
    expectedGeneration: 0, roots: [{ kind: 'article', label: '1', content: [{ type: 'text', text: 'Unchanged constitutional text.' }] }],
  } }));
  await json(await request.post(`/api/catalog/versions/${version.id}/publish`, { headers }));
  const readerHref = `/countries/XA/versions/${version.id}`;
  await page.goto(readerHref);
  await expect(page.getByRole('button', { name: 'Edit source information' })).toHaveCount(0);
  await signIn(page, 'editor'); await page.goto(readerHref);
  await page.getByRole('button', { name: 'Edit source information' }).click();
  await expect(page.getByRole('heading', { name: 'Edit source information' })).toBeVisible();
  await page.getByLabel('Coverage of the imported text').fill('Articles 1–10 only');
  await page.getByLabel('Reason for the correction').fill('State the excerpt precisely');
  await page.getByRole('button', { name: 'Save source draft' }).click();
  await expect(page.getByText('Source draft saved. The public source information is unchanged.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Coverage of the imported text')).toHaveValue('Articles 1–10 only');
  const sessionId = new URL(page.url()).searchParams.get('sessionId')!;
  const sessionHref = `/editor?sessionId=${sessionId}`;
  const staleTab = await context.newPage(); await staleTab.goto(sessionHref);
  await page.getByLabel('Source attribution').fill('Correct archive attribution');
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save source draft' }).click();
  await expect.poll(async () => (await json(await request.get(`/api/editor/edit-sessions/${sessionId}`, { headers }))).sourceEvidenceRevisions[0].revision).toBe(2);
  await staleTab.getByLabel('Source attribution').fill('Stale correction');
  await staleTab.getByRole('button', { name: 'Save source draft' }).click();
  await expect(staleTab.getByRole('alert')).toContainText('Your input is retained');
  await expect(staleTab.getByLabel('Source attribution')).toHaveValue('Stale correction');
  await staleTab.close({ runBeforeUnload: false });
  expect((await json(await request.get(`/api/catalog/versions/${version.id}`))).sourceEvidence).toEqual(original);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await signOut(page); await signIn(page, 'reviewer'); await page.goto(sessionHref);
  await expect(page.getByLabel('Coverage of the imported text')).toHaveCount(0);
  await page.getByLabel('Required changes and reason').fill('Add the archive operator');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await signOut(page); await signIn(page, 'editor'); await page.goto(sessionHref);
  await page.getByLabel('Source attribution').fill('Archive operator, official source');
  await page.getByLabel('Reason for the correction').fill('Include the archive operator as requested');
  await page.getByRole('button', { name: 'Save source draft' }).click();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  const staleApproval = await request.post(`/api/editor/edit-sessions/${sessionId}/approval`, { headers, data: { sourceEvidenceRevision: 2 } });
  expect(staleApproval.status()).toBe(409);
  await signOut(page); await signIn(page, 'reviewer'); await page.goto(sessionHref);
  await page.getByRole('button', { name: 'Approve source correction' }).click();
  expect((await json(await request.get(`/api/catalog/versions/${version.id}`))).sourceEvidence).toEqual(original);
  await signOut(page); await signIn(page, 'publisher'); await page.goto(sessionHref);
  await page.getByRole('button', { name: 'Publish source correction' }).click();
  await expect(page.getByRole('link', { name: 'Open published correction' })).toBeVisible();
  const result = await json(await request.get(`/api/editor/edit-sessions/${sessionId}`, { headers }));
  expect(result.sourceEvidenceDecisions.map((decision: { action: string }) => decision.action)).toEqual(['review_submitted', 'changes_requested', 'review_submitted', 'review_approved', 'version_published']);
  expect(result.sourceEvidenceRevisions).toHaveLength(3);
  expect(result.sourceEvidenceDecisions.every((decision: { actorId: string; createdAt: string; revision: number }) => decision.actorId && decision.createdAt && decision.revision)).toBeTruthy();
  const successor = await json(await request.get(`/api/catalog/versions/${result.newVersionId}`));
  expect(successor.sourceEvidence.coverage).toBe('Articles 1–10 only');
  expect(successor.sourceEvidence.attribution).toBe('Archive operator, official source');
  expect(successor.legalVersionId).toBe(version.id);
  const successorContent = await json(await request.get(`/api/content/versions/${result.newVersionId}/content`));
  expect(successorContent.roots.map((root: { revisionId: string }) => root.revisionId)).toEqual(content.roots.map((root: { revisionId: string }) => root.revisionId));
  expect((await json(await request.get(`/api/catalog/versions/${version.id}`))).sourceEvidence).toEqual(original);
  await page.getByRole('link', { name: 'Open published correction' }).click();
  await expect(page.getByText('Archive operator, official source', { exact: true })).toBeVisible();
  await expect(page.getByText('Unchanged constitutional text.', { exact: true })).toBeVisible();
});
