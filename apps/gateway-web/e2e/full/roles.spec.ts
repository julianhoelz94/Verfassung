import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

function authenticatorCode(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase().replace(/=|\s/g, '')) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid test authenticator secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) { bytes.push((value >> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}

const roles = [
  { role: 'editor', mfa: true, admin: false, canEdit: true },
  { role: 'reviewer', mfa: false, admin: false, canEdit: false },
  { role: 'publisher', mfa: true, admin: false, canEdit: false },
  { role: 'admin', mfa: true, admin: true, canEdit: true },
] as const;

for (const story of roles) {
  test(`${story.role} signs in and sees real role permissions`, async ({ page }) => {
    const email = process.env[`CI_${story.role.toUpperCase()}_EMAIL`] ?? `ci-${story.role}@example.local`;
    const password = process.env[`CI_${story.role.toUpperCase()}_PASSWORD`] ?? 'change-me';
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    if (story.mfa) {
      await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
      await page.getByLabel('Authenticator code').fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page).toHaveURL(/\/editor$/);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(story.admin ? 1 : 0);
    await page.goto('/editor');
    await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Correct this text' })).toHaveCount(story.canEdit ? 1 : 0);
    await page.goto('/admin/constitutions');
    if (story.admin) {
      await expect(page.getByRole('heading', { name: 'Constitution outlines' })).toBeVisible();
      await expect(page.getByText('Atlas Test Charter')).toBeVisible();
    } else {
      await expect(page.getByText('Administrator role required.')).toBeVisible();
    }
  });
}
