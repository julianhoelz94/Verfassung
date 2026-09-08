'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { patchContentNode } from '../../lib/api';
import { canVisitEditor } from '../../lib/nav';
import { safeReturnTo } from '../../lib/return-to';
import { currentUser, requireSessionBearer } from '../../lib/session';

export async function saveNodeTitleAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitEditor(user.roles)) {
    redirect('/');
  }
  const nodeId = String(formData.get('nodeId') ?? '');
  const title = String(formData.get('title') ?? '');
  const returnTo = safeReturnTo(String(formData.get('returnTo') ?? '/'));
  const pathname = returnTo.split('?')[0] || '/';
  if (!nodeId) {
    const errorUrl = new URL(returnTo, 'http://atlas.local');
    errorUrl.searchParams.set('error', 'title');
    redirect(`${errorUrl.pathname}${errorUrl.search}`);
  }
  try {
    await patchContentNode(nodeId, title, requireSessionBearer());
  } catch {
    const errorUrl = new URL(returnTo, 'http://atlas.local');
    errorUrl.searchParams.set('error', 'title');
    redirect(`${errorUrl.pathname}${errorUrl.search}`);
  }
  revalidatePath(pathname);
}
