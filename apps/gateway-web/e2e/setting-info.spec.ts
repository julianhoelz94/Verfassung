import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('constitution setup explains whether settings can be changed later', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  const interimInfo = page.locator('.setting-inline').filter({ hasText: 'Interim constitution' }).getByRole('button', { name: 'Setting information' });
  await interimInfo.click();
  await expect(page.getByRole('note')).toContainText('Set once when the constitution is created.');
  await page.getByRole('heading', { name: 'Basics' }).click();
  await expect(page.getByRole('note')).toHaveCount(0);

  const countryInfo = page.locator('.field').filter({ has: page.getByLabel('Country', { exact: true }) }).getByRole('button', { name: 'Setting information' });
  await countryInfo.click();
  await expect(page.getByRole('note')).toContainText('country that this constitution belongs to');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('note')).toHaveCount(0);

  await page.getByLabel('Constitution title').fill('Test charter');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.locator('.field').filter({ has: page.getByLabel('Label', { exact: true }) }).getByRole('button', { name: 'Setting information' }).first().click();
  await expect(page.getByRole('note')).toContainText('Can be changed later after an impact check.');
});

test('setting information stays inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Constitution title').fill('Test charter');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: 'Setting information' }).last().click();
  const bounds = await page.getByRole('note').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
