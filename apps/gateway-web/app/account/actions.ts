'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  requestAcceptInvite,
  requestChangePassword,
  requestConfirmReset,
  requestDisableUser,
  requestEnableUser,
  requestInvite,
  requestIssueReset,
  requestPasswordReset,
} from '../../lib/identity-client';
import { SESSION_COOKIE } from '../../lib/session';

function tokenOrRedirect(): string {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect('/login');
  }
  return token;
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

export async function inviteUserAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  const roles = String(formData.get('roles') ?? 'viewer')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
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
  const token = tokenOrRedirect();
  try {
    await requestDisableUser(token, String(formData.get('userId') ?? ''));
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect('/admin/users');
}

export async function enableUserAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  try {
    await requestEnableUser(token, String(formData.get('userId') ?? ''));
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect('/admin/users');
}

export async function issueResetAction(formData: FormData): Promise<void> {
  const token = tokenOrRedirect();
  let resetToken: string;
  try {
    const issued = await requestIssueReset(token, String(formData.get('userId') ?? ''));
    resetToken = issued.resetToken;
  } catch {
    redirect('/admin/users?error=1');
  }
  redirect(`/admin/users?reset=${encodeURIComponent(resetToken)}`);
}
