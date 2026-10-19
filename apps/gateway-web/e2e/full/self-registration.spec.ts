import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/consent';
import { signIn, signOut } from './auth';
import { adminHeaders } from './api-fixtures';

const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:18025';

test('closed registration can be opened by admin, confirmed by mail, and creates a viewer', async ({ page, request }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID();
  const email = `registration-${suffix}@example.test`;
  const testRecipient = `mail-check-${suffix}@example.test`;
  const password = 'Registration-journey-password-55';
  const mailSettings = {
    selfRegistrationEnabled: false, mailEnabled: false,
    mailFrom: 'no-reply@example.test', mailFromName: 'Constitution Atlas',
    mailPublicBaseUrl: 'http://127.0.0.1:18080', smtpHost: 'mailpit', smtpPort: 1025,
    smtpUsername: '', smtpAuth: false, smtpStarttls: false, smtpSsl: false,
  };

  async function deliveredText(recipient: string): Promise<string> {
    let body = '';
    await expect.poll(async () => {
      const response = await request.get(`${mailpit}/view/latest.txt?query=${encodeURIComponent(`to:${recipient}`)}`);
      body = response.ok() ? await response.text() : '';
      return response.ok();
    }, { timeout: 20_000 }).toBe(true);
    return body;
  }

  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0);
  await page.goto('/register');
  await expect(page.getByText('Registration is currently closed.')).toBeVisible();

  try {
    await signIn(page, 'admin');
    await page.goto('/admin/settings');
    await page.getByLabel('Allow people to register themselves').check();
    await page.getByLabel('Enable outgoing mail').check();
    await page.getByLabel('From address').fill(mailSettings.mailFrom);
    await page.getByLabel('Public site URL').fill(mailSettings.mailPublicBaseUrl);
    await page.getByLabel('SMTP host').fill(mailSettings.smtpHost);
    await page.getByLabel('SMTP port').fill(String(mailSettings.smtpPort));
    await page.getByLabel('SMTP authentication').uncheck();
    await page.getByLabel('STARTTLS').uncheck();
    await page.getByRole('button', { name: 'Save registration and mail settings', exact: true }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Allow people to register themselves')).toBeChecked();

    await page.getByLabel('Recipient').fill(testRecipient);
    await page.getByRole('button', { name: 'Send test email' }).click();
    await expect(page.getByText('Test email sent.')).toBeVisible();
    expect(await deliveredText(testRecipient)).toContain('Your mail configuration is working.');

    await signOut(page);
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send confirmation email' }).click();
    await expect(page.getByText(/you will receive a confirmation email/)).toBeVisible();
    const confirmationMail = await deliveredText(email);
    const confirmationUrl = confirmationMail.match(/https?:\/\/[^\s]+\/register\/confirm\?token=[A-Za-z0-9._~-]+/)?.[0];
    expect(confirmationUrl).toBeTruthy();
    await page.goto(confirmationUrl!);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Confirm and create account' }).click();
    await expect(page).toHaveURL(/\/login\?registered=1$/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/account');
    await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();
    await signOut(page);

    await signIn(page, 'admin');
    await page.goto('/admin/users');
    await page.getByLabel('Search email').fill(email);
    await page.locator('#main-content').getByRole('button', { name: 'Search' }).click();
    const user = page.locator('.data-row').filter({ hasText: email });
    const roles = user.locator(':scope > div').nth(2);
    await expect(roles).toContainText('Reader');
    await expect(roles).not.toContainText('publisher');
    await expect(roles).not.toContainText('admin');
  } finally {
    const headers = await adminHeaders(request);
    await request.put('/api/identity/admin/settings', { headers, data: mailSettings });
  }
});
