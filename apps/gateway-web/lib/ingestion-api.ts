import { ingestionBaseUrl, readJson, sendJson } from './api';

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
  return Array.isArray(row.articles) && row.articles.length > 0;
}

export function parseImportJson(raw: string): unknown {
  return JSON.parse(raw);
}

export function createImportJob(payload: unknown): Promise<ImportJob> {
  return sendJson<ImportJob>(`${ingestionBaseUrl()}/import-jobs`, 'ingestion', 'POST', payload);
}

export function getImportJob(jobId: string): Promise<ImportJob | null> {
  return readJson<ImportJob>(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(jobId)}`, 'ingestion');
}
