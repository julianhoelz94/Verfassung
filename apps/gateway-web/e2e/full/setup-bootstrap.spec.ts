import { expect as baseExpect, test } from '../fixtures/consent';
import { authenticatorCode } from './auth';

const expect = baseExpect.configure({ timeout: 20_000 });

test('new deployment stays closed until the administrator completes setup', async ({ page, request }, testInfo) => {
  test.skip(process.env.E2E_SETUP_FRESH !== 'true', 'Run against a fresh deployment before uploading fixtures.');
  test.setTimeout(180_000);
  expect((await (await request.get('/api/identity/setup/status')).json()).completed).toBe(false);
  for (const path of ['/api/catalog/countries', '/api/search/search?q=test', '/mcp', '/oauth/register', '/api/docs/catalog/swagger-ui/index.html']) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(403);
  }
  await page.goto('/countries/DE');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Setup is in progress. Only the deployment administrator can sign in.')).toBeVisible();
  expect((await request.post('/api/identity/login', { data: { email: process.env.CI_VIEWER_EMAIL ?? 'ci-viewer@example.local', password: process.env.CI_VIEWER_PASSWORD ?? 'change-me' } })).status()).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill(process.env.CI_ADMIN_EMAIL ?? 'ci-admin@example.local');
  await page.getByLabel('Password', { exact: true }).fill(process.env.CI_ADMIN_PASSWORD ?? 'change-me');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('button', { name: 'Finish setup and open the site' })).toBeDisabled();
  await page.getByLabel('Configure email later', { exact: true }).check();
  await page.getByLabel('I have reviewed access and registration settings', { exact: true }).check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page).toHaveURL(/\/setup\?saved=1$/, { timeout: 15_000 });
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Configure email later', { exact: true })).toBeChecked();
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('setup-desktop.png'), fullPage: true });
  await page.goto('/admin/legal/impressum');
  for (const [field, value] of Object.entries({ name: 'Atlas integration operator', streetAddress: 'Integration Street 58', postalCode: '10115', city: 'Berlin', country: 'Germany', email: 'operator@example.test' })) await page.locator(`input[name="${field}"]`).fill(value);
  await page.getByRole('button', { name: 'Save contact draft', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/impressum\?saved=1$/);
  await expect(page.getByRole('button', { name: 'Publish reviewed contact', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish reviewed contact', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/impressum\?published=1$/);
  for (const key of ['impressum', 'datenschutz', 'impressum_en', 'datenschutz_en']) {
    await page.goto(`/admin/legal/${key}`);
    await page.locator('#legal-content').fill(`Integration-only reviewed ${key} for the isolated deployment. Operator information is maintained in the shared contact record.`);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/admin/legal/' + key + '[?]saved=1$'));
    await expect(page.getByRole('button', { name: 'Publish reviewed text', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publish reviewed text', exact: true }).click();
    await expect(page.getByText('Published revision updated.', { exact: true })).toBeVisible();
  }
  await page.goto('/setup');
  await expect(page.getByRole('button', { name: 'Finish setup and open the site' })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish setup and open the site' }).click();
  await expect(page).toHaveURL(/\/admin\/settings\?completed=1$/);
  expect((await (await request.get('/api/identity/setup/status')).json()).completed).toBe(true);
  expect((await request.get('/api/catalog/countries')).ok()).toBe(true);
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/admin\/settings$/);
});
