'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  IdentityApiError,
  requestAcceptInvite,
  requestChangePassword,
  requestConfirmMfaEnroll,
  requestConfirmReset,
  requestDisableUser,
  requestEnableUser,
  requestInvite,
  requestIssueReset,
  requestPasswordReset,
  requestRegenerateRecovery,
  requestRevokeMfa,
  requestStartMfaEnroll,
  requestStepUp,
  requestUpdateRoles,
} from '../../lib/identity-client';
import { requireAdminUser } from '../../lib/admin';
import { SESSION_COOKIE } from '../../lib/session';

function tokenOrRedirect(): string {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect('/login');
  }
  return token;
}

async function requireAdminToken(): Promise<string> {
  await requireAdminUser('/admin/users?error=forbidden');
  return tokenOrRedirect();
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  try {
    await requestChangePassword(
      token,
      String(formData.get('currentPassword') ?? ''),
      String(formData.get('newPassword') ?? ''),
    );
  } catch {
    redirect('/account?error=1');
  }
  redirect('/account?saved=1');
}

export async function requestResetAction(formData: FormData): Promise<void> {
  await requestPasswordReset(String(formData.get('email') ?? '')).catch(() => undefined);
  redirect('/reset?sent=1');
}

export async function confirmResetAction(formData: FormData): Promise<void> {
  try {
    await requestConfirmReset(String(formData.get('token') ?? ''), String(formData.get('newPassword') ?? ''));
  } catch {
    redirect('/reset?error=1');
  }
  redirect('/login');
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const inviteToken = String(formData.get('token') ?? '');
  try {
    await requestAcceptInvite(inviteToken, String(formData.get('password') ?? ''));
  } catch {
    redirect(`/invite?token=${encodeURIComponent(inviteToken)}&error=1`);
  }
  redirect('/login');
}

function parseRoles(formData: FormData, fallback = ''): string[] {
  return String(formData.get('roles') ?? fallback)
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

export async function inviteUserAction(formData: FormData): Promise<void> {
  const token = await requireAdminToken();
  const roles = parseRoles(formData, 'viewer');
  let inviteToken: string;
  try {
    const created = await requestInvite(token, String(formData.get('email') ?? ''), roles);
    inviteToken = created.inviteToken;
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect(`/admin/users?invited=${encodeURIComponent(inviteToken)}`);
}

export async function disableUserAction(formData: FormData): Promise<void> {
  const token = await requireAdminToken();
  try {
    await requestDisableUser(token, String(formData.get('userId') ?? ''));
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect('/admin/users');
}

export async function enableUserAction(formData: FormData): Promise<void> {
  const token = await requireAdminToken();
  try {
    await requestEnableUser(token, String(formData.get('userId') ?? ''));
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect('/admin/users');
}

export async function issueResetAction(formData: FormData): Promise<void> {
  const token = await requireAdminToken();
  let resetToken: string;
  try {
    const issued = await requestIssueReset(token, String(formData.get('userId') ?? ''));
    resetToken = issued.resetToken;
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect(`/admin/users?reset=${encodeURIComponent(resetToken)}`);
}

function safeReturnTo(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return '/account';
}

export async function startMfaEnrollAction(): Promise<void> {
  const token = tokenOrRedirect();
  try {
    const started = await requestStartMfaEnroll(undefined, token);
    redirect(`/account?enrollChallenge=${encodeURIComponent(started.challengeToken)}`);
  } catch {
    redirect('/account?error=mfa');
  }
}

export async function confirmAccountMfaAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  try {
    const confirmed = await requestConfirmMfaEnroll(
      String(formData.get('code') ?? ''),
      String(formData.get('challengeToken') ?? ''),
      token,
    );
    redirect(`/account?recovery=${encodeURIComponent(confirmed.recoveryCodes.join(','))}`);
  } catch {
    redirect('/account?error=mfa');
  }
}

export async function revokeMfaAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  try {
    await requestRevokeMfa(token, String(formData.get('code') ?? ''));
  } catch {
    redirect('/account?error=mfa');
  }
  redirect('/account?mfaRevoked=1');
}

export async function regenerateRecoveryAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  try {
    const result = await requestRegenerateRecovery(token, String(formData.get('code') ?? ''));
    redirect(`/account?recovery=${encodeURIComponent(result.recoveryCodes.join(','))}`);
  } catch {
    redirect('/account?error=mfa');
  }
}

export async function stepUpAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  const returnTo = safeReturnTo(String(formData.get('returnTo') ?? '/account'));
  try {
    await requestStepUp(token, String(formData.get('code') ?? ''));
  } catch {
    redirect(`/account/step-up?error=1&returnTo=${encodeURIComponent(returnTo)}`);
  }
  redirect(returnTo);
}

export async function updateRolesAction(formData: FormData): Promise<void> {
  const token = await requireAdminToken();
  const userId = String(formData.get('userId') ?? '');
  const roles = parseRoles(formData);
  try {
    await requestUpdateRoles(token, userId, roles);
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      redirect(`/account/step-up?returnTo=${encodeURIComponent('/admin/users')}`);
    }
    redirect('/admin/users?error=1');
  }
  redirect('/admin/users');
}
