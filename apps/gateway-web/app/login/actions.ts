'use server';

import { redirect } from 'next/navigation';
import { canVisitEditor } from '../../lib/nav';
import { completeMfaLogin, confirmMfaEnrollment, login, logout } from '../../lib/session';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await login(email, password);
  } catch {
    redirect('/login?error=1');
  }
  if ('mfa' in result) {
    redirect(result.mfa === 'enroll' ? '/login/mfa?enroll=1' : '/login/mfa');
  }
  redirect(canVisitEditor(result.user.roles) ? '/editor' : '/');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/');
}

export async function completeMfaAction(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  const recoveryCode = String(formData.get('recoveryCode') ?? '');
  let user;
  try {
    user = await completeMfaLogin(code, recoveryCode || undefined);
  } catch {
    redirect('/login/mfa?error=1');
  }
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
      continueTo: canVisitEditor(confirmed.user.roles) ? '/editor' : '/',
    };
  } catch {
    return { error: true };
  }
}
