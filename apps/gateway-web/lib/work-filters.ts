export const workStatuses = ['open', 'reviewing', 'approved', 'published', 'preparing', 'publishing', 'failed', 'rejected'] as const;
export type WorkStatus = typeof workStatuses[number];

export function validWorkStatus(value?: string): WorkStatus | '' {
  return workStatuses.includes(value as WorkStatus) ? value as WorkStatus : '';
}

export function matchesWorkStatus(status: string, filter: string): boolean {
  const normalized = status === 'pending_review' ? 'reviewing' : status === 'completed' ? 'published' : status;
  return !filter || normalized === filter;
}

export function myWorkHref(status?: string, archived = false): string {
  const params = new URLSearchParams({ mine: '1' });
  const selected = validWorkStatus(status);
  if (selected) params.set('workStatus', selected);
  if (archived) params.set('archived', 'true');
  return `/editor?${params}`;
}
