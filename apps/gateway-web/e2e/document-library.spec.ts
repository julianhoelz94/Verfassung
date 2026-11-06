import { test, expect } from './fixtures/consent';
import { signInEditor, signInPublisher } from './helpers';
import { LIBRARY_DOCUMENT, LIBRARY_FOLDER } from './fixtures/document-library.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  await request.post(`${mockOrigin}/__reset`);
  await request.post(`${mockOrigin}/__document_library`);
});

test('project folders add membership, retain All documents and support scoped BibTeX import/export', async ({ page }) => {
  await signInEditor(page);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('Federalism project');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const projects = page.getByRole('complementary', { name: 'Project folders' });
  const folderSection = projects.locator('section').filter({ has: page.getByRole('heading', { name: 'Project folders', exact: true }) });
  await expect(folderSection.getByRole('button', { name: 'Federalism project', exact: true })).toBeVisible();
  const draggedRow = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Federalism and constitutions', exact: true }) });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await draggedRow.dispatchEvent('dragstart', { dataTransfer: transfer });
  const dropTarget = folderSection.getByRole('button', { name: 'Federalism project', exact: true }).locator('..');
  await dropTarget.dispatchEvent('dragover', { dataTransfer: transfer });
  await dropTarget.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('status')).toContainText('Folder membership updated');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select: Federalism and constitutions' }).check();
  await page.getByRole('combobox', { name: 'Add to folder', exact: true }).selectOption({ label: 'Federalism project' });
  await page.getByRole('button', { name: 'Add to folder', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Folder membership updated');
  await folderSection.getByRole('button', { name: 'Federalism project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Federalism and constitutions', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Select: Federalism and constitutions' }).check();
  await page.getByRole('button', { name: 'Remove from this folder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No documents found.' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Federalism and constitutions', exact: true })).toBeVisible();
  await folderSection.getByRole('button', { name: 'Germany project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Federalism and constitutions', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import BibTeX', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Import destination' })).toHaveValue(LIBRARY_FOLDER);
  await page.getByLabel('Choose a .bib file').setInputFiles({ name: 'project.bib', mimeType: 'text/x-bibtex', buffer: Buffer.from('@book{Project2025, title = {Imported project source}, year = {2025}}') });
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Imported project source', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import confirmed entries' }).click();
  await expect(page.getByRole('button', { name: 'Imported project source', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('Export folder', { exact: true }).click();
  await page.getByRole('link', { name: 'BibTeX only (.bib)', exact: true }).click();
  const download = await downloadPromise;
  const filename = await download.path();
  const exported = await readFile(filename!, 'utf8');
  expect(exported).toContain('Project2025');
  expect(exported).toContain('Mueller2024');
  await page.getByText('Export folder', { exact: true }).click();
  const zipDownloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'BibTeX with files (.zip)', exact: true }).click();
  const zipDownload = await zipDownloadPromise;
  expect(zipDownload.suggestedFilename()).toBe('documents.zip');
  const zip = await readFile((await zipDownload.path())!);
  expect(zip.subarray(0, 4)).toEqual(Buffer.from([80, 75, 3, 4]));
  await page.getByRole('checkbox', { name: 'Select: Federalism and constitutions', exact: true }).check();
  await page.getByText('Export selected', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'BibTeX with files (.zip)', exact: true })).toHaveAttribute('href', `/documents/command?action=export&folderId=${LIBRARY_FOLDER}&documentIds=${LIBRARY_DOCUMENT}&includeFiles=true`);
  const selectedDownloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'BibTeX with files (.zip)', exact: true }).click();
  expect((await selectedDownloadPromise).suggestedFilename()).toBe('documents.zip');
  await projects.getByRole('button', { name: 'All documents', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Imported project source', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Federalism and constitutions', exact: true })).toBeVisible();
});

test('publisher can inspect and export but cannot mutate library through direct commands', async ({ page }) => {
  await signInPublisher(page);
  await page.goto(`/documents?documentId=${LIBRARY_DOCUMENT}`);
  await expect(page.getByText('You can read, download and export this library.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New document', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import BibTeX', exact: true })).toHaveCount(0);
  await expect(page.getByText('Export library', { exact: true })).toBeVisible();
  const status = await page.evaluate(async () => (await fetch('/documents/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'folder-create', name: 'Forbidden folder' }) })).status);
  expect(status).toBe(403);
});

for (const locale of ['en', 'de']) {
  test(`library follows shared design with narrow reflow and accessible controls (${locale})`, async ({ page, request }, testInfo) => {
    await signInEditor(page);
    await request.put(`${mockOrigin}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: locale } });
    await page.goto(`/documents?documentId=${LIBRARY_DOCUMENT}`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`library-${locale}-${width}.png`), fullPage: true });
      if (width === 1440 && locale === 'en') {
        await page.getByText('Export library', { exact: true }).click();
        await page.screenshot({ path: testInfo.outputPath('library-export-desktop.png') });
        await page.getByText('Export library', { exact: true }).click();
      }
    }
    await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => {
      // @ts-expect-error The accessibility library is injected into the test browser.
      return (await window.axe.run(document.querySelector('main'))).violations.map((item: { id: string }) => item.id);
    });
    expect(violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 1000 });
    const toolbar = page.getByRole('navigation', { name: locale === 'en' ? 'Documents toolbar' : 'Dokumentenwerkzeuge' });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: locale === 'en' ? 'Close document details' : 'Dokumentdetails schließen', exact: true }).click();
    await expect(dialog).toBeHidden();
    const hideFolders = locale === 'en' ? 'Hide project folders' : 'Projektordner ausblenden';
    const showFolders = locale === 'en' ? 'Show project folders' : 'Projektordner einblenden';
    await toolbar.getByRole('button', { name: hideFolders, exact: true }).click();
    await expect(page.getByRole('complementary', { name: locale === 'en' ? 'Project folders' : 'Projektordner' })).toBeHidden();
    await toolbar.getByRole('button', { name: showFolders, exact: true }).click();
    await toolbar.getByRole('button', { name: locale === 'en' ? 'Show document details' : 'Dokumentdetails einblenden', exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const mobileViolations = await page.evaluate(async () => {
      // @ts-expect-error The accessibility library is injected into the test browser.
      return (await window.axe.run(document.querySelector('main'))).violations.map((item: { id: string }) => item.id);
    });
    expect(mobileViolations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  });
}
