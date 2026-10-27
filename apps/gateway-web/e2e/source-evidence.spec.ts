import { expect, test } from './fixtures/consent';
import { VERSION_2022, signInEditor } from './helpers';

test('the reader source block opens a source correction with protected unsaved input', async ({ page, request }, testInfo) => {
  const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
  await request.post(`${mockOrigin}/__reset`);
  const href = `/countries/DE/versions/${VERSION_2022}`;
  await page.goto(href);
  await expect(page.getByRole('button', { name: 'Edit source information' })).toHaveCount(0);
  await signInEditor(page);
  await page.goto(href);
  await page.getByRole('button', { name: 'Edit source information' }).click();
  await expect(page).toHaveURL(/scope=sources/);
  await expect(page.getByRole('heading', { name: 'Edit source information' })).toBeVisible();
  await expect(page.locator('#source-evidence textarea')).toHaveCount(1);
  await expect(page.locator('#source-evidence select')).toHaveCount(0);
  await expect(page.locator('#source-change-reason textarea')).toHaveCount(1);
  await page.getByLabel('Source description', { exact: true }).fill('# Official source\n\n- [Official text](https://example.org/constitution)');
  await page.getByText('Preview source description', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Official text' })).toHaveAttribute('href', 'https://example.org/constitution');
  await page.getByLabel('Reason for the correction').fill('Describe the imported excerpt.');
  await expect(page.getByRole('button', { name: 'Save source draft' })).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Save the source information' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('source-editor.png'), fullPage: true });
});
