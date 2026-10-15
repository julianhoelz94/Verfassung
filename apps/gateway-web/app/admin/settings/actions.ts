'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '../../../lib/admin';
import { IdentityApiError, sendTestMail, updateIdentitySettings } from '../../../lib/identity-client';
import { SESSION_COOKIE } from '../../../lib/session';

async function adminToken() {
  await requireAdminUser('/admin/settings?error=forbidden');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  return token;
}

export async function saveIdentitySettingsAction(formData: FormData): Promise<void> {
  const token = await adminToken();
  const checked = (name: string) => formData.get(name) === 'on';
  try {
    await updateIdentitySettings(token, {
      selfRegistrationEnabled: checked('selfRegistrationEnabled'),
      mailEnabled: checked('mailEnabled'),
      mailFrom: String(formData.get('mailFrom') ?? ''),
      mailFromName: String(formData.get('mailFromName') ?? ''),
      mailPublicBaseUrl: String(formData.get('mailPublicBaseUrl') ?? ''),
      smtpHost: String(formData.get('smtpHost') ?? ''),
      smtpPort: Number(formData.get('smtpPort') ?? 587),
      smtpUsername: String(formData.get('smtpUsername') ?? ''),
      smtpPassword: String(formData.get('smtpPassword') ?? ''),
      smtpAuth: checked('smtpAuth'),
      smtpStarttls: checked('smtpStarttls'),
      smtpSsl: checked('smtpSsl'),
    });
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      redirect(`/account/step-up?returnTo=${encodeURIComponent('/admin/settings')}`);
    }
    redirect('/admin/settings?error=save');
  }
  redirect('/admin/settings?saved=1');
}

export async function sendTestMailAction(formData: FormData): Promise<void> {
  const token = await adminToken();
  try {
    await sendTestMail(token, String(formData.get('to') ?? ''));
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      redirect(`/account/step-up?returnTo=${encodeURIComponent('/admin/settings')}`);
    }
    redirect('/admin/settings?error=test');
  }
  redirect('/admin/settings?tested=1');
}
