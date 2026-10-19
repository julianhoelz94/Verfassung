'use server';

import { redirect } from 'next/navigation';
import { setupStatus } from '../../lib/deployment-setup';
import { canVisitEditor } from '../../lib/nav';
import { IdentityApiError } from '../../lib/identity-client';
import { completeMfaLogin, confirmMfaEnrollment, login, logout } from '../../lib/session';

function oauthReturnPath(value: FormDataEntryValue | null): string | null {
  const path = typeof value === 'string' ? value : '';
  return path.length <= 4096 && path.startsWith('/oauth/authorize?') && !path.includes('\\') ? path : null;
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = oauthReturnPath(formData.get('next'));
  const nextQuery = next ? `&next=${encodeURIComponent(next)}` : '';
  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await login(email, password);
  } catch (error) {
    if (error instanceof IdentityApiError && error.status === 401) {
      redirect(`/login?error=credentials${nextQuery}`);
    }
    if (error instanceof IdentityApiError && error.status === 429) {
      redirect(`/login?error=rate-limit${nextQuery}`);
    }
    redirect(`/login?error=unavailable${nextQuery}`);
  }
  if ('mfa' in result) {
    redirect(result.mfa === 'enroll' ? `/login/mfa?enroll=1${nextQuery}` : next ? `/login/mfa?next=${encodeURIComponent(next)}` : '/login/mfa');
  }
  if (!(await setupStatus()).completed) redirect('/setup');
  if (next) redirect(next);
  redirect(canVisitEditor(result.user.roles) ? '/editor' : '/');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/');
}

export async function completeMfaAction(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  const recoveryCode = String(formData.get('recoveryCode') ?? '');
  const next = oauthReturnPath(formData.get('next'));
  let user;
  try {
    user = await completeMfaLogin(code, recoveryCode || undefined);
  } catch {
    redirect(`/login/mfa?error=1${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  }
  if (!(await setupStatus()).completed) redirect('/setup');
  if (next) redirect(next);
  redirect(canVisitEditor(user.roles) ? '/editor' : '/');
}

export type EnrollConfirmState = {
  recoveryCodes?: string[];
  continueTo?: string;
  error?: boolean;
};

/**
 * Returns the one-time recovery codes as form state (rendered by `MfaForms.LoginEnrollForm`)
 * instead of redirecting with them in the URL.
 */
export async function confirmEnrollAction(_prev: EnrollConfirmState, formData: FormData): Promise<EnrollConfirmState> {
  const code = String(formData.get('code') ?? '');
  try {
    const confirmed = await confirmMfaEnrollment(code);
    return {
      recoveryCodes: confirmed.recoveryCodes,
      continueTo: !(await setupStatus()).completed ? '/setup' : oauthReturnPath(formData.get('next')) ?? (canVisitEditor(confirmed.user.roles) ? '/editor' : '/'),
    };
  } catch {
    return { error: true };
  }
}
