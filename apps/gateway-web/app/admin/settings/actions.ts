'use server';

import { updateTranslationSiteSettings } from '../../../lib/content-translation';
import { updateSwaggerAccessPolicy } from '../../../lib/swagger-access';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '../../../lib/admin';
import { IdentityApiError, requestIdentitySettings, sendTestMail, updateIdentitySettings } from '../../../lib/identity-client';
import { SESSION_COOKIE } from '../../../lib/session';
import { setupRequest, type SetupDetails } from '../../../lib/deployment-setup';

async function adminToken() {
  await requireAdminUser('/admin/settings?error=forbidden');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  return token;
}

export async function saveIdentitySettingsAction(formData: FormData): Promise<string> {
  const token = await adminToken();
  const target = formData.get('returnTo') === '/setup' ? '/setup' : '/admin/settings';
  const checked = (name: string) => formData.get(name) === 'on';
  try {
    const { smtpPasswordSet: _passwordSet, ...current } = await requestIdentitySettings(token);
    const deferred = formData.has('hasMailDeferredPreference') && checked('mailDeferred');
    const mailEnabled = !deferred && checked('mailEnabled');
    const value = (name: string, fallback: string) => String(formData.get(name) ?? fallback);
    await updateIdentitySettings(token, {
      ...current,
      selfRegistrationEnabled: mailEnabled && checked('selfRegistrationEnabled'),
      mailEnabled,
      ...(mailEnabled ? {
        mailFrom: value('mailFrom', current.mailFrom),
        mailFromName: value('mailFromName', current.mailFromName),
        mailPublicBaseUrl: value('mailPublicBaseUrl', current.mailPublicBaseUrl),
        smtpHost: value('smtpHost', current.smtpHost),
        smtpPort: Number(formData.get('smtpPort') ?? current.smtpPort),
        smtpUsername: value('smtpUsername', current.smtpUsername),
        smtpPassword: value('smtpPassword', ''),
        smtpAuth: checked('smtpAuth'),
        smtpStarttls: checked('smtpStarttls'),
        smtpSsl: checked('smtpSsl'),
      } : {}),
    });
    if (formData.has('hasMailDeferredPreference')) {
      const details = await setupRequest<SetupDetails>('/setup', `Bearer ${token}`);
      if (details.preferences.mailDeferred !== deferred) {
        await setupRequest('/setup', `Bearer ${token}`, 'PUT', { ...details.preferences, mailDeferred: deferred });
      }
    }
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      return `/account/step-up?returnTo=${encodeURIComponent(target)}`;
    }
    return `${target}?error=save`;
  }
  return `${target}?saved=1`;
}

export async function sendTestMailAction(formData: FormData): Promise<string> {
  const token = await adminToken();
  const target = formData.get('returnTo') === '/setup' ? '/setup' : '/admin/settings';
  try {
    await sendTestMail(token, String(formData.get('to') ?? ''));
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      return `/account/step-up?returnTo=${encodeURIComponent(target)}`;
    }
    return `${target}?error=test`;
  }
  return `${target}?tested=1`;
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

export async function saveSwaggerAccessAction(formData: FormData): Promise<string> {
  const token = await adminToken();
  try {
    await updateSwaggerAccessPolicy(token, { enabled: formData.get('swaggerEnabled') === 'on' });
  } catch (error) {
    if (error instanceof IdentityApiError && error.code === 'step_up_required') {
      return `/account/step-up?returnTo=${encodeURIComponent('/admin/settings#api-documentation')}`;
    }
    return '/admin/settings?error=swagger#api-documentation';
  }
  return '/admin/settings?saved=swagger#api-documentation';
}
