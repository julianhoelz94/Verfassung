import { expect, test } from '../fixtures/consent';
import { signIn } from './auth';
import { adminHeaders, createIsolatedConstitution } from './api-fixtures';

test('document revisions link from both editors and appear on public readers without creating a legal hop', async ({ page, request }) => {
  test.setTimeout(120_000);
  const title = `Sprint 48 document ${Date.now()}`;
  const fixture = await createIsolatedConstitution(request, `${title} constitution`);
  const headers = await adminHeaders(request);
  const before = await (await request.get(`/api/catalog/constitutions/${fixture.constitutionId}/versions`, { headers })).json();

  await signIn(page, 'admin');
  await page.goto('/editor/documents/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Source URL').fill('https://example.org/sprint-48-document');
  await page.getByRole('button', { name: 'Create document' }).click();
  await expect(page).toHaveURL(/\/editor\/documents\/[^/?]+\?created=1/, { timeout: 15_000 });
  await expect(page.getByText('Document created.')).toBeVisible();
  const documentId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByLabel('Title').fill(`${title} revised`);
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByRole('heading', { name: `${title} revised`, exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Document revision saved.')).toBeVisible();
  await page.getByLabel('PDF or text file, up to 20 MB').setInputFiles({ name: 'source.txt', mimeType: 'text/plain', buffer: Buffer.from('Official source file') });
  await page.getByRole('button', { name: 'Upload file' }).click();
  await expect(page.getByRole('link', { name: 'Download source.txt' })).toBeVisible();
  await page.getByText('Document details and revisions', { exact: true }).click();
  await expect(page.getByRole('link', { name: /Revision 1:/ })).toBeVisible();
  expect((await request.get(`/api/document/documents/${documentId}`)).status()).toBe(404);
  expect((await request.get(`/api/document/documents/${documentId}/revisions`)).status()).toBe(401);

  await page.goto(`/admin/constitutions/${fixture.constitutionId}`);
  await page.getByLabel('Search documents').fill(`${title} revised`);
  await page.getByLabel('Select a document').selectOption(documentId);
  await page.getByRole('button', { name: 'Attach' }).click();
  await expect(page.getByRole('heading', { name: 'Linked documents' })).toBeVisible();
  await expect.poll(async () => {
    const response = await request.get(`/api/document/links/constitution/${fixture.constitutionId}`, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).some((link: { documentId: string }) => link.documentId === documentId);
  }).toBe(true);
  await expect(page.getByRole('link', { name: `${title} revised` })).toBeVisible({ timeout: 15_000 });
  const linkedDocument = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: `${title} revised`, exact: true }) });
  await linkedDocument.getByRole('button', { name: 'Detach', exact: true }).click();
  await expect.poll(async () => {
    const response = await request.get(`/api/document/links/constitution/${fixture.constitutionId}`, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).some((link: { documentId: string }) => link.documentId === documentId);
  }).toBe(false);
  await expect(page.getByRole('link', { name: `${title} revised`, exact: true })).toHaveCount(0);
  await page.getByLabel('Select a document').selectOption(documentId);
  await page.getByRole('button', { name: 'Attach' }).click();
  await expect(page.getByRole('link', { name: `${title} revised`, exact: true })).toBeVisible({ timeout: 15_000 });
  await page.goto(`/countries/${fixture.countryIso}/versions/${fixture.targetVersionId}`);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Constitution documents' })).toBeVisible();
  await expect(page.getByRole('link', { name: `${title} revised` })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: `${title} revised` }).click();
  await expect(page.getByRole('heading', { name: `${title} revised` })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download source.txt' })).toBeVisible();

  const created = await request.post(`/api/amendment/constitutions/${fixture.constitutionId}/amendments`, { headers, data: {
    title: `${title} law`, comment: 'Source citation.', documents: [], changes: [],
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const amendmentId = (await created.json()).id;
  await page.goto(`/editor/amendments/${amendmentId}`);
  await page.getByLabel('Search documents').fill(`${title} revised`);
  await page.getByLabel('Select a document').selectOption(documentId);
  const attachment = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/editor/amendments/${amendmentId}`));
  await page.getByRole('button', { name: 'Attach' }).click();
  expect((await attachment).status()).toBe(200);
  await expect(page.getByRole('link', { name: `${title} revised` })).toBeVisible({ timeout: 15_000 });
  const savedRevision = await request.post(`/api/amendment/amendments/${amendmentId}/revisions`, { headers, data: {
    title: `${title} law`, comment: 'Source citation after a draft edit.', documents: [], changes: [],
  } });
  expect(savedRevision.ok(), await savedRevision.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('link', { name: `${title} revised` })).toBeVisible();
  const published = await request.post(`/api/amendment/amendments/${amendmentId}/publish`, { headers });
  expect(published.ok(), await published.text()).toBeTruthy();
  const publishedRevisionId = (await published.json()).publishedRevisionId;
  const detachPublished = await request.delete(`/api/document/links/amendment/${amendmentId}/${documentId}?scopeRevisionId=${publishedRevisionId}`, { headers });
  expect(detachPublished.status()).toBe(400);
  await page.goto(`/countries/${fixture.countryIso}/timeline`);
  await page.getByRole('button', { name: `${title} law`, exact: true }).click();
  await expect(page.getByRole('link', { name: `${title} revised` })).toBeVisible();

  const after = await (await request.get(`/api/catalog/constitutions/${fixture.constitutionId}/versions`, { headers })).json();
  expect(after).toHaveLength(before.length);
});
