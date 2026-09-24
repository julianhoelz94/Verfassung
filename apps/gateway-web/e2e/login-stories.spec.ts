/* eslint-disable */
import { expect, test } from '@playwright/test';

const MOCK_ORIGIN = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? 4010}`;

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${MOCK_ORIGIN}/__reset`)).ok()).toBeTruthy();
});

const stories = [
  { role: 'editor', mfa: true, landing: '/editor', editorial: true, admin: false },
  { role: 'reviewer', mfa: false, landing: '/editor', editorial: true, admin: false },
  { role: 'publisher', mfa: true, landing: '/editor', editorial: true, admin: false },
  { role: 'admin', mfa: true, landing: '/editor', editorial: true, admin: true },
  { role: 'viewer', mfa: false, landing: '/', editorial: false, admin: false },
] as const;

for (const story of stories) {
  test(`${story.role} signs in, sees permitted navigation, and signs out`, async ({ page }) => {
    const email = `local-${story.role}@example.local`;
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('change-me');
    await page.getByRole('button', { name: 'Sign in' }).click();
    if (story.mfa) {
      await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
      await page.getByLabel('Authenticator code').fill('123456');
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page).toHaveURL(new RegExp(`${story.landing.replace('/', '\\/')}$`));
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const primary = page.getByRole('navigation', { name: 'Primary' });
    await expect(primary.getByRole('link', { name: 'Editor', exact: true })).toHaveCount(story.editorial ? 1 : 0);
    await expect(primary.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(story.admin ? 1 : 0);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === 'ca_session')).toBe(false);
  });
}

test('invalid credentials leave the visitor signed out', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('local-editor@example.local');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'ca_session')).toBe(false);
});

test('invalid authenticator code does not create a signed-in session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('local-publisher@example.local');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('That code could not be verified.')).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name === 'ca_session')).toBe(false);
});

test('viewer cannot use editorial or administrative pages by direct URL', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('local-viewer@example.local');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/editor');
  await expect(page.getByText('this account has no editorial role.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open session' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByText('Administrator role required.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0);
});

test('reviewer cannot open editing controls or administer constitutions', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('local-reviewer@example.local');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Correct this text' })).toHaveCount(0);
  await page.goto('/admin/constitutions');
  await expect(page.getByText('Administrator role required.')).toBeVisible();
});
