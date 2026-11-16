import { validWorkStatus } from './work-filters';
import { message } from './messages';
import { inboxKindMessage } from './editor-inbox-messages';
import type { Locale } from './locale';

export type InboxQueue = 'mine' | 'reviewing' | 'approved';
export type InboxKind = 'correction' | 'legal' | 'import';
export type InboxFilters = { query: string; workStatus: string; country: string; kind: string; archived: boolean };
export type InboxRow = {
  id: string; kind: InboxKind; status: string; owned: boolean;
  countryKey: string; country: string; constitutionKey: string; constitution: string;
  jurisdiction?: string; regional?: boolean; historical?: boolean; version: string;
  updatedAt: string | null; changedArticleCount?: number; workspaceHref: string; publicHref?: string;
};
export const emptyInboxFilters: InboxFilters = { query: '', workStatus: '', country: '', kind: '', archived: false };
const kinds = ['correction', 'legal', 'import'];

export function inboxQueues(roles: string[]): InboxQueue[] {
  const admin = roles.includes('admin');
  return [admin || roles.includes('editor') ? 'mine' : null, admin || roles.includes('reviewer') ? 'reviewing' : null, admin || roles.includes('publisher') ? 'approved' : null].filter((queue): queue is InboxQueue => queue !== null);
}
export function selectedInboxQueue(roles: string[], status?: string): InboxQueue {
  const available = inboxQueues(roles);
  return (status === 'reviewing' || status === 'approved') && available.includes(status) ? status : available[0] ?? 'mine';
}
export function inboxFilters(params: Record<string, string | undefined>): InboxFilters {
  return {
    query: (params.query ?? '').slice(0, 200), workStatus: validWorkStatus(params.workStatus),
    country: (params.country ?? '').slice(0, 100), kind: kinds.includes(params.kind ?? '') ? params.kind! : '', archived: params.archived === 'true',
  };
}
export function inboxHref(queue: InboxQueue, filters: InboxFilters = emptyInboxFilters): string {
  const params = new URLSearchParams(queue === 'mine' ? { mine: '1' } : { status: queue });
  if (filters.query) params.set('query', filters.query);
  if (filters.country) params.set('country', filters.country);
  if (filters.kind) params.set('kind', filters.kind);
  if (queue === 'mine' && filters.workStatus) params.set('workStatus', validWorkStatus(filters.workStatus));
  if (queue === 'mine' && filters.archived) params.set('archived', 'true');
  return `/editor?${params}`;
}
/** Return links can describe an inbox only, never an external URL or a command/workspace. */
export function safeInboxHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/editor?') || value.length > 4096) return null;
  const url = new URL(value, 'http://inbox.local');
  const allowed = ['mine', 'status', 'query', 'country', 'kind', 'workStatus', 'archived'];
  if (url.pathname !== '/editor' || url.hash || [...url.searchParams.keys()].some(key => !allowed.includes(key))) return null;
  const status = url.searchParams.get('status');
  if (status && status !== 'reviewing' && status !== 'approved') return null;
  return inboxHref(status === 'reviewing' || status === 'approved' ? status : 'mine', inboxFilters(Object.fromEntries(url.searchParams)));
}
export function normalizedWorkStatus(status: string): string {
  return status === 'pending_review' ? 'reviewing' : status === 'completed' ? 'published' : status;
}
export function filterInboxRows(rows: InboxRow[], filters: InboxFilters, locale: Locale): InboxRow[] {
  const query = filters.query.trim().toLocaleLowerCase(locale);
  return rows.filter(row => (!filters.workStatus || normalizedWorkStatus(row.status) === filters.workStatus) &&
    (!filters.country || row.countryKey === filters.country) && (!filters.kind || row.kind === filters.kind) &&
    (!query || `${row.country} ${row.constitution} ${row.jurisdiction ?? ''} ${row.version} ${message(locale, inboxKindMessage(row.kind))}`.toLocaleLowerCase(locale).includes(query)));
}
export function workManagement(row: Pick<InboxRow, 'kind' | 'status' | 'owned'>, archived: boolean): 'discard' | 'archive' | 'restore' | null {
  if (!row.owned) return null;
  if (row.kind !== 'import' && row.status === 'open') return 'discard';
  if (row.kind === 'import' ? ['completed', 'rejected', 'failed'].includes(row.status) : row.status === 'published') return archived ? 'restore' : 'archive';
  return null;
}
