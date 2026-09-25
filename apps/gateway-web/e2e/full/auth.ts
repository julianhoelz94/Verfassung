import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export function authenticatorCode(secret: string): string {
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

export async function signIn(page: Page, role: 'editor' | 'reviewer' | 'publisher' | 'admin') {
  const email = process.env[`CI_${role.toUpperCase()}_EMAIL`] ?? `ci-${role}@example.local`;
  const password = process.env[`CI_${role.toUpperCase()}_PASSWORD`] ?? 'change-me';
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (role !== 'reviewer') {
    await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
    await page.getByLabel('Authenticator code').fill(authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'));
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page).toHaveURL(/\/editor$/);
  return email;
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
}
