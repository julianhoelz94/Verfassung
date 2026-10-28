import { contentBaseUrl, ingestionBaseUrl, readJson, sendJson, type OrderedNode } from './api';
import { fetchWithTimeout } from './fetch-with-timeout';

export type ImportAction = 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish';
export class ImportTransitionError extends Error {
  constructor(readonly code: string) { super(code); }
}

export type ImportJobError = {
  code: string;
  message: string;
};

export type ImportJob = {
  id: string;
  status: string;
  versionId: string | null;
  errors: ImportJobError[];
  isoCode?: string | null;
  submittedBy?: string | null;
  preparedBy?: string | null;
  approvedBy?: string | null;
  publishedBy?: string | null;
  outlineConfirmedBy?: string | null;
  countryName?: string | null;
  constitutionTitle?: string | null;
  versionLabel?: string | null;
};

const REQUIRED_STRINGS = ['constitutionSlug', 'constitutionTitle', 'versionLabel'] as const;

export function isImportRequest(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  for (const key of REQUIRED_STRINGS) {
    if (typeof row[key] !== 'string' || String(row[key]).trim() === '') {
      return false;
    }
  }
  if (row.jurisdictionId != null) {
    if (typeof row.jurisdictionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.jurisdictionId) || (typeof row.isoCode === 'string' && row.isoCode.trim())) return false;
  } else if (typeof row.isoCode !== 'string' || !/^[a-z]{2}$/i.test(row.isoCode) || typeof row.countryName !== 'string' || !row.countryName.trim()) return false;
  const articles = Array.isArray(row.articles) && row.articles.length > 0;
  const roots = Array.isArray(row.roots) && row.roots.length > 0;
  return articles !== roots;
}

export function listImportJobs(authorization: string, status?: string): Promise<ImportJob[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return readJson<ImportJob[]>(`${ingestionBaseUrl()}/import-jobs${query}`, 'ingestion', authorization).then(jobs => jobs ?? []);
}

export async function listMyImportJobs(authorization: string, archived: boolean): Promise<ImportJob[]> {
  const jobs: ImportJob[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await readJson<ImportJob[]>(`${ingestionBaseUrl()}/import-jobs?mine=true&archived=${archived}&limit=100&offset=${offset}`, 'ingestion', authorization);
    if (!page) throw new Error('Imports unavailable');
    jobs.push(...page);
    if (page.length < 100) return jobs;
  }
}

export async function archiveImportJob(jobId: string, archived: boolean, authorization: string): Promise<void> {
  const response = await fetchWithTimeout(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}/archive`, {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ archived }),
  });
  if (!response.ok) throw new Error('Import archive failed');
}

export function getImportPayload(jobId: string, authorization: string): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}/payload`, 'ingestion', authorization);
}

export async function transitionImportJob(jobId: string, action: ImportAction, authorization: string, reason?: string): Promise<ImportJob> {
  const response = await fetchWithTimeout(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}/${action}`, {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(reason ? { reason } : {}),
  }).catch(() => { throw new ImportTransitionError('unavailable'); });
  if (!response.ok) {
    const raw = await response.json().catch(() => null);
    const problem = raw && typeof raw === 'object' ? raw : {};
    const known = ['publication_not_configured', 'publication_credentials_invalid', 'approved_snapshot_changed', 'publication_conflict', 'publication_unavailable'];
    const code = known.includes(problem.code) ? problem.code
      : response.status === 401 ? 'session_expired'
      : response.status === 403 && problem.error === 'Fresh authenticator confirmation required' ? 'mfa'
      : response.status === 403 ? 'forbidden'
      : response.status === 409 ? 'conflict' : 'unavailable';
    throw new ImportTransitionError(code);
  }
  return response.json();
}

export type ImportReviewDecision = { id: string; decision: string; reason: string; decidedBy: string; decidedAt: string };

export type SetupProposal = {
  id: string; ownerId: string; status: string; constitutionId: string | null; settingsRevisionId: string | null;
  confirmedBy: string | null;
  payload: Record<string, unknown> & { outline?: { kinds?: Record<string, unknown>[] }; sampleRoots?: unknown[] };
  revision: number; previousPayload: SetupProposal['payload'] | null;
  requestedChanges: string | null; changesRequested: boolean;
};

export class SetupActionError extends Error {
  constructor(readonly code: 'stale' | 'creation_rejected' | 'running' | 'invalid' | 'unavailable' | 'forbidden' | 'session_expired') { super(code); }
}

async function setupCommand(id: string, path: string, method: string, payload: unknown, authorization: string, revision: number): Promise<SetupProposal> {
  const response = await fetchWithTimeout(`${ingestionBaseUrl()}/import-setup-proposals/${encodeURIComponent(id)}${path}`, {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: authorization, 'If-Match': `"${revision}"` }, body: JSON.stringify(payload),
  }).catch(() => { throw new SetupActionError('unavailable'); });
  if (response.status === 409) {
    const problem = await response.clone().json().catch(() => null) as { code?: string } | null;
    if (problem?.code === 'setup_confirmation_running') throw new SetupActionError('running');
    if (problem?.code === 'setup_creation_rejected') throw new SetupActionError('creation_rejected');
  }
  if (!response.ok) throw new SetupActionError(response.status === 409 || response.status === 428 ? 'stale' : response.status === 400 ? 'invalid' : response.status === 401 ? 'session_expired' : response.status === 403 ? 'forbidden' : 'unavailable');
  return response.json();
}

export function getSetupProposal(id: string, authorization: string): Promise<SetupProposal | null> {
  return readJson<SetupProposal>(`${ingestionBaseUrl()}/import-setup-proposals/${encodeURIComponent(id)}`, 'ingestion', authorization);
}

export function createSetupProposal(payload: unknown, authorization: string): Promise<SetupProposal> {
  return sendJson<SetupProposal>(`${ingestionBaseUrl()}/import-setup-proposals`, 'ingestion', 'POST', payload, authorization);
}

export function saveSetupDisplay(id: string, kinds: unknown[], authorization: string, revision: number): Promise<SetupProposal> {
  return setupCommand(id, '/display', 'POST', { kinds }, authorization, revision);
}

export function requestSetupChanges(id: string, message: string, authorization: string, revision: number): Promise<SetupProposal> {
  return setupCommand(id, '/request-changes', 'POST', { message }, authorization, revision);
}

export function transitionSetupProposal(id: string, action: 'confirm' | 'withdraw', authorization: string, revision: number): Promise<SetupProposal> {
  return setupCommand(id, `/${action}`, 'POST', {}, authorization, revision);
}

export function getImportReviewDecisions(jobId: string, authorization: string): Promise<ImportReviewDecision[]> {
  return readJson<ImportReviewDecision[]>(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}/decisions`, 'ingestion', authorization).then(decisions => decisions ?? []);
}

export function getPreparedImportContent(versionId: string, authorization: string): Promise<{ roots: OrderedNode[]; generation: number; settingsRevisionId: string | null } | null> {
  return readJson(`${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/content`, 'content', authorization);
}

export function parseImportJson(raw: string): unknown {
  return JSON.parse(raw);
}

export function createImportJob(payload: unknown, authorization?: string): Promise<ImportJob> {
  return sendJson<ImportJob>(`${ingestionBaseUrl()}/import-jobs`, 'ingestion', 'POST', payload, authorization);
}

export function getImportJob(jobId: string, authorization?: string): Promise<ImportJob | null> {
  return readJson<ImportJob>(
    `${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}`,
    'ingestion',
    authorization,
  );
}
