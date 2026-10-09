import { contentBaseUrl, ingestionBaseUrl, readJson, sendJson, type OrderedNode } from './api';

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
};

const REQUIRED_STRINGS = ['isoCode', 'countryName', 'constitutionSlug', 'constitutionTitle', 'versionLabel'] as const;

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
  const articles = Array.isArray(row.articles) && row.articles.length > 0;
  const roots = Array.isArray(row.roots) && row.roots.length > 0;
  return articles !== roots;
}

export function listImportJobs(authorization: string, status?: string): Promise<ImportJob[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return readJson<ImportJob[]>(`${ingestionBaseUrl()}/import-jobs${query}`, 'ingestion', authorization).then(jobs => jobs ?? []);
}

export function getImportPayload(jobId: string, authorization: string): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}/payload`, 'ingestion', authorization);
}

export function transitionImportJob(jobId: string, action: 'confirm-outline' | 'prepare' | 'approve' | 'reject' | 'publish', authorization: string, reason?: string): Promise<ImportJob> {
  return sendJson<ImportJob>(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}/${action}`, 'ingestion', 'POST', reason ? { reason } : {}, authorization);
}

export type ImportReviewDecision = { id: string; decision: string; reason: string; decidedBy: string; decidedAt: string };

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
