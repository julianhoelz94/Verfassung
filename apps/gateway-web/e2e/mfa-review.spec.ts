import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/consent';
import { signInAdmin, signOut } from './helpers';
import { setupSecretFromQr } from './qr';
import { authenticatorCode } from './full/auth';
import { REVIEW_CURRENT, REVIEW_CORRECTION } from './fixtures/ui-review.mjs';

const mock = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;
test.beforeEach(async ({ request }) => { expect((await request.post(`${mock}/__reset`)).ok()).toBeTruthy(); });

async function passwordSignIn(page: Page, email = 'local-admin@example.local') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('authenticator is the default; only the selected recovery method is submitted', async ({ page }) => {
  await passwordSignIn(page);
  await expect(page.getByLabel('Recovery code')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
  await expect(page.getByLabel('Recovery code')).toBeFocused();
  await expect(page.getByLabel('Authenticator code', { exact: true })).toHaveCount(0);
  await page.getByLabel('Recovery code').fill('invalid-recovery');
  await page.locator('form.mfa-form').evaluate(form => {
    const inactive = document.createElement('input'); inactive.name = 'code'; inactive.value = '123456'; inactive.type = 'hidden'; form.append(inactive);
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Recovery code')).toBeVisible();
  await page.getByRole('button', { name: 'Use authenticator app instead', exact: true }).click();
  await expect(page.getByLabel('Authenticator code', { exact: true })).toBeFocused();
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.locator('form.mfa-form').evaluate(form => {
    const inactive = document.createElement('input'); inactive.name = 'recoveryCode'; inactive.value = 'invalid-recovery'; inactive.type = 'hidden'; form.append(inactive);
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
});

test('first-login QR enrollment and one-use recovery codes work with manual fallback hidden', async ({ page, request }) => {
  await request.post(`${mock}/__mfa_enrollment`);
  await passwordSignIn(page);
  await expect(page).toHaveURL(/\/login\/mfa\?enroll=1$/);
  const secret = await setupSecretFromQr(page);
  await expect(page.locator('.setup-key')).not.toBeVisible();
  await page.getByText("Can't scan the QR code?", { exact: true }).click();
  await expect(page.locator('.setup-key')).toHaveText(secret);
  await page.getByLabel('Authenticator code', { exact: true }).fill(authenticatorCode(secret));
  await page.getByRole('button', { name: 'Confirm enrollment', exact: true }).click();
  await expect(page.getByText('RECOVERY-ONE', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.waitForLoadState('networkidle');
  await signOut(page);
  await passwordSignIn(page);
  await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
  await page.getByLabel('Recovery code').fill('RECOVERY-ONE');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.waitForLoadState('networkidle');
  await signOut(page);
  await passwordSignIn(page);
  await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
  await page.getByLabel('Recovery code').fill('RECOVERY-ONE');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Recovery code')).toBeVisible();
});

test('legal versions stay prominent while text corrections require deliberate inspection', async ({ page, request }) => {
  await request.post(`${mock}/__sprint59_content`);
  await page.goto('/countries/DE');
  await expect(page.locator('.chip-row').getByText('2022', { exact: true })).toBeVisible();
  await expect(page.getByText('2022-1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('2022-2', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Amendment timeline', exact: true })).toBeVisible();
  await page.goto(`/countries/DE/versions/${REVIEW_CURRENT}`);
  await expect(page.locator('.snapshot-notice')).toHaveCount(0);
  await page.goto(`/countries/DE/versions/${REVIEW_CORRECTION}`);
  await expect(page.locator('.snapshot-notice')).toBeVisible();
  await page.getByRole('link', { name: 'Read current text', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${REVIEW_CURRENT}$`));
  await signInAdmin(page);
  await page.goto('/countries/DE');
  await expect(page.getByRole('link', { name: 'Text corrections', exact: true })).not.toBeVisible();
  await page.getByText('Structure and editorial details', { exact: true }).click();
  await page.getByRole('link', { name: 'Text corrections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Snapshot history' })).toBeVisible();
  await expect(page.getByRole('link', { name: '2022-1', exact: true })).not.toBeVisible();
  await page.getByText('Text corrections', { exact: true }).first().click();
  await page.getByRole('link', { name: '2022-1', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${REVIEW_CORRECTION}$`));
});

test.describe('German MFA', () => {
  test.use({ locale: 'de' });
  test('QR setup and recovery method remain usable in German', async ({ page, request }) => {
    await request.post(`${mock}/__mfa_enrollment`);
    async function login() {
      await page.goto('/login');
      await page.locator('#email').fill('local-admin@example.local');
      await page.locator('#password').fill('change-me');
      await page.locator('form').filter({ has: page.locator('#password') }).getByRole('button').click();
    }
    await login();
    await expect(page).toHaveURL(/enroll=1/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const secret = await setupSecretFromQr(page);
    await expect(page.locator('.setup-key')).not.toBeVisible();
    await page.getByText('QR-Code lässt sich nicht scannen?', { exact: true }).click();
    await expect(page.locator('.setup-key')).toHaveText(secret);
    await page.locator('input[name="code"]').fill(authenticatorCode(secret));
    await page.locator('form').filter({ has: page.locator('input[name="code"]') }).getByRole('button').click();
    await expect(page.locator('.recovery-codes')).toBeVisible();
    await page.getByRole('link', { name: 'Weiter', exact: true }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await page.waitForLoadState('networkidle');
    await page.context().clearCookies();
    await login();
    await expect(page.locator('input[name="recoveryCode"]')).toHaveCount(0);
    const recovery = page.getByRole('button', { name: 'Wiederherstellungscode verwenden', exact: true });
    await recovery.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('input[name="recoveryCode"]')).toBeFocused();
    await page.locator('input[name="recoveryCode"]').fill('invalid');
    await page.locator('form.mfa-form').getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Stattdessen Authenticator-App verwenden', exact: true }).click();
    await expect(page.locator('input[name="code"]')).toBeFocused();
    await page.locator('input[name="code"]').fill(authenticatorCode(secret));
    await page.locator('form.mfa-form').getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page).toHaveURL(/\/editor$/);
  });
});

test('a phone editor can reach Save draft and reopen the saved text', async ({ page, request }) => {
  await request.post(`${mock}/__sprint59_content`);
  await signInAdmin(page);
  await page.setViewportSize({ width: 320, height: 900 });
  const response = await request.post(`${mock}/api/editor/edit-sessions`, { data: { versionId: REVIEW_CURRENT, hopKind: 'editorial_correction' } });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.goto(`/editor?sessionId=${session.id}&versionId=${REVIEW_CURRENT}`);
  await page.getByLabel('Article text', { exact: true }).fill('Saved from a narrow phone viewport.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.reload();
  await expect(page.getByLabel('Article text', { exact: true })).toHaveValue('Saved from a narrow phone viewport.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});
