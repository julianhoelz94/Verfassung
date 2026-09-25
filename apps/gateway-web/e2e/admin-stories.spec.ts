import { expect, test } from '@playwright/test';
import { signInAdmin } from './helpers';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('administrator manages a user and its access lifecycle', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/users');
  await page.getByLabel('Email').fill('new-editor@example.local');
  await page.getByLabel('Roles (comma-separated)').first().fill('editor, reviewer');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('E2E-INVITE-ADMIN')).toBeVisible();

  await page.reload();
  const user = page.locator('.data-row').filter({ hasText: 'new-editor@example.local' });
  await expect(user).toContainText('editor, reviewer');
  await expect(user).toContainText('invited');

  const activeUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await activeUser.getByLabel('Roles (comma-separated)').fill('admin, publisher');
  await activeUser.getByRole('button', { name: 'Update roles' }).click();
  await expect(page.locator('.data-row').filter({ hasText: 'local-admin@example.local' })).toContainText('admin, publisher');
  await page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('button', { name: 'Issue reset token' }).click();
  await expect(page.getByText('E2E-RESET-ADMIN')).toBeVisible();
  await page.locator('.data-row').filter({ hasText: 'local-admin@example.local' }).getByRole('button', { name: 'Disable' }).click();
  let persistedUser = page.locator('.data-row').filter({ hasText: 'local-admin@example.local' });
  await expect(persistedUser).toContainText('disabled');
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
  await expect(page.locator('.data-row').filter({ hasText: 'CI integration' })).toContainText('Revoked');
});

test('administrator imports constitution JSON and opens the resulting version link', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/import');
  await page.getByLabel('Import JSON').fill(JSON.stringify({
    isoCode: 'US',
    countryName: 'United States',
    constitutionSlug: 'constitution',
    constitutionTitle: 'Constitution',
    versionLabel: '1789',
    articles: [{ articleNumber: '1', title: 'Legislative power', body: 'All legislative powers.' }],
  }));
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByRole('heading', { name: 'Import job' })).toBeVisible();
  await expect(page.getByText('Status: completed')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the published version' })).toHaveAttribute('href', /\/countries\/US\/versions\//);
});

test('administrator creates a constitution and changes its outline settings', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/admin/constitutions');
  await page.getByLabel('Country').selectOption('DE');
  await page.getByLabel('Slug').fill('test-constitution');
  await page.getByLabel('Title', { exact: true }).fill('Test Constitution');
  await page.getByRole('button', { name: 'Add deeper layer' }).click();
  await page.getByRole('textbox', { name: 'Label' }).nth(1).fill('Clause');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Test Constitution' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Label' }).nth(1)).toHaveValue('Clause');
  await page.getByLabel('How this layer is shown').nth(1).selectOption('concatenated');
  await page.getByRole('button', { name: 'Save outline' }).click();
  await expect(page.getByText('Outline saved.')).toBeVisible();
  await expect(page.getByLabel('How this layer is shown').nth(1)).toHaveValue('concatenated');
});

test('administrator can carry an editorial correction through every role action', async ({ page }) => {
  await signInAdmin(page);
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Correct this text' }).click();
  await page.getByLabel('Article text').fill('Administrator correction.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByLabel('What was corrected in this transcription?').fill('Administrator fixed the transcription.');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Approve review' }).click();
  await page.getByRole('button', { name: 'Publish transcription' }).click();
  await expect(page.getByText(/Published as version/)).toBeVisible();
});
