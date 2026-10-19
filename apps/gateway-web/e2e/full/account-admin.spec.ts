import { setupSecretFromQr } from '../qr';
import { expect, test } from '../fixtures/consent';
import { authenticatorCode, signIn, signOut } from './auth';

// Enrollment and recovery values must not enter retained browser traces.
test.use({ trace: 'off' });

test('administrator invite, visitor activation, password change, and reset persist across logins', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `journey-${Date.now()}@example.local`;
  const firstPassword = 'Journey-first-password-47';
  const changedPassword = 'Journey-changed-password-47';
  const resetPassword = 'Journey-reset-password-47';

  await signIn(page, 'admin');
  await page.goto('/admin/users');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Roles (comma-separated)').first().fill('viewer');
  await page.getByRole('button', { name: 'Send invite' }).click();
  const inviteToken = await page.getByText('Invite created.', { exact: false }).locator('code').textContent();
  expect(inviteToken).toBeTruthy();
  await signOut(page);

  await page.goto(`/invite?token=${encodeURIComponent(inviteToken!)}`);
  await page.getByLabel('Password').fill(firstPassword);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(firstPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/account');
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();
  await page.getByRole('region', { name: 'Change password' }).getByLabel('Current password').fill(firstPassword);
  await page.getByLabel('New password').fill(changedPassword);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/account') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Update password' }).click(),
  ]);
  await signOut(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(changedPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await signOut(page);

  await signIn(page, 'admin');
  await page.goto('/admin/users');
  const user = page.locator('.data-row').filter({ hasText: email });
  await expect(user).toContainText('Reader');
  await user.getByRole('button', { name: 'Issue reset token' }).click();
  const resetToken = await user.getByText('Reset token issued.', { exact: false }).locator('code').textContent();
  expect(resetToken).toBeTruthy();
  await signOut(page);

  await page.goto('/reset');
  await page.getByLabel('Reset token').fill(resetToken!);
  await page.getByLabel('New password').fill(resetPassword);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(resetPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/account');
  const sessionToken = (await page.context().cookies()).find((cookie) => cookie.name === 'ca_session')?.value;
  expect(sessionToken).toBeTruthy();
  const enrollResponse = await page.request.post('/api/identity/mfa/enroll/start', {
    headers: { Authorization: `Bearer ${sessionToken}` },
    data: {},
  });
  expect(enrollResponse.ok()).toBeTruthy();
  const enrollment = await enrollResponse.json() as { challengeToken: string; secret: string };
  await page.context().addCookies([{
    name: 'ca_mfa_challenge', value: enrollment.challengeToken, url: page.url(),
    httpOnly: true, sameSite: 'Lax',
  }]);
  await page.goto('/account?enroll=1');
  const secret = await setupSecretFromQr(page);
  await expect(page.locator('.setup-key')).not.toBeVisible();
  await page.getByText("Can't scan the QR code?", { exact: true }).click();
  await expect(page.locator('.setup-key')).toHaveText(secret);
  expect(secret).toBe(enrollment.secret);
  await page.getByLabel('Authenticator code').fill(authenticatorCode(secret!));
  await page.getByRole('button', { name: 'Confirm enrollment' }).click();
  await expect(page.getByText(/recovery codes now/)).toBeVisible();
  await page.getByRole('link', { name: 'Back to account' }).click();
  await expect(page.locator('#recoveryRotateCode')).not.toBeVisible();
  await page.locator('summary').filter({ hasText: /^Replace recovery codes$/ }).click();
  await page.locator('#recoveryRotateCode').fill(authenticatorCode(secret!));
  await page.getByRole('button', { name: 'Replace recovery codes' }).click();
  await expect(page.getByText(/recovery codes now/)).toBeVisible();
  await signOut(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(resetPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill(authenticatorCode(secret!));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('administrator creates, rotates, and revokes a real service token', async ({ page }) => {
  const name = `journey-token-${Date.now()}`;
  await signIn(page, 'admin');
  await page.goto('/admin/users');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Scopes (comma-separated)').fill('catalog:write');
  await page.getByRole('button', { name: 'Issue token' }).click();
  await expect(page.getByText('Token created.', { exact: false }).locator('code')).not.toBeEmpty();
  await page.reload();
  const token = page.locator('.data-row').filter({ hasText: name });
  await expect(token).toContainText('catalog:write');
  await token.getByRole('button', { name: 'Rotate' }).click();
  await expect(token.getByText('Token rotated.', { exact: false }).locator('code')).not.toBeEmpty();
  await page.reload();
  await page.locator('.data-row').filter({ hasText: name }).getByRole('button', { name: 'Revoke' }).click();
  await expect(page.locator('.data-row').filter({ hasText: name })).toContainText('Revoked');
});

test('administrator creates a constitution and updates its outline presentation', async ({ page }) => {
  const title = `Journey Outline ${Date.now()}`;
  await signIn(page, 'admin');
  await page.goto('/admin/constitutions');
  await page.getByLabel('Country').selectOption('XA');
  await page.getByLabel('Constitution title').fill(title);
  await page.getByRole('button', { name: 'Continue to structure' }).click();
  await page.getByRole('button', { name: 'Add deeper layer' }).click();
  await page.getByRole('textbox', { name: 'Label' }).nth(1).fill('Clause');
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await page.getByRole('button', { name: 'Create constitution' }).click();
  await expect(page).toHaveURL(/\/admin\/constitutions\/[^/?]+$/, { timeout: 30000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Label' }).nth(1)).toHaveValue('Clause');
  await page.getByLabel('How this layer is shown').nth(1).selectOption('concatenated');
  await page.getByRole('button', { name: 'Preview change impact' }).click();
  await expect(page.getByRole('heading', { name: 'Safe to save' })).toBeVisible();
  await page.getByRole('button', { name: 'Save outline' }).click();
  await expect(page.getByText('Settings saved. Historical versions retain their structural settings.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('How this layer is shown').nth(1)).toHaveValue('concatenated');
});

test('publisher enrolls with the rendered QR and uses a recovery code once', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `qr-mfa-${Date.now()}@example.local`;
  const password = 'Sprint-59-publisher-setup-password';
  await signIn(page, 'admin');
  await page.goto('/admin/users');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Roles (comma-separated)').first().fill('publisher');
  await page.getByRole('button', { name: 'Send invite', exact: true }).click();
  const token = await page.getByText('Invite created.', { exact: false }).locator('code').textContent();
  expect(token).toBeTruthy();
  await signOut(page);
  await page.goto(`/invite?token=${encodeURIComponent(token!)}`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Activate account', exact: true }).click();
  async function passwordLogin() {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await passwordLogin();
  await expect(page).toHaveURL(/\/login\/mfa\?enroll=1$/);
  const secret = await setupSecretFromQr(page);
  await expect(page.locator('.setup-key')).not.toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(secret));
  await page.getByRole('button', { name: 'Confirm enrollment', exact: true }).click();
  await expect(page.locator('.recovery-codes')).toBeVisible();
  const recovery = await page.locator('.recovery-codes code').first().textContent();
  expect(recovery).toBeTruthy();
  await page.getByRole('link', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editor', exact: true })).toBeVisible();
  await signOut(page);
  await passwordLogin();
  await expect(page.getByLabel('Recovery code')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
  await page.getByLabel('Recovery code').fill(recovery!);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await signOut(page);
  await passwordLogin();
  await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
  await page.getByLabel('Recovery code').fill(recovery!);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/method=recovery/);
  await page.getByRole('button', { name: 'Use authenticator app instead', exact: true }).click();
  await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(secret));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
});
