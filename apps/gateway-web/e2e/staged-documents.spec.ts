import { test, expect } from './fixtures/consent';
import { signInAdmin, signInPublisher } from './helpers';
import path from 'node:path';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const constitution = '01900000-0000-4000-8000-000000000002';
const country = '01900000-0000-4000-8000-000000000001';
const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const document = { id: documentId, currentRevision: 2, status: 'active', createdAt: '2026-01-01', citationKey: 'Archive2026', revision: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', documentId, revision: 2, title: 'Archival evidence', sourceUrl: 'https://example.org/archive', fileName: 'map.png', contentType: 'image/png', description: null, createdBy: 'editor', createdAt: '2026-01-01' } };

test.beforeEach(async ({ page, request }) => {
  await request.post(mock + '/__reset');
  await request.post(mock + '/__editor_documents');
  await page.route('**/editor/documents/command?**', async route => {
    const query = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: query.get('command') === 'folders' ? [] : query.get('command') === 'revisions' ? { revisions: [document.revision] } : query.get('command') === 'document' ? document : { items: [document], total: 1, offset: 0, limit: 30 } });
  });
});

for (const width of [390, 1440]) test(`new amendments stage documents before first save and preserve failed saves at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await signInAdmin(page);
  await page.goto(`/editor/amendments/new?constitutionId=${constitution}`);
  await page.getByLabel('Title', { exact: true }).fill('Unsaved amendment');
  await page.getByRole('navigation', { name: 'Amendment workspace' }).getByRole('button', { name: 'Affected passages', exact: true }).click();
  await page.getByLabel('Public amendment comment').fill('This draft cites Chapter 3.');
  await page.getByRole('navigation', { name: 'Amendment workspace' }).getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Choose existing document', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Search documents' });
  await search.fill('Archival');
  await expect(page.getByRole('option', { name: /Archival evidence/ })).toBeVisible();
  await search.press('ArrowDown'); await search.press('Enter');
  await page.getByText('Citation note / relevant passage', { exact: true }).click();
  await page.getByLabel('Note for this attachment').fill('Chapter 3, pp. 42–45');
  await page.getByRole('button', { name: 'Attach document', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Archival evidence', exact: true })).toHaveAttribute('href', `/documents/${documentId}?revision=2`);
  const saved: FormData[] = [];
  await page.route('**/editor/command', async route => { saved.push(await new Response(route.request().postData()!, { headers: { 'content-type': route.request().headers()['content-type'] } }).formData()); await route.fulfill({ status: 502, json: { key: 'documents', savedId: 'saved-amendment' } }); });
  // Playwright sees multipart data as bytes; inspect the owner FormData directly as well.
  expect(await page.locator('#amendment-draft-form').evaluate(form => JSON.parse(String(new FormData(form as HTMLFormElement).get('stagedDocuments'))))).toEqual([{ documentId, revision: 2, citationNote: 'Chapter 3, pp. 42–45' }]);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText(/The amendment was saved, but its documents/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Archival evidence', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Amendment workspace' }).getByRole('button', { name: 'Affected passages', exact: true }).click();
  await expect(page.getByLabel('Public amendment comment')).toHaveValue('This draft cites Chapter 3.');
  expect(saved).toHaveLength(1);
  expect(saved[0].get('creationAttemptId')).toBeTruthy();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => saved.length).toBe(2);
  expect(saved[1].get('amendmentId')).toBe('saved-amendment');
  expect(saved[1].get('creationAttemptId')).toBe(saved[0].get('creationAttemptId'));
  await page.getByRole('navigation', { name: 'Amendment workspace' }).getByRole('button', { name: 'Documents', exact: true }).click();
  await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (element: HTMLElement) => Promise<{ violations: { id: string }[] }> } }).axe.run(document.body)).violations.map(item => item.id));
  expect(violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('new-amendment-staged.png'), fullPage: true });
  await testInfo.attach('Staged amendment documents', { path: testInfo.outputPath('new-amendment-staged.png'), contentType: 'image/png' });
});

test('publishers can stage existing event sources while upload stays restricted to editors and admins', async ({ page }) => {
  await signInPublisher(page);
  await page.goto(`/editor/lifecycle/${constitution}?code=DE`);
  const form = page.locator('form').filter({ has: page.locator('#event-date') });
  await expect(form.getByRole('button', { name: 'Upload new document', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: 'Choose existing document', exact: true }).click();
  await form.getByRole('combobox', { name: 'Search documents' }).fill('Archive');
  await form.getByRole('option', { name: /Archival evidence/ }).click();
  await form.getByRole('button', { name: 'Attach document', exact: true }).click();
  await expect(form.getByRole('link', { name: 'Archival evidence', exact: true })).toBeVisible();
  expect(await form.evaluate(node => JSON.parse(String(new FormData(node as HTMLFormElement).get('stagedDocuments'))))).toEqual([{ documentId, revision: 2 }]);
});

test('Wiki images reuse the filtered picker and retain page-owned alternative text and credits', async ({ page, request }, testInfo) => {
  await request.post(mock + '/__sprint50_content');
  await signInAdmin(page);
  await page.goto(`/editor/wiki/country/${country}?code=DE`);
  await page.locator('summary').filter({ hasText: /^Pictures/ }).click();
  const picker = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Add a picture', exact: true }) }).last();
  const response = page.waitForRequest(request => request.url().includes('command=search') && request.url().includes('kind=image'));
  await picker.getByRole('button', { name: 'Choose existing document', exact: true }).click();
  await response;
  await picker.getByRole('combobox', { name: 'Search documents' }).fill('map');
  await picker.getByRole('option', { name: /Archival evidence/ }).click();
  await picker.getByRole('button', { name: 'Attach document', exact: true }).click();
  await page.getByLabel('Alternative text', { exact: true }).fill('Map of the constitutional regions');
  await page.getByText('Caption, credit and placement', { exact: true }).click();
  await page.getByLabel('Credit', { exact: true }).last().fill('National archive');
  await expect(page.locator(`[name="alt-${documentId}"]`)).toHaveValue('Map of the constitutional regions');
  expect(JSON.parse(await page.locator('[name=newImages]').inputValue())).toMatchObject([{ documentId, revision: 2 }]);
  await page.screenshot({ path: path.join(testInfo.outputDir, 'wiki-image-library.png'), fullPage: true });
});
