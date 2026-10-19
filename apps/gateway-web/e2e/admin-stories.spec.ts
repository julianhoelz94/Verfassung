import { expect, test } from './fixtures/consent';
import { signInAdmin, startEditorSession, VERSION_2022 } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('administrator manages a user and its access lifecycle', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/users');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('new-editor@example.local');
  await page.getByLabel('Roles (comma-separated)').first().fill('editor, reviewer');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('E2E-INVITE-ADMIN')).toBeVisible();

  await page.reload();
  const user = page.locator('.data-row').filter({ hasText: 'new-editor@example.local' });
  await expect(user).toContainText('Editor, Reviewer');
  await expect(user).toContainText('Invited');

  const activeUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await activeUser.getByRole('checkbox', { name: 'Publisher' }).check();
  await activeUser.getByRole('button', { name: 'Update roles' }).click();
  await page.reload();
  await expect(page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('checkbox', { name: 'Publisher' })).toBeChecked();
  await page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('button', { name: 'Issue reset token' }).click();
  await expect(page.getByText('E2E-RESET-ADMIN')).toBeVisible();
  await page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('button', { name: 'Disable' }).click();
  let persistedUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await expect(persistedUser).toContainText('Disabled');
  await expect(persistedUser.getByRole('button', { name: 'Activate' })).toBeVisible();
  await persistedUser.getByRole('button', { name: 'Activate' }).click();
  persistedUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await expect(persistedUser.getByRole('button', { name: 'Disable' })).toBeVisible();
});

test('administrator creates, rotates and revokes a service token', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/users');
  await page.getByLabel('Name').fill('CI integration');
  await page.getByLabel('Scopes (comma-separated)').fill('catalog:write');
  await page.getByRole('button', { name: 'Issue token' }).click();
  await expect(page.getByText('E2E-SERVICE-TOKEN')).toBeVisible();

  await page.reload();
  const token = page.locator('.data-row').filter({ hasText: 'CI integration' });
  await expect(token).toContainText('catalog:write');
  await token.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByText('E2E-ROTATED-TOKEN')).toBeVisible();
  await page.reload();
  await page.locator('.data-row').filter({ hasText: 'CI integration' }).getByRole('button', { name: 'Revoke' }).click();
  await page.reload();
  await expect(page.locator('.data-row').filter({ hasText: 'CI integration' })).toContainText('Revoked');
});

test('administrator stages constitution JSON for review without publishing it', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/import');
  await page.getByText('Paste JSON instead', { exact: true }).click();
  await page.getByLabel('Import JSON').fill(JSON.stringify({
    isoCode: 'US',
    countryName: 'United States',
    constitutionSlug: 'constitution',
    constitutionTitle: 'Constitution',
    versionLabel: '1789',
    sourceUrl: 'https://example.org/atlas-e2e/us-1789',
    articles: [{ articleNumber: '1', title: 'Legislative power', body: 'All legislative powers.' }],
  }));
  await page.getByRole('button', { name: 'Stage for review' }).click();
  await expect(page.getByRole('heading', { name: 'Import job' })).toBeVisible();
  await expect(page.getByText('Status: In review')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the published version' })).toHaveCount(0);
});

