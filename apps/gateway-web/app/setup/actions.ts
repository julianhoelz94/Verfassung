'use server';
import { redirect } from 'next/navigation';
import { requireSessionBearer } from '../../lib/session';
import { setupRequest } from '../../lib/deployment-setup';

export async function saveSetupPreferences(form: FormData): Promise<void> {
  const bearer = await requireSessionBearer();
  const target = form.get('returnTo') === '/admin/settings' ? '/admin/settings' : '/setup';
  try {
    await setupRequest('/setup', bearer, 'PUT', {
      enabledLanguages: form.getAll('enabledLanguages').map(String), defaultLanguage: String(form.get('defaultLanguage') ?? ''),
      mailDeferred: form.get('mailDeferred') === 'on', accessReviewed: form.get('accessReviewed') === 'on',
    });
  } catch { redirect(`${target}?error=setup`); }
  redirect(`${target}?saved=1`);
}

export async function completeSetup(): Promise<void> {
  const bearer = await requireSessionBearer();
  try { await setupRequest('/setup/complete', bearer, 'POST'); } catch { redirect('/setup?error=finish'); }
  redirect('/admin/settings?completed=1');
}
