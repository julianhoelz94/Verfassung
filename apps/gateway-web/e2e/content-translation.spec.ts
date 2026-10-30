import { expect, test } from './fixtures/consent';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
const reader = '/countries/DE/versions/01900000-0000-4000-8000-000000000004';

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test.describe('German device language', () => {
  test.use({ locale: 'de-DE' });

  test('translation requires login and can show the original', async ({ page }) => {
    await page.goto(reader);
    await expect(page.getByRole('button', { name: 'Diesen Inhalt übersetzen' })).toBeVisible();
    await expect(page.getByText('Melden Sie sich an, um diesen Inhalt zu übersetzen.')).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('E-Mail').fill('local-viewer@example.local');
    await page.getByLabel('Passwort').fill('change-me');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto(reader);
    await page.getByRole('button', { name: 'Diesen Inhalt übersetzen' }).click();
    await expect(page.getByRole('button', { name: 'Original anzeigen' })).toBeVisible();
    await expect(page.locator('.content-translation [lang="de"]').getByText(/\[de\]/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Leseeinstellungen' }).click();
    await page.getByRole('combobox', { name: 'Detailgrad' }).selectOption({ label: 'Übersicht' });
    await page.keyboard.press('Escape');
    const articleToggle = page.locator('h2 button').first();
    await articleToggle.click();
    await expect(articleToggle).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Original anzeigen' }).click();
    await expect(page.locator('.content-translation > div[lang="en"]')).toBeVisible();
    await expect(page.locator('.content-translation').getByText(/\[de\]/)).toHaveCount(0);
  });
});
