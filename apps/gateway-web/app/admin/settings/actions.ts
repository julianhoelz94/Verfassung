'use server';

import { updateTranslationSiteSettings } from '../../../lib/content-translation';

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

export async function saveIdentitySettingsAction(formData: FormData): Promise<string> {
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
      return `/account/step-up?returnTo=${encodeURIComponent('/admin/settings')}`;
    }
    return '/admin/settings?error=save';
  }
  return '/admin/settings?saved=1';
}

export async function sendTestMailAction(formData: FormData): Promise<string> {
  const token = await adminToken();
  try {
    await sendTestMail(token, String(formData.get('to') ?? ''));
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      return `/account/step-up?returnTo=${encodeURIComponent('/admin/settings')}`;
    }
    return '/admin/settings?error=test';
  }
  return '/admin/settings?tested=1';
}

export async function saveContentTranslationSettingsAction(formData: FormData): Promise<string> {
  const token = await adminToken();
  try {
    await updateTranslationSiteSettings(token, {
      provider: String(formData.get('provider') ?? 'off'),
      sharedApiKey: String(formData.get('sharedApiKey') ?? ''),
      clearSharedApiKey: formData.get('clearSharedApiKey') === 'on',
    });
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      return `/account/step-up?returnTo=${encodeURIComponent('/admin/settings')}`;
    }
    return '/admin/settings?error=translation';
  }
  return '/admin/settings?saved=translation';
}
