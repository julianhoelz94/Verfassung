'use server';

import { safeLoginReturnTo } from '../../lib/return-to';
import { setupStatus } from '../../lib/deployment-setup';
import { canVisitEditor } from '../../lib/nav';
import { IdentityApiError } from '../../lib/identity-client';
import { completeMfaLogin, confirmMfaEnrollment, login, logout } from '../../lib/session';

export async function loginAction(formData: FormData): Promise<string> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = safeLoginReturnTo(formData.get('next'));
  const nextQuery = next ? `&next=${encodeURIComponent(next)}` : '';
  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await login(email, password);
  } catch (error) {
    if (error instanceof IdentityApiError && error.status === 401) {
      return `/login?error=credentials${nextQuery}`;
    }
    if (error instanceof IdentityApiError && error.status === 429) {
      return `/login?error=rate-limit${nextQuery}`;
    }
    return `/login?error=unavailable${nextQuery}`;
  }
  if ('mfa' in result) {
    return result.mfa === 'enroll' ? `/login/mfa?enroll=1${nextQuery}` : next ? `/login/mfa?next=${encodeURIComponent(next)}` : '/login/mfa';
  }
  if (!(await setupStatus()).completed) return '/setup';
  return next || (canVisitEditor(result.user.roles) ? '/editor' : '/');
}

export async function logoutAction(): Promise<string> {
  await logout();
  return '/';
}

export async function completeMfaAction(formData: FormData): Promise<string> {
  const recovery = formData.get('method') === 'recovery';
  const code = recovery ? '' : String(formData.get('code') ?? '').trim();
  const recoveryCode = recovery ? String(formData.get('recoveryCode') ?? '').trim() : '';
  const next = safeLoginReturnTo(formData.get('next'));
  let user;
  try {
    user = await completeMfaLogin(code, recoveryCode || undefined);
  } catch {
    return `/login/mfa?error=1${recovery ? '&method=recovery' : ''}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  }
  if (!(await setupStatus()).completed) return '/setup';
  return next || (canVisitEditor(user.roles) ? '/editor' : '/');
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
      continueTo: !(await setupStatus()).completed ? '/setup' : safeLoginReturnTo(formData.get('next')) || (canVisitEditor(confirmed.user.roles) ? '/editor' : '/'),
    };
  } catch {
    return { error: true };
  }
}
