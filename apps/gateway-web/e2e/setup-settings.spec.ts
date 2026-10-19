import { test, expect } from './fixtures/consent';
import { setupMessages as m } from '../lib/setup-messages';
import { reviewUi } from '../lib/ui-review-messages';
import { ui } from '../lib/messages';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

for (const locale of ['en', 'de'] as const) test.describe(`setup settings in ${locale}`, () => {
  test.use({ locale });

  test.beforeEach(async ({ context, request }, testInfo) => {
    await request.post(`${mock}/__reset`);
    await request.post(`${mock}/__sprint59_content`);
    await request.post(`${mock}/api/identity/login`, { data: { email: 'local-admin@example.local', password: 'change-me' } });
    await request.post(`${mock}/api/identity/login/mfa`, { data: { challengeToken: 'e2e-mfa-challenge', code: '123456' } });
    await context.addCookies([{ name: 'ca_session', value: 'e2e-session-token', url: String(testInfo.project.use.baseURL) }]);
    await request.post(`${mock}/__sprint59_setup`, { data: { completed: false } });
  });

  test('deferring email disables SMTP and registration, preserves settings, and can be reversed', async ({ page, request }) => {
    await page.goto('/setup');
    for (const [label, path] of [
      [m.imprint[locale], 'impressum'], [m.privacy[locale], 'datenschutz'],
      [m.englishImprint[locale], 'impressum_en'], [m.englishPrivacy[locale], 'datenschutz_en'],
    ]) await expect(page.locator('#operator').getByRole('link', { name: label, exact: true })).toHaveAttribute('href', `/admin/legal/${path}`);
    const mail = page.locator('#email');
    const defer = mail.getByLabel(m.deferEmail[locale], { exact: true });
    const registration = mail.locator('input[name="selfRegistrationEnabled"]');
    const enabled = mail.locator('input[name="mailEnabled"][type="checkbox"]');
    const save = mail.getByRole('button', { name: reviewUi.saveRegistrationMail[locale], exact: true });
    await expect(page.locator('#preferences input[name="mailDeferred"]')).toHaveCount(0);
    await expect(registration).toBeChecked();
    await defer.check();
    await expect(mail.locator('#smtpHost')).toBeDisabled();
    await expect(enabled).toBeDisabled();
    await expect(enabled).not.toBeChecked();
    await expect(registration).toBeDisabled();
    await expect(registration).not.toBeChecked();
    await expect(mail.getByText(m.registrationNeedsMail[locale], { exact: true })).toBeVisible();
    await expect(mail.getByRole('button', { name: ui.admin.settings.page.sendTestEmail[locale], exact: true })).toBeDisabled();
    await Promise.all([page.waitForEvent('load'), save.click()]);
    await expect(page).toHaveURL(/\/setup\?saved=1$/);
    await page.reload();
    await expect(defer).toBeChecked();
    await expect(mail.locator('#smtpHost')).toHaveValue('mailpit');
    await expect(registration).not.toBeChecked();
    expect(await (await request.get(`${mock}/api/identity/registration/status`)).json()).toEqual({ enabled: false });

    // Saving the separate general form must preserve the email decision.
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: m.save[locale], exact: true }).click()]);
    await expect(page).toHaveURL(/\/setup\?saved=1$/);
    await page.reload();
    await expect(defer).toBeChecked();

    await defer.uncheck();
    await enabled.check();
    await expect(mail.locator('#smtpHost')).toBeEnabled();
    await expect(registration).toBeEnabled();
    await expect(registration).not.toBeChecked();
    await registration.check();
    await Promise.all([page.waitForEvent('load'), save.click()]);
    await expect(page).toHaveURL(/\/setup\?saved=1$/);
    await page.reload();
    await expect(defer).not.toBeChecked();
    await expect(registration).toBeChecked();
    expect(await (await request.get(`${mock}/api/identity/registration/status`)).json()).toEqual({ enabled: true });
    await enabled.uncheck();
    await expect(registration).toBeDisabled();
    await expect(registration).not.toBeChecked();
  });

  for (const deferred of [false, true]) test(`managed registration still allows configuring mail when deferred=${deferred}`, async ({ page, request }) => {
    await request.post(`${mock}/__sprint59_setup`, { data: { completed: false, managedRegistration: true, mailEnabled: false, mailDeferred: deferred } });
    await page.goto('/setup');
    const mail = page.locator('#email');
    const defer = mail.getByLabel(m.deferEmail[locale], { exact: true });
    if (deferred) {
      await expect(defer).toBeEnabled();
      await defer.uncheck();
    }
    await expect(defer).toBeDisabled();
    const enabled = mail.locator('input[name="mailEnabled"][type="checkbox"]');
    await expect(enabled).toBeEnabled();
    await enabled.check();
    await expect(mail.locator('#smtpHost')).toBeEnabled();
    await expect(enabled).toBeDisabled();
    await Promise.all([page.waitForEvent('load'), mail.getByRole('button', { name: reviewUi.saveRegistrationMail[locale], exact: true }).click()]);
    await expect(page).toHaveURL(/\/setup\?saved=1$/);
    await page.reload();
    await expect(defer).not.toBeChecked();
    await expect(enabled).toBeChecked();
    await expect(mail.locator('input[name="selfRegistrationEnabled"]')).toBeChecked();
    expect(await (await request.get(`${mock}/api/identity/registration/status`)).json()).toEqual({ enabled: true });
  });

  for (const source of ['/setup', '/admin/settings']) test(`access settings keep the return to ${source} after authentication and saving`, async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(source);
    await page.getByRole('link', { name: m.accessLink[locale], exact: true }).click();
    const back = page.getByRole('link', { name: (source === '/setup' ? m.backToSetup : m.backToSettings)[locale], exact: true });
    await expect(back).toBeVisible();
    await request.post(`${mock}/__step_up_stale`);
    await page.getByRole('button', { name: ui.admin.anonymousBrowsing.anonymousbrowsingform.saveAnonymousBrowsing[locale], exact: true }).click();
    await expect(page).toHaveURL(/\/account\/step-up\?/);
    await page.getByLabel(ui.attrs.accountStepUpPageInputLabelAuthenticator[locale], { exact: true }).fill('123456');
    await page.getByRole('button', { name: ui.account.stepUp.page.continue[locale], exact: true }).click();
    await expect(back).toBeVisible();
    await page.getByRole('button', { name: ui.admin.anonymousBrowsing.anonymousbrowsingform.saveAnonymousBrowsing[locale], exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`returnTo=${encodeURIComponent(source)}&saved=1$`));
    await page.reload();
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${source}#${source === '/setup' ? 'preferences' : 'general'}$`));
  });
});
