import { test, expect } from './fixtures/consent';
import { signInAdmin, startEditorSession, VERSION_2022 } from './helpers';
import { selectStructureLevel } from './structure-workspace';

test.use({ actionTimeout: 10000 });

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const constitution = '01900000-0000-4000-8000-000000000002';
const proposal = '01900000-0000-4000-8000-000000000802';

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy();
});

test('the structure task bar stays below the actual site header while scrolling', async ({ page }) => {
  await signInAdmin(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`/admin/constitutions/${constitution}`);
    const tasks = page.getByRole('toolbar', { name: 'Constitution workspace', exact: true });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await expect.poll(async () => {
      const menu = await tasks.boundingBox();
      const header = await page.locator('.topbar').boundingBox();
      return menu!.y - (header!.y + header!.height);
    }).toBeGreaterThanOrEqual(-1);
    await tasks.getByRole('tab', { name: 'Structure', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Reader preview', exact: true }).filter({ visible: true })).toBeVisible();
  }
});

test('one structure workspace retains native help, explicit placement and save review', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInAdmin(page);
  await page.goto(`/admin/constitutions/${constitution}`);
  const tasks = page.getByRole('toolbar', { name: 'Constitution workspace', exact: true });
  const editor = page.getByRole('region', { name: 'Article Structure', exact: true });
  const alignment = await page.locator('[data-outline-path="0"]').evaluate(node => ({ parent: node.querySelector('button > span')!.getBoundingClientRect().left, child: node.querySelector('li')!.getBoundingClientRect().left }));
  expect(Math.abs(alignment.parent - alignment.child)).toBeLessThan(1);
  await expect(editor.getByRole('textbox', { name: 'Reader-facing name' })).toHaveValue('Article');
  await editor.getByRole('button', { name: 'Structure', exact: true }).click();
  const technical = editor.locator('details').filter({ hasText: 'Technical identity' });
  await technical.locator('summary').click();
  await technical.getByRole('button', { name: 'Setting information' }).click();
  await expect(technical).toHaveAttribute('open', '');
  await expect(page.getByRole('note')).toContainText('Kind code');
  await page.keyboard.press('Escape');
  const paragraph = page.getByRole('navigation', { name: 'Levels', exact: true }).getByRole('button', { name: 'Paragraph Structural level', exact: true });
  await paragraph.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Insert between Article and Paragraph', exact: true }).click();
  await expect(page.getByRole('region', { name: 'New level Structure', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Reader-facing name' }).fill('Clause');
  await tasks.getByRole('tab', { name: 'Review', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Save outline', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview change impact', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Safe to save', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save outline', exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByText('Settings saved. Historical versions retain their structural settings.')).toBeVisible();
  await selectStructureLevel(page, 'Clause', 'Display');
  await expect(page.getByRole('textbox', { name: 'Reader-facing name', exact: true })).toHaveValue('Clause');
  await page.screenshot({ path: testInfo.outputPath('settings-desktop.png'), fullPage: true });
});

for (const locale of ['en', 'de']) test(`creation and import share the responsive workspace in ${locale}`, async ({ page, request }, testInfo) => {
  await signInAdmin(page);
  await request.put(`${mock}/api/identity/me/language`, { headers: { Authorization: 'Bearer e2e-session-token' }, data: { languagePreference: locale } });
  await page.setExtraHTTPHeaders({ 'Accept-Language': locale });
  const de = locale === 'de';
  await page.goto('/admin/constitutions');
  await expect(page.getByRole('tab', { name: de ? 'Angaben' : 'Details', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel(de ? 'Verfassungstitel' : 'Constitution title').fill('Example charter');
  await page.getByRole('button', { name: de ? 'Weiter zur Strukturierung' : 'Continue to structure', exact: true }).click();
  await expect(page.getByRole('button', { name: de ? 'Vorlage verwenden' : 'Use this template', exact: true })).toBeVisible();
  await expect(page.locator('button[aria-pressed] small')).toHaveCount(5);
  await page.getByRole('button', { name: de ? 'Vorlage verwenden' : 'Use this template', exact: true }).click();
  const tasks = page.getByRole('toolbar', { name: de ? 'Verfassungseditor' : 'Constitution workspace', exact: true });
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.getByRole('textbox', { name: de ? 'Name in der Leseansicht' : 'Reader-facing name' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`creation-${locale}-${width}.png`), fullPage: true });
  }
  await tasks.getByRole('tab', { name: de ? 'Struktur' : 'Structure', exact: true }).click();
  const preview = page.getByRole('region', { name: de ? 'Vorschau des Lesers' : 'Reader preview', exact: true }).filter({ visible: true });
  await expect(preview.locator('[data-preview-kind="appendix"]').first()).toBeVisible();
  const term = preview.getByRole('button', { name: /^Kind name of the level Article:|^Art-Bezeichnung der Ebene Article:/ }).first();
  await term.click();
  await expect(page.getByRole('tooltip').filter({ hasText: de ? 'Art-Bezeichnung' : 'Kind name' })).toBeVisible();
  await page.keyboard.press('Escape');
  await request.post(`${mock}/__sprint59_content`);
  await page.goto(`/admin/import/setup/${proposal}`);
  await expect(page.getByRole('button', { name: de ? 'Strukturänderung anfordern' : 'Request structural changes', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Article ' + (de ? 'Struktur' : 'Structure'), exact: true }).getByRole('button', { name: de ? 'Struktur' : 'Structure', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: de ? 'Kann auf der obersten Ebene stehen' : 'May appear at the top level', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: de ? 'Änderungen anfordern' : 'Request changes', exact: true }).click();
  await expect(page.locator('#setup-requested-changes')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath(`import-review-${locale}-320.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('viewer and editor preview share reading choices while editing remains independent', async ({ page, request }, testInfo) => {
  await request.post(`${mock}/__continuous_reader`);
  await signInAdmin(page);
  await page.goto(`/countries/DE/versions/${VERSION_2022}`);
  const surface = page.locator('[data-reader-document]').first();
  const wording = await surface.textContent();
  await page.getByRole('button', { name: 'Reading preferences', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show hierarchy guides', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Show indentation', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Show hierarchy guides', exact: true })).toHaveCount(0);
  await expect(surface).toHaveAttribute('data-hierarchy-indentation', 'false');
  await expect(surface).toHaveText(wording!);
  await page.getByRole('checkbox', { name: 'Show indentation', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Show hierarchy guides', exact: true })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(surface).toHaveAttribute('data-hierarchy-guides', 'false');
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  const canvas = page.locator('#draft-form [contenteditable=true]').first();
  const source = await canvas.textContent();
  const operations = page.locator('#draft-form input[name=structuredDraft]');
  const before = await operations.inputValue();
  const display = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Display$/ }) });
  await display.locator('summary').click();
  await expect(page.getByRole('checkbox', { name: 'Show hierarchy guides', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Show indentation', exact: true }).uncheck();
  await expect(canvas).toHaveText(source!);
  await expect(operations).toHaveValue(before);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(display).toHaveAttribute('open', '');
  await expect(page.getByRole('checkbox', { name: 'Show indentation', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Show hierarchy guides', exact: true })).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('editor-preview.png'), fullPage: true });
});
