'use server';

import { currentUser, requireSessionBearer } from '../../lib/session';
import { catalogBaseUrl, sendJson } from '../../lib/api';

export async function comparisonAction(form: FormData): Promise<string> {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  const destination = `/comparisons/${encodeURIComponent(id)}`;
  const role = action === 'review' ? 'reviewer' : action === 'publish' ? 'publisher' : null;
  const user = await currentUser();
  if (!role || !user?.roles.some(value => value === role || value === 'admin')) return `${destination}?error=forbidden`;
  if (action === 'publish' && !user.stepUpFresh) return `/account/step-up?returnTo=${encodeURIComponent(destination)}`;
  const reason = String(form.get('reason') ?? '').trim();
  if (action === 'review' && (reason.length < 10 || reason.length > 2000)) return `${destination}?error=reason`;
  try { await sendJson(`${catalogBaseUrl()}/curated-comparisons/${encodeURIComponent(id)}/${action}`, 'catalog', 'POST', action === 'review' ? { reason } : {}, await requireSessionBearer()); }
  catch { return `${destination}?error=transition`; }
  return destination;
}
