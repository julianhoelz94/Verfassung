import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/consent';
import { signIn } from './auth';
import { adminHeaders, createIsolatedConstitution } from './api-fixtures';
import { openStructureTask } from '../structure-workspace';

test('document revisions link from both editors and appear on public readers without creating a legal hop', async ({ page, request }) => {
  test.setTimeout(120_000);
  const title = `Sprint 48 document ${Date.now()}`;
  const fixture = await createIsolatedConstitution(request, `${title} constitution`);
  const headers = await adminHeaders(request);
  const before = await (await request.get(`/api/catalog/constitutions/${fixture.constitutionId}/versions`, { headers })).json();

  await signIn(page, 'admin');
  await page.goto('/editor/documents/new');
  await expect(page).toHaveURL(/\/documents\?new=1/);
  const details = page.getByRole('dialog');
  await details.getByLabel('Title', { exact: true }).fill(title);
  await details.getByLabel('Source URL', { exact: true }).fill('https://example.org/sprint-48-document');
  await details.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has('documentId')).toBe(true);
  const documentId = new URL(page.url()).searchParams.get('documentId')!;
  await expect(details.getByRole('button', { name: 'Save revision', exact: true })).toBeVisible();
  await details.getByLabel('Title', { exact: true }).fill(`${title} revised`);
  await details.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(details.getByRole('heading', { name: `${title} revised`, exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(details.getByText('Revision 2', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Files', exact: true }).click();
  await details.getByLabel('Choose file', { exact: true }).setInputFiles({ name: 'source.txt', mimeType: 'text/plain', buffer: Buffer.from('Official source file') });
  await details.getByRole('button', { name: 'Add attachment', exact: true }).click();
  await expect(details.getByText('source.txt', { exact: true })).toBeVisible();
  await expect(details.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'History', exact: true }).click();
  await expect(details.getByText(`Revision 1: ${title}`, { exact: true })).toBeVisible();
  expect((await request.get(`/api/document/documents/${documentId}`)).status()).toBe(404);
  expect((await request.get(`/api/document/documents/${documentId}/revisions`)).status()).toBe(401);

  await page.goto(`/admin/constitutions/${fixture.constitutionId}`);
  await openStructureTask(page, 'Documents');
  await page.getByRole('button', { name: 'Choose existing document', exact: true }).click();
  await page.getByLabel('Search documents').fill(`${title} revised`);
  await page.getByRole('option', { name: new RegExp(`^${title} revised`) }).click();
  await expect(page.getByRole('button', { name: 'Attach document', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Attach document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await request.get(`/api/document/links/constitution/${fixture.constitutionId}`, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).some((link: { documentId: string }) => link.documentId === documentId);
  }).toBe(true);
  await expect(page.getByRole('link', { name: `${title} revised` })).toBeVisible({ timeout: 15_000 });
  const linkedDocument = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: `${title} revised`, exact: true }) });
  await linkedDocument.getByRole('button', { name: /^Detach:/ }).click();
  await expect.poll(async () => {
    const response = await request.get(`/api/document/links/constitution/${fixture.constitutionId}`, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).some((link: { documentId: string }) => link.documentId === documentId);
  }).toBe(false);
  await expect(page.getByRole('link', { name: `${title} revised`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose existing document', exact: true }).click();
  await page.getByLabel('Search documents', { exact: true }).fill(`${title} revised`);
  await page.getByRole('option', { name: new RegExp(`^${title} revised`) }).click();
  await expect(page.getByRole('button', { name: 'Attach document', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Attach document', exact: true }).click();
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
  await page.goto(`/editor/amendments/${amendmentId}?view=documents`);
  await page.getByRole('button', { name: 'Choose existing document', exact: true }).click();
  await page.getByLabel('Search documents').fill(`${title} revised`);
  await page.getByRole('option', { name: new RegExp(`^${title} revised`) }).click();
  const attachment = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/editor/documents/command'));
  await expect(page.getByRole('button', { name: 'Attach document', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Attach document', exact: true }).click();
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

test('passage citations publish only the selected document revision through the real service wiring', async ({ request }) => {
  test.setTimeout(120_000);
  const fixture = await createIsolatedConstitution(request, `Citation publication ${Date.now()}`);
  const headers = await adminHeaders(request);
  const created = await request.post('/api/document/documents', { headers, data: { title: 'Pinned archive source', sourceUrl: 'https://example.org/cited-source' } });
  expect(created.ok(), await created.text()).toBe(true);
  const document = await created.json();
  const revised = await request.put(`/api/document/documents/${document.id}`, { headers, data: { title: 'Later catalog metadata', expectedRevision: 1 } });
  expect(revised.ok(), await revised.text()).toBe(true);
  expect((await request.get(`/api/document/documents/${document.id}?revision=1`)).status()).toBe(404);
  const settings = await (await request.get(`/api/catalog/constitutions/${fixture.constitutionId}/settings`, { headers })).json();
  const successor = await request.post(`/api/catalog/constitutions/${fixture.constitutionId}/versions`, { headers, data: {
    versionLabel: `citation-${randomUUID()}`, effectiveDate: '2024-01-01', languageCode: 'en',
    predecessorVersionId: fixture.targetVersionId, hopKind: 'legal', structuralSettingsRevisionId: settings.id,
  } });
  expect(successor.ok(), await successor.text()).toBe(true);
  const version = await successor.json();
  const target = { type: 'document', documentId: document.id, documentRevision: 1, locator: 'Chapter 3' };
  const stored = await request.put(`/api/content/versions/${version.id}/content`, { headers, data: {
    expectedGeneration: 0, roots: [{ logicalId: randomUUID(), kind: 'article', label: '1', title: 'Cited provision', content: [{ type: 'text', logicalId: randomUUID(), text: 'See source.', references: [{ logicalId: randomUUID(), start: 0, end: 3, target }] }] }],
  } });
  expect(stored.ok(), await stored.text()).toBe(true);
  const publication = await request.post(`/api/catalog/versions/${version.id}/publish`, { headers });
  expect(publication.ok(), await publication.text()).toBe(true);
  const visible = await request.get(`/api/document/documents/${document.id}?revision=1`);
  expect(visible.ok(), await visible.text()).toBe(true);
  expect((await visible.json()).revision.title).toBe('Pinned archive source');
  expect((await request.get(`/api/document/documents/${document.id}`)).status()).toBe(404);
  const snapshot = await (await request.get(`/api/content/versions/${version.id}/content`)).json();
  expect(snapshot.roots[0].content[0].references[0].target).toMatchObject(target);
});
