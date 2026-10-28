'use server';

import { revalidatePath } from 'next/cache';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { manageSession } from '../../lib/editor-api';
import { archiveImportJob } from '../../lib/ingestion-api';
import { myWorkHref } from '../../lib/work-filters';

export async function manageWorkAction(form: FormData): Promise<string> {
  if (!await currentUser()) return '/login';
  const href = myWorkHref(String(form.get('workStatus') ?? ''), form.get('archived') === 'true');
  const id = String(form.get('id') ?? '');
  const kind = form.get('kind');
  const action = form.get('action');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !['archive', 'restore', 'discard'].includes(String(action)) || !['session', 'import'].includes(String(kind))) return `${href}&error=manage_failed`;
  try {
    if (kind === 'session') await manageSession(id, action as 'archive' | 'restore' | 'discard');
    else if (action !== 'discard') await archiveImportJob(id, action === 'archive', await requireSessionBearer());
    else return `${href}&error=manage_failed`;
  } catch { return `${href}&error=manage_failed`; }
  revalidatePath('/editor');
  return href;
}
