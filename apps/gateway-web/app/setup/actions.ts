'use server';
import { requireSessionBearer } from '../../lib/session';
import { setupRequest } from '../../lib/deployment-setup';

export async function saveSetupPreferences(form: FormData): Promise<string> {
  const bearer = await requireSessionBearer();
  const target = form.get('returnTo') === '/admin/settings' ? '/admin/settings' : '/setup';
  try {
    await setupRequest('/setup', bearer, 'PUT', {
      enabledLanguages: form.getAll('enabledLanguages').map(String), defaultLanguage: String(form.get('defaultLanguage') ?? ''),
      mailDeferred: form.get('mailDeferred') === 'on', accessReviewed: form.get('accessReviewed') === 'on',
    });
  } catch { return `${target}?error=setup`; }
  return `${target}?saved=1`;
}

export async function completeSetup(): Promise<string> {
  const bearer = await requireSessionBearer();
  try { await setupRequest('/setup/complete', bearer, 'POST'); } catch { return '/setup?error=finish'; }
  return '/admin/settings?completed=1';
}
