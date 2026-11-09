'use server';

import { currentUser, requireSessionBearer } from '../../../lib/session';
import { prepareMigrationItem } from '../../../lib/migration-review';

export async function prepareMigrationAction(form: FormData): Promise<string> {
  const run = String(form.get('runId') ?? '');
  const item = String(form.get('itemId') ?? '');
  const destination = `/admin/migrations/${encodeURIComponent(run)}?item=${encodeURIComponent(item)}`;
  const user = await currentUser();
  if (!user?.roles.some(role => role === 'editor' || role === 'admin')) return `${destination}&error=forbidden`;
  try { await prepareMigrationItem(run, item, await requireSessionBearer()); }
  catch { return `${destination}&error=prepare`; }
  return destination;
}
