import { createHash } from 'node:crypto';
import { fetchWithTimeout } from './fetch-with-timeout';
import { ingestionBaseUrl, readJson, sendJson } from './api';

export type MigrationSource = { sourceKey: string; url: string; sha256?: string | null; encoding?: string | null; attribution?: string | null; aliases: string[]; disposition: 'included' | 'unavailable' | 'excluded'; reason?: string | null; targetKeys?: string[]; captureKey?: string | null };
export type MigrationItem = { id: string; sourceKey: string; kind: string; sha256: string; dependencies: string[]; state: string; result: { jobId?: string; versionId?: string; documentId?: string; revisionId?: string; revision?: number; amendmentId?: string; comparisonId?: string; status?: string }; attempts: number; error: string | null };
export type MigrationRun = { id: string; ownerId: string; manifest: { runKey: string; title: string; sources: MigrationSource[] }; items: MigrationItem[]; coverage: Record<string, number> };
export type ImportFidelityPage = { fidelity: { path: string; reason: string }[]; fidelityComplete: boolean; resourcesComplete: boolean; counts: Record<string, number>; snapshotId: string; complete: boolean; totalRecords: number; nextCursor: string | null };

export function getMigrationRuns(authorization: string): Promise<{ id: string; title: string; coverage: Record<string, number> }[] | null> {
  return readJson(`${ingestionBaseUrl()}/migration-runs`, 'ingestion', authorization);
}
export function getMigrationRun(id: string, authorization: string): Promise<MigrationRun | null> {
  return readJson(`${ingestionBaseUrl()}/migration-runs/${encodeURIComponent(id)}`, 'ingestion', authorization);
}
export function prepareMigrationItem(run: string, item: string, authorization: string): Promise<MigrationItem> {
  return sendJson(`${ingestionBaseUrl()}/migration-runs/${encodeURIComponent(run)}/items/${encodeURIComponent(item)}/prepare`, 'ingestion', 'POST', {}, authorization);
}
export function getImportFidelity(job: string, authorization: string): Promise<ImportFidelityPage | null> {
  return readJson(`${ingestionBaseUrl()}/import-jobs/${encodeURIComponent(job)}/export?view=prepared`, 'ingestion', authorization);
}
export async function readCapturedSource(item: MigrationItem, source: MigrationSource, authorization: string): Promise<string> {
  if (!item.result.documentId || !item.result.revision) throw new Error('Source capture is not prepared');
  const base = process.env.DOCUMENT_API_URL ?? 'http://localhost/api/document';
  const response = await fetchWithTimeout(`${base}/documents/${encodeURIComponent(item.result.documentId)}/revisions/${item.result.revision}/file`, { headers: { Authorization: authorization }, cache: 'no-store' });
  if (!response.ok) throw new Error('Source capture is unavailable');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (source.sha256 && createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('Source evidence checksum mismatch');
  return new TextDecoder(source.encoding || 'utf-8', { fatal: true }).decode(bytes);
}

export type MigrationAttemptPage = { items: { number: number; state: string; error: string | null; startedAt: string; finishedAt: string | null }[]; nextOffset: number | null };
export function getMigrationAttempts(run: string, item: string, offset: number, authorization: string): Promise<MigrationAttemptPage | null> {
  return readJson(`${ingestionBaseUrl()}/migration-runs/${encodeURIComponent(run)}/items/${encodeURIComponent(item)}/attempts?offset=${offset}&limit=20`, 'ingestion', authorization);
}
