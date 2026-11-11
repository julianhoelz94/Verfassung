import { test, expect } from './fixtures/consent';
import { signInAdmin, signInEditor, signInPublisher, signInReviewer } from './helpers';
import path from 'node:path';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const country = '01900000-0000-4000-8000-000000000001';
const constitution = '01900000-0000-4000-8000-000000000002';
const region = '07100000-0000-4000-8000-000000000001';

test.beforeEach(async ({ request }) => {
  await request.post(mock + '/__reset');
  await request.post(mock + '/__country_directory');
  await request.post(mock + '/__editor_documents');
});

for (const [type, id, query, name] of [
  ['country', country, '?code=DE', 'Germany'],
  ['jurisdiction', region, '', 'Example Region'],
  ['constitution', constitution, '?code=DE', 'Basic Law for the Federal Republic of Germany'],
]) test(`rich ${type} Wiki retains formatting, immutable citations, preview and publication`, async ({ page, request }, info) => {
  page.on('pageerror', error => console.error('Wiki browser exception:', error.stack));
  page.on('console', message => { if (message.type() === 'error') console.error('Wiki client error:', message.text()); });
  await signInAdmin(page);
  const url = `/editor/wiki/${type}/${id}${query}`;
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Edit the background story' })).toBeVisible();
  await expect(page.locator('.owner-eyebrow')).toContainText(name);
  await page.screenshot({ path: info.outputPath('content.png'), fullPage: true });
  await page.getByLabel('Short description', { exact: true }).fill(`Context for ${type}`);
  const text = page.getByRole('textbox', { name: 'Page text', exact: true });
  await text.fill('Dignity and civic equality.');
  await text.press('ControlOrMeta+a');
  await page.getByRole('combobox', { name: 'Text style', exact: true }).selectOption('paragraph');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.getByRole('button', { name: 'Text color', exact: true }).click();
  await page.getByRole('button', { name: 'Forest green', exact: true }).click();
  await expect(text.locator('strong span, span strong')).toHaveText('Dignity and civic equality.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(text.locator('span[style]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await text.press('ControlOrMeta+End');
  await page.getByRole('button', { name: 'Cite source', exact: true }).click();
  const citation = page.getByRole('dialog', { name: 'Cite a source' });
  await citation.locator('summary').filter({ hasText: 'Choose another document' }).click();
  await citation.getByRole('button', { name: 'Upload new document', exact: true }).click();
  await citation.getByLabel('Title', { exact: true }).fill('Constitutional archive');
  await citation.locator('summary').filter({ hasText: 'Optional details' }).click();
  await citation.getByLabel('Source URL', { exact: true }).fill('https://example.org/archive');
  await citation.locator('summary').filter({ hasText: 'Publication details' }).click();
  await citation.getByLabel('Year or publication date', { exact: true }).fill('1949');
  await citation.getByRole('button', { name: 'Create and attach', exact: true }).click();
  await expect(citation.locator('.chosen-citation')).toContainText('Constitutional archive');
  await citation.getByLabel('Page / passage (optional)', { exact: true }).fill('pp. 12–14');
  await citation.getByRole('button', { name: 'Insert citation', exact: true }).click();
  await expect(text.locator('sup')).toHaveText('[1]');
  await text.locator('sup').click();
  const editCitation = page.getByRole('dialog', { name: 'Edit citation' });
  await editCitation.getByLabel('Page / passage (optional)', { exact: true }).fill('pp. 12–14');
  await editCitation.getByRole('button', { name: 'Update citation', exact: true }).click();
  await page.getByRole('tab', { name: 'Sources & media' }).click();
  await expect(page.locator('.source-section').first().getByRole('link', { name: 'Constitutional archive', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide preview pane' }).click();
  await page.getByRole('button', { name: 'Show preview pane' }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(text.locator('sup')).toHaveText('[1]');
  await page.getByRole('button', { name: 'Open viewer', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Viewer preview · current draft' });
  const viewerTypography = await viewer.locator('.wiki-body p').evaluate(element => { const style = getComputedStyle(element); return [style.fontFamily, style.fontSize, style.lineHeight]; });
  await viewer.getByRole('button', { name: /^Citation 1:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Cited source' })).toContainText('pp. 12–14');
  await viewer.getByRole('button', { name: /^Citation 1:/ }).press('Escape');
  await expect(page.getByRole('dialog', { name: 'Cited source' })).toHaveCount(0);
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved.');
  const before = await (await request.get(`${mock}/api/catalog/wiki/${type}/${id}`)).json();
  expect(before?.summary).not.toBe(`Context for ${type}`);
  await page.reload();
  await expect(text.locator('sup')).toHaveText('[1]');
  await expect(text.locator('[style]')).toHaveCSS('color', 'rgb(53, 90, 71)');
  await page.getByRole('button', { name: 'Review & publish' }).click();
  await page.getByRole('dialog', { name: 'Review before publishing' }).getByRole('button', { name: 'Publish page', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Wiki page published.');
  const published = await (await request.get(`${mock}/api/catalog/wiki/${type}/${id}`)).json();
  const document = await (await request.get(`${mock}/api/document/documents/${published.citations[0].documentId}`)).json();
  expect(document.revision.bibliography.issued).toBe('1949');
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.locator('.history-list').getByRole('button', { name: 'View', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Historical Wiki revision' })).toContainText('pp. 12–14');
  await page.getByRole('dialog', { name: 'Historical Wiki revision' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  expect(published.bodyDocument).toBeTruthy(); expect(published.citations[0].title).toBe('Constitutional archive');
  expect(published.bodyDocument.content[0].content.at(-1).attrs.reference).toMatchObject({ revision: 1, locator: 'pp. 12–14' });
  const publicPath = type === 'country' ? '/countries/DE?wiki=1' : type === 'jurisdiction' ? `/jurisdictions/${id}?wiki=1` : `/countries/DE/constitutions/${id}?view=wiki`;
  await page.screenshot({ path: info.outputPath(`${type}-workspace.png`), fullPage: true });
  await page.goto(publicPath);
  const publicWiki = page.getByRole('region', { name: 'Wiki', exact: true });
  await expect(publicWiki).toContainText(`Context for ${type}`);
  expect(await publicWiki.locator('.wiki-body p').evaluate(element => { const style = getComputedStyle(element); return [style.fontFamily, style.fontSize, style.lineHeight]; })).toEqual(viewerTypography);
});

for (const locale of ['en', 'de'] as const) for (const width of [390, 1440]) test(`${locale} Wiki tabs, optional metadata and pane at ${width}px`, async ({ page }, info) => {
  await signInAdmin(page);
  await page.request.put(`${mock}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: locale } });
  await page.setExtraHTTPHeaders({ 'Accept-Language': locale === 'de' ? 'de-DE' : 'en-GB' });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/editor/wiki/country/${country}?code=DE`);
  const copy = (en: string, de: string) => locale === 'en' ? en : de;
  await page.getByRole('tab', { name: copy('Sources & media', 'Quellen & Medien') }).click();
  const source = page.locator('.source-section').first();
  await source.getByRole('button', { name: copy('Upload new document', 'Neues Dokument hochladen'), exact: true }).click();
  await source.getByLabel(copy('Title', 'Titel'), { exact: true }).fill('Unfinished source');
  await source.locator('summary').filter({ hasText: copy('Optional details', 'Optionale Angaben') }).click();
  await source.locator('summary').filter({ hasText: copy('Publication details', 'Publikationsangaben') }).click();
  const date = source.getByLabel(copy('Year or publication date', 'Jahr oder Veröffentlichungsdatum'), { exact: true });
  await date.fill('1949');
  await page.getByRole('tab', { name: copy('Content', 'Inhalt'), exact: true }).click();
  await page.getByRole('tab', { name: copy('Sources & media', 'Quellen & Medien') }).click();
  await expect(date).toHaveValue('1949');
  const toggle = page.getByRole('button', { name: copy('Show preview pane', 'Vorschau einblenden') });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: copy('Hide preview pane', 'Vorschau ausblenden') }).click();
  await expect(date).toHaveValue('1949');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (element: HTMLElement) => Promise<{ violations: { id: string }[] }> } }).axe.run(document.body)).violations.map(item => item.id));
  expect(violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`wiki-${locale}-${width}.png`), fullPage: true });
});

for (const [role, signIn, writable, publishable] of [['editor', signInEditor, true, false], ['reviewer', signInReviewer, false, false], ['publisher', signInPublisher, false, true]] as const) test(`${role} Wiki permissions`, async ({ page }) => {
  await signIn(page); await page.goto(`/editor/wiki/country/${country}?code=DE`);
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(writable ? 1 : 0);
  await expect(page.getByRole('textbox', { name: 'Page text', exact: true })).toHaveCount(writable ? 1 : 0);
  await page.getByRole('button', { name: publishable ? 'Review & publish' : 'Review draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish page', exact: true })).toHaveCount(publishable ? 1 : 0);
});
