'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '../../../lib/admin';
import { requestAdminAnonymousBrowsingPolicy, updateAnonymousBrowsingPolicy, type AnonymousRate } from '../../../lib/anonymous-browsing-policy';
import { SESSION_COOKIE } from '../../../lib/session';

const page = '/admin/anonymous-browsing';

export async function saveAnonymousBrowsingAction(formData: FormData): Promise<void> {
  await requireAdminUser(`${page}?error=forbidden`);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  const allowed = formData.get('allowed') === 'on';
  try {
    const saved = await requestAdminAnonymousBrowsingPolicy(token);
    const rate = (prefix: string, previous: AnonymousRate): AnonymousRate => allowed ? {
      requests: Number(formData.get(`${prefix}Requests`)),
      windowValue: Number(formData.get(`${prefix}WindowValue`)),
      windowUnit: String(formData.get(`${prefix}WindowUnit`)) as AnonymousRate['windowUnit'],
    } : previous;
    await updateAnonymousBrowsingPolicy(token, {
      allowed, perIp: rate('perIp', saved.perIp), total: rate('total', saved.total),
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'step_up_required') {
      redirect(`/account/step-up?returnTo=${encodeURIComponent(page)}`);
    }
    redirect(`${page}?error=save`);
  }
  redirect(`${page}?saved=1`);
}
