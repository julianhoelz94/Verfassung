'use server';
import { requireSessionBearer } from '../../lib/session';
import { setupRequest, type SetupDetails } from '../../lib/deployment-setup';

export async function saveSetupPreferences(form: FormData): Promise<string> {
  const bearer = await requireSessionBearer();
  const target = form.get('returnTo') === '/admin/settings' ? '/admin/settings' : '/setup';
  try {
    const current = await setupRequest<SetupDetails>('/setup', bearer);
    await setupRequest('/setup', bearer, 'PUT', {
      enabledLanguages: form.getAll('enabledLanguages').map(String), defaultLanguage: String(form.get('defaultLanguage') ?? ''),
      mailDeferred: current.preferences.mailDeferred, accessReviewed: form.get('accessReviewed') === 'on',
    });
  } catch { return `${target}?error=setup`; }
  return `${target}?saved=1`;
}

export async function completeSetup(): Promise<string> {
  const bearer = await requireSessionBearer();
  try { await setupRequest('/setup/complete', bearer, 'POST'); } catch { return '/setup?error=finish'; }
  return '/admin/settings?completed=1';
}
