'use server';

import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { createImportJob, isImportRequest, parseImportJson, transitionImportJob } from '../../../lib/ingestion-api';

function hasRole(roles: string[], role: string) { return roles.includes(role) || roles.includes('admin'); }

export async function createImportAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user || !hasRole(user.roles, 'editor')) redirect('/admin/import?error=forbidden');
  const uploaded = formData.get('file');
  const pasted = String(formData.get('payload') ?? '');
  let raw = pasted;
  if (uploaded instanceof File && uploaded.size > 0) {
    raw = await uploaded.text();
  }
  let payload: unknown;
  try {
    payload = parseImportJson(raw);
  } catch {
    redirect('/admin/import?error=json');
  }
  if (!isImportRequest(payload)) {
    redirect('/admin/import?error=invalid');
  }
  let jobId: string;
  try {
    const job = await createImportJob(payload, await requireSessionBearer());
    jobId = job.id;
  } catch {
    redirect('/admin/import?error=1');
  }
  redirect(`/admin/import/${encodeURIComponent(jobId)}`);
}

export async function transitionImportAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const jobId = String(formData.get('jobId') ?? '');
  const action = String(formData.get('action') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const role = { 'confirm-outline': 'editor', prepare: 'editor', approve: 'reviewer', reject: 'reviewer', publish: 'publisher' }[action as 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish'];
  if (!user || !role || !hasRole(user.roles, role)) redirect(`/admin/import/${encodeURIComponent(jobId)}?error=forbidden`);
  if (['approve', 'reject'].includes(action) && (reason.length < 10 || reason.length > 2000)) redirect(`/admin/import/${encodeURIComponent(jobId)}?error=reason`);
  if (action === 'publish' && !user.stepUpFresh) redirect(`/account/step-up?returnTo=${encodeURIComponent(`/admin/import/${jobId}`)}`);
  try {
    await transitionImportJob(jobId, action as 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish', await requireSessionBearer(), reason);
  } catch {
    redirect(`/admin/import/${encodeURIComponent(jobId)}?error=transition`);
  }
  redirect(`/admin/import/${encodeURIComponent(jobId)}`);
}
