import { ui } from './messages';
import type { ImportAction, ImportJob } from './ingestion-api';

export function importPhase(job: Pick<ImportJob, 'status' | 'versionId'>) {
  if (job.status === 'pending_review') return job.versionId ? 'review' : 'prepare';
  return Object.hasOwn(ui.importWorkflow.phases, job.status) ? job.status as keyof typeof ui.importWorkflow.phases : 'unavailable';
}

export function importActions(job: Pick<ImportJob, 'status' | 'versionId' | 'outlineConfirmedBy'>, roles: string[], proposedOutline: boolean): ImportAction[] {
  const can = (role: string) => roles.includes(role) || roles.includes('admin');
  if (job.status === 'pending_review' && !job.versionId && can('editor')) return [proposedOutline && !job.outlineConfirmedBy ? 'confirm-outline' : 'prepare'];
  if (job.status === 'pending_review' && job.versionId && can('reviewer')) return ['approve', 'reject'];
  if (job.status === 'approved' && can('publisher')) return ['publish'];
  return [];
}
