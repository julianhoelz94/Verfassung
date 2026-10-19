import { expect, test } from './fixtures/consent';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test.describe('German device language', () => {
  test.use({ locale: 'de-DE' });

  test('uses German automatically and honors saved language choices', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { name: 'Einloggen' })).toBeVisible();

    await page.getByLabel('E-Mail').fill('local-viewer@example.local');
    await page.getByLabel('Passwort').fill('change-me');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/account');
    await page.getByLabel('Sprache der Website').selectOption('en');
    await page.getByRole('button', { name: 'Sprache speichern' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Website language')).toHaveValue('en');
    await page.getByLabel('Website language').selectOption('auto');
    await page.getByRole('button', { name: 'Save language' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByLabel('Sprache der Website')).toHaveValue('auto');
  });
});

test.describe('unsupported device language', () => {
  test.use({ locale: 'fr-FR' });

  test('falls back to English', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });
});
