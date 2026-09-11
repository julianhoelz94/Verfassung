/* eslint-disable */
import { type Page, expect } from '@playwright/test';

export const EDITOR_EMAIL = 'local-editor@example.local';
export const ADMIN_EMAIL = 'local-admin@example.local';
export const EDITOR_PASSWORD = 'change-me';
export const MFA_CODE = '123456';
export const VERSION_2022 = '01900000-0000-4000-8000-000000000004';
export const ARTICLE_1 = '01900000-0000-4000-8000-000000000201';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(EDITOR_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Authenticator code' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill(MFA_CODE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
}

export async function signInEditor(page: Page): Promise<void> {
  await signIn(page, EDITOR_EMAIL);
}

export async function signInAdmin(page: Page): Promise<void> {
  await signIn(page, ADMIN_EMAIL);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
}
