'use server';

import { redirect } from 'next/navigation';
import { requireAdminUser } from '../../../lib/admin';
import { createImportJob, isImportRequest, parseImportJson } from '../../../lib/ingestion-api';

export async function createImportAction(formData: FormData): Promise<void> {
  await requireAdminUser('/admin/import?error=forbidden');
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
    const job = await createImportJob(payload);
    jobId = job.id;
  } catch {
    redirect('/admin/import?error=1');
  }
  redirect(`/admin/import/${encodeURIComponent(jobId)}`);
}
