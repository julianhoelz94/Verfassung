'use server';

import { currentUser, requireSessionBearer } from '../../../lib/session';
import { createImportJob, createSetupProposal, ImportTransitionError, isImportRequest, parseImportJson, transitionImportJob } from '../../../lib/ingestion-api';

function hasRole(roles: string[], role: string) { return roles.includes(role) || roles.includes('admin'); }

export async function createImportAction(formData: FormData): Promise<string> {
  const user = await currentUser();
  if (!user || !hasRole(user.roles, 'editor')) return '/admin/import?error=forbidden';
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
    return '/admin/import?error=json';
  }
  if (!isImportRequest(payload)) {
    return '/admin/import?error=invalid';
  }
  let jobId: string;
  try {
    const job = await createImportJob(payload, await requireSessionBearer());
    jobId = job.id;
  } catch {
    return '/admin/import?error=1';
  }
  return `/editor?importJobId=${encodeURIComponent(jobId)}`;
}

export async function createSetupProposalAction(formData: FormData): Promise<string> {
  const user = await currentUser();
  if (!user || !hasRole(user.roles, 'editor')) return '/admin/import?mode=new&error=forbidden';
  let payload: unknown;
  const file = formData.get('proposalFile');
  try { payload = parseImportJson(file instanceof File && file.size > 0 ? await file.text() : String(formData.get('proposal') ?? '')); }
  catch { return '/admin/import?mode=new&error=json'; }
  let proposalId: string;
  try {
    const proposal = await createSetupProposal(payload, await requireSessionBearer());
    proposalId = proposal.id;
  } catch {
    return '/admin/import?mode=new&error=proposal';
  }
  return `/admin/import/setup/${encodeURIComponent(proposalId)}`;
}

export async function transitionImportAction(formData: FormData): Promise<string> {
  const user = await currentUser();
  const jobId = String(formData.get('jobId') ?? '');
  const returnTo = `/editor?importJobId=${encodeURIComponent(jobId)}`;
  const action = String(formData.get('action') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const role = { 'confirm-outline': 'editor', prepare: 'editor', approve: 'reviewer', reject: 'reviewer', publish: 'publisher' }[action as 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish'];
  if (!user || !role || !hasRole(user.roles, role)) return `${returnTo}&error=forbidden`;
  if (['approve', 'reject'].includes(action) && (reason.length < 10 || reason.length > 2000)) return `${returnTo}&error=reason`;
  if (action === 'publish' && !user.stepUpFresh) return `/account/step-up?returnTo=${encodeURIComponent(returnTo)}`;
  try {
    await transitionImportJob(jobId, action as 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish', await requireSessionBearer(), reason);
  } catch (error) {
    if (error instanceof ImportTransitionError) {
      if (error.code === 'mfa') return `/account/step-up?returnTo=${encodeURIComponent(returnTo)}`;
      if (error.code === 'session_expired') return `/login?returnTo=${encodeURIComponent(returnTo)}`;
      return `${returnTo}&error=${encodeURIComponent(error.code)}`;
    }
    return `${returnTo}&error=transition`;
  }
  return `/editor?importJobId=${encodeURIComponent(jobId)}`;
}
