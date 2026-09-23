import { expect, test } from '@playwright/test';

const mockOrigin = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mockOrigin}/__reset`)).ok()).toBeTruthy();
});

test('visitor requests and completes a password reset', async ({ page }) => {
  await page.goto('/reset');
  await page.getByLabel('Email').fill('local-viewer@example.local');
  await page.getByRole('button', { name: 'Request reset' }).click();
  await expect(page.getByText(/If that account exists/)).toBeVisible();
  await page.getByLabel('Reset token').fill('e2e-reset-token');
  await page.getByLabel('New password').fill('replacement-password');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('local-viewer@example.local');
  await page.getByLabel('Password').fill('replacement-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('invited visitor activates the assigned account', async ({ page }) => {
  await page.goto('/invite?token=e2e-invite-token');
  await expect(page.getByLabel('Invite token')).toHaveValue('e2e-invite-token');
  await page.getByLabel('Password').fill('invited-password');
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('invited@example.local');
  await page.getByLabel('Password').fill('invited-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText('invited@example.local', { exact: true })).toBeVisible();
});

test('viewer changes password, enrolls MFA and receives recovery codes', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('local-viewer@example.local');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/account');
  await expect(page.getByText('Signed in as local-viewer@example.local.')).toBeVisible();
  await page.getByLabel('Current password').fill('change-me');
  await page.getByLabel('New password').fill('replacement-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated.')).toBeVisible();
  await page.getByRole('button', { name: 'Enroll authenticator' }).click();
  await expect(page).toHaveURL(/\/account\?enroll=1$/);
  await expect(page.getByText(/Authenticator secret:/)).toContainText('E2ESECRET');
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Confirm enrollment' }).click();
  await expect(page.getByText('RECOVERY-ONE')).toBeVisible();
  await page.getByRole('link', { name: 'Back to account' }).click();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Replace recovery codes' }).click();
  await expect(page.getByText('RECOVERY-NEW')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/login');
  await page.getByLabel('Email').fill('local-viewer@example.local');
  await page.getByLabel('Password').fill('replacement-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/$/);
});
