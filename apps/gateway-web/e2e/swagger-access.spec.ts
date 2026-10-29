import { expect, test } from './fixtures/consent';
import { signInAdmin } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('administrator controls public Swagger visibility', async ({ page, browser }) => {
  const visitor = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const publicPage = await visitor.newPage();
  try {
    await publicPage.goto('/about');
    await expect(publicPage.locator('#api-docs a')).toHaveCount(9);

    await signInAdmin(page);
    await page.goto('/admin/settings');
    const toggle = page.getByRole('checkbox', { name: 'Allow public Swagger UI access' });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByRole('button', { name: 'Save API documentation settings' }).click();
    await expect(page).toHaveURL(/saved=swagger/);
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await publicPage.reload();
    await expect(publicPage.locator('#api-docs')).toHaveCount(0);

    await toggle.check();
    await page.getByRole('button', { name: 'Save API documentation settings' }).click();
    await expect(page).toHaveURL(/saved=swagger/);
    await expect(toggle).toBeChecked();
    await publicPage.reload();
    await expect(publicPage.locator('#api-docs a')).toHaveCount(9);
  } finally {
    await visitor.close();
  }
});

test('changing Swagger access requires fresh administrator authentication', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/settings');
  await page.request.post(`${mockOrigin}/__step_up_stale`);
  await page.getByRole('checkbox', { name: 'Allow public Swagger UI access' }).uncheck();
  await page.getByRole('button', { name: 'Save API documentation settings' }).click();
  await expect(page).toHaveURL(/\/account\/step-up\?returnTo=/);
  expect(await (await page.request.get(`${mockOrigin}/api/identity/swagger-access`)).json()).toEqual({ enabled: true });
});
