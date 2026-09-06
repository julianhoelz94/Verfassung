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

export async function confirmEnrollAction(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  let recoveryCodes: string[];
  try {
    const confirmed = await confirmMfaEnrollment(code);
    recoveryCodes = confirmed.recoveryCodes;
  } catch {
    redirect('/login/mfa?enroll=1&error=1');
  }
  redirect(`/account?recovery=${encodeURIComponent(recoveryCodes.join(','))}`);
}