test('administrator creates a constitution and changes its outline settings', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Country').selectOption('DE');
  await page.getByLabel('Constitution title').fill('Test Constitution');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: /Articles only/ }).click();
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveCount(1);
  await page.getByRole('button', { name: /Articles and sections/ }).click();
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Label' }).nth(1).fill('Clause');
  await page.getByLabel('Allow text alongside child units').check();
  const preview = page.getByRole('complementary', { name: 'Live order example' });
  await expect(preview.getByText('The following rights are protected.', { exact: true }).first()).toBeVisible();
  await expect(preview.getByText('These rights apply to everyone.', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByRole('heading', { name: 'Review before creating' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/constitutions$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(page).toHaveURL(/\/admin\/constitutions$/);
  await page.getByRole('button', { name: 'Create constitution' }).click();
  await expect(page).toHaveURL(/\/admin\/constitutions\/[^/?]+$/, { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Test Constitution' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import the first version' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Label' }).nth(1)).toHaveValue('Clause');
  await page.getByLabel('How this layer is shown').nth(1).selectOption('concatenated');
  await page.getByRole('button', { name: 'Preview change impact' }).click();
  await expect(page.getByRole('heading', { name: 'Safe to save' })).toBeVisible();
  await page.getByRole('button', { name: 'Save outline' }).click();
  await expect(page).toHaveURL(/saved=1/, { timeout: 30000 });
  await expect(page.getByText('Settings saved. Historical versions retain their structural settings.')).toBeVisible();
  await expect(page.getByLabel('How this layer is shown').nth(1)).toHaveValue('concatenated');
});

test('guided creation exposes a manual catalog slug when a title cannot generate one', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Constitution title').fill('日本国憲法');
  await expect(page.getByText('Enter a catalog slug using Latin letters and numbers to continue.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Catalog slug' }).fill('japan-constitution');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: /Articles only/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Label' })).toHaveCount(1);
});

test('guided creation sends an expired administrator session to login', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Constitution title').fill('Expired Session Example');
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Create constitution' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('administrator can carry an editorial correction through every role action', async ({ page }) => {
  await signInAdmin(page);
  await startEditorSession(page, VERSION_2022, 'editorial_correction');
  await page.getByLabel('Article text').fill('Administrator correction.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByLabel('What was corrected in this transcription?').fill('Administrator fixed the transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText(/Published as version/)).toBeVisible();
});

test('outline mixed-content preview follows permissions on desktop and mobile', async ({ page }, testInfo) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions/01900000-0000-4000-8000-000000000002');
  const preview = page.getByRole('complementary', { name: 'Live order example' });
  await expect(preview.getByRole('heading', { name: 'Structure map' })).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'Reader preview' })).toBeVisible();
  const permission = page.getByLabel('Allow text alongside child units').first();
  await permission.check();
  await expect(preview.getByText('The following rights are protected.', { exact: true }).first()).toBeVisible();
  await expect(preview.getByText('These rights apply to everyone.', { exact: true }).first()).toBeVisible();
  await expect(preview.getByText('The law shall uphold these guarantees.', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('outline-desktop.png'), fullPage: true });
  await permission.uncheck();
  await expect(preview.getByText('The following rights are protected.', { exact: true })).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('outline-mobile.png'), fullPage: true });
});

test('administrator can find both legal pages and switch their language', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin');
  await page.locator('main').getByRole('link', { name: 'Legal pages', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit imprint' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Legal pages', exact: true }).getByRole('link', { name: 'Privacy notice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit privacy notice' })).toBeVisible();
  await page.getByRole('link', { name: 'English version', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/datenschutz_en$/);
  await expect(page.getByRole('navigation', { name: 'Legal pages', exact: true }).getByRole('link', { name: 'Imprint', exact: true })).toHaveAttribute('href', '/admin/legal/impressum_en');
  await page.getByRole('navigation', { name: 'Legal pages', exact: true }).getByRole('link', { name: 'Imprint', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/impressum_en$/);
  await page.getByRole('link', { name: 'German version', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/legal\/impressum$/);
});

test('administrator previews a structure proposal uploaded as a JSON file', async ({ page, request }) => {
  expect((await request.post(`${mockOrigin}/__sprint59_content`)).ok()).toBeTruthy();
  await signInAdmin(page);
  await page.goto('/admin/import');
  await page.getByRole('link', { name: /Set up a new constitution/ }).click();
  await expect(page.getByLabel('Setup proposal JSON')).toBeHidden();
  await page.getByLabel('Structure proposal file (JSON)').setInputFiles({
    name: 'structure.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      isoCode: 'DE', countryName: 'Germany', constitutionSlug: 'uploaded-proposal', constitutionTitle: 'Uploaded structure proposal',
      languageCode: 'en', sourceUrl: 'https://example.org/source', outline: { kinds: [] }, sampleRoots: [],
    })),
  });
  await page.getByRole('button', { name: 'Preview proposed structure' }).click();
  await expect(page).toHaveURL(/\/admin\/import\/setup\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Source and identity' })).toBeVisible();
  await expect(page.getByText('Germany (DE) · Uploaded structure proposal')).toBeVisible();
});

test('administrator saves grouped registration and mail settings', async ({ page, request }) => {
  expect((await request.post(`${mockOrigin}/__sprint59_content`)).ok()).toBeTruthy();
  await signInAdmin(page);
  await page.goto('/admin/settings');
  await page.locator('#smtpHost').fill('smtp.example.local');
  await page.getByRole('checkbox', { name: 'Allow people to register themselves' }).uncheck();
  await page.getByRole('button', { name: 'Save registration and mail settings' }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#smtpHost')).toHaveValue('smtp.example.local');
  await expect(page.getByRole('checkbox', { name: 'Allow people to register themselves' })).not.toBeChecked();
});
