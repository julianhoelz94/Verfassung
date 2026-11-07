import { fetchWithTimeout } from './fetch-with-timeout';
import { ApiUnavailableError } from './api';

export type DocumentCreator = { family?: string | null; given?: string | null; literal?: string | null };
export type DocumentBibliography = {
  type: string; authors: DocumentCreator[]; editors: DocumentCreator[];
  issued?: string | null; containerTitle?: string | null; publisher?: string | null;
  volume?: string | null; issue?: string | null; pages?: string | null;
  doi?: string | null; isbn?: string | null; language?: string | null;
  abstract?: string | null; extra: Record<string, string>;
};
export type DocumentTag = { id: string; name: string };
export type DocumentFolder = { id: string; name: string; tagId: string };
export type DocumentAttachment = { id: string; fileName: string; contentType: string; size: number; sha256: string; primary: boolean };
export type SaveDocumentMetadata = {
  title: string; description?: string; sourceUrl?: string; citationKey?: string;
  bibliography?: DocumentBibliography; expectedRevision?: number;
};
export type LibraryDocumentQuery = {
  kind?: 'image'; q?: string; folderId?: string; tagId?: string; status?: 'active' | 'archived' | 'all';
  offset?: number; limit?: number; sort?: 'title' | 'key' | 'year' | 'created';
};
export type DocumentLibraryPage = { items: DocumentRecord[]; total: number; offset: number; limit: number };
export type BibtexPreviewEntry = {
  index: number; citationKey: string; title: string; bibliography: DocumentBibliography;
  sourceUrl?: string | null; description?: string | null; conflictDocumentId?: string | null;
  duplicateCandidates: DocumentRecord[]; warnings: string[];
};
export type BibtexPreview = { entries: BibtexPreviewEntry[]; warnings: string[] };
export type BibtexDecision = { index: number; action: 'create' | 'skip' | 'update' | 'link'; citationKey?: string; documentId?: string; expectedRevision?: number };
export type BibtexImportRequest = { operationId: string; content: string; folderId?: string; decisions: BibtexDecision[] };

export type MaterialTarget = 'amendment_material' | 'change_material' | 'lifecycle_material';
export type IngestionDocumentTarget = 'import_job' | 'setup_proposal' | 'migration_run';
export type DocumentTarget = 'passage_citation' | IngestionDocumentTarget | 'constitution' | 'version' | 'amendment' | 'country_wiki' | 'constitution_wiki' | 'jurisdiction_wiki' | MaterialTarget;

export type DocumentRevision = {
  id: string;
  documentId: string;
  revision: number;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  fileName: string | null;
  contentType: string | null;
  createdAt: string;
  createdBy: string;
  citationKey?: string;
  bibliography?: DocumentBibliography;
  attachments?: DocumentAttachment[];
};

export type DocumentRecord = {
  id: string;
  currentRevision: number;
  status: 'active' | 'archived';
  createdAt: string;
  revision: DocumentRevision;
  citationKey?: string;
  tags?: DocumentTag[];
};

export type DocumentLink = {
  citationNote?: string | null;
  documentId: string;
  revisionId: string | null;
  document: DocumentRecord;
};

export type DocumentLinkEvent = {
  id: string;
  targetType: DocumentTarget;
  targetId: string;
  documentId: string;
  revisionId: string | null;
  scopeRevisionId: string | null;
  action: 'attach' | 'detach';
  actorId: string;
  occurredAt: string;
};

function base(): string {
  return process.env.DOCUMENT_API_URL ?? 'http://localhost/api/document';
}

export class DocumentApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(`Document service returned ${status}`); }
}

async function request<T>(path: string, options: RequestInit = {}, timeoutMs?: number): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${base()}${path}`, { cache: 'no-store', ...options }, fetch, timeoutMs);
  } catch {
    throw new ApiUnavailableError('document');
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as { code?: string; error?: string };
    throw new DocumentApiError(response.status, problem.code ?? problem.error ?? 'document');
  }
  return response.json() as Promise<T>;
}

function json(authorization: string, method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function listDocuments(q: string | undefined, authorization: string): Promise<DocumentRecord[]> {
  return request(`/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers: { Authorization: authorization } });
}

export function getDocument(id: string, revision?: number, authorization?: string): Promise<DocumentRecord> {
  return request(`/documents/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ''}`, authorization ? { headers: { Authorization: authorization } } : {});
}

export function listDocumentRevisions(id: string, authorization: string): Promise<DocumentRevision[]> {
  return request(`/documents/${encodeURIComponent(id)}/revisions`, { headers: { Authorization: authorization } });
}

export function listDocumentEvents(id: string, authorization: string): Promise<{ id: string; eventType: string; occurredAt: string }[]> {
  return request(`/documents/${encodeURIComponent(id)}/events`, { headers: { Authorization: authorization } });
}

export function createDocument(body: SaveDocumentMetadata, authorization: string): Promise<DocumentRecord> {
  return request('/documents', json(authorization, 'POST', body));
}

export function reviseDocument(id: string, body: SaveDocumentMetadata & { expectedRevision: number }, authorization: string): Promise<DocumentRecord> {
  return request(`/documents/${encodeURIComponent(id)}`, json(authorization, 'PUT', body));
}

export function uploadDocument(id: string, expectedRevision: number, file: File, authorization: string): Promise<DocumentRecord> {
  const body = new FormData();
  body.set('file', file);
  return request(`/documents/${encodeURIComponent(id)}/file?expectedRevision=${expectedRevision}`, {
    method: 'POST', headers: { Authorization: authorization }, body,
  });
}

export function createLinkedDocument(targetType: 'constitution' | 'version' | 'amendment' | MaterialTarget | IngestionDocumentTarget, targetId: string, metadata: {
  operationId: string; title: string; description: string; sourceUrl: string; scopeRevisionId: string | null;
  citationKey?: string; bibliography?: DocumentBibliography;
  citationNote?: string;
}, file: File | null, authorization: string): Promise<DocumentRecord> {
  const body = new FormData();
  body.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  if (file) body.set('file', file);
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}/documents`, {
    method: 'POST', headers: { Authorization: authorization }, body,
  });
}

function scopeQuery(scopeRevisionId?: string | null): string {
  return scopeRevisionId ? `?scopeRevisionId=${encodeURIComponent(scopeRevisionId)}` : '';
}

export function listDocumentLinks(targetType: DocumentTarget, targetId: string, scopeRevisionId?: string | null, authorization?: string): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}${scopeQuery(scopeRevisionId)}`, authorization ? { headers: { Authorization: authorization } } : {});
}

export function listDocumentLinkEvents(targetType: DocumentTarget, targetId: string, authorization: string, scopeRevisionId?: string | null): Promise<DocumentLinkEvent[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}/events${scopeQuery(scopeRevisionId)}`, { headers: { Authorization: authorization } });
}

export function attachDocument(targetType: DocumentTarget, targetId: string, documentId: string, revisionId: string | null, authorization: string, scopeRevisionId?: string | null, citationNote?: string): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}`, json(authorization, 'POST', { documentId, revisionId, scopeRevisionId, ...(citationNote ? { citationNote } : {}) }));
}

export function detachDocument(targetType: DocumentTarget, targetId: string, documentId: string, authorization: string, scopeRevisionId?: string | null): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}/${encodeURIComponent(documentId)}${scopeQuery(scopeRevisionId)}`, {
    method: 'DELETE', headers: { Authorization: authorization },
  });
}

export function librarySearchParams(query: LibraryDocumentQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params;
}

export function listLibraryDocuments(query: LibraryDocumentQuery, authorization: string): Promise<DocumentLibraryPage> {
  return request(`/library/documents?${librarySearchParams(query)}`, { headers: { Authorization: authorization } });
}
export function listDocumentFolders(authorization: string): Promise<DocumentFolder[]> {
  return request('/library/folders', { headers: { Authorization: authorization } });
}
export function listDocumentTags(authorization: string): Promise<DocumentTag[]> {
  return request('/library/tags', { headers: { Authorization: authorization } });
}
export function saveDocumentFolder(name: string, authorization: string, id?: string): Promise<DocumentFolder> {
  return request(`/library/folders${id ? `/${encodeURIComponent(id)}` : ''}`, json(authorization, id ? 'PUT' : 'POST', { name }));
}
export async function deleteDocumentFolder(id: string, authorization: string): Promise<void> {
  let response: Response;
  try { response = await fetchWithTimeout(`${base()}/library/folders/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: authorization }, cache: 'no-store' }); }
  catch { throw new ApiUnavailableError('document'); }
  if (!response.ok) throw new DocumentApiError(response.status, 'document');
}
export function saveDocumentTag(name: string, authorization: string, id?: string): Promise<DocumentTag> {
  return request(`/library/tags${id ? `/${encodeURIComponent(id)}` : ''}`, json(authorization, id ? 'PUT' : 'POST', { name }));
}
export function changeDocumentTag(documentId: string, tagId: string, add: boolean, authorization: string): Promise<DocumentRecord> {
  return request(`/library/documents/${encodeURIComponent(documentId)}/tags/${encodeURIComponent(tagId)}`, { method: add ? 'PUT' : 'DELETE', headers: { Authorization: authorization } });
}
export function documentKeyAvailability(key: string, documentId: string | undefined, authorization: string): Promise<{ valid: boolean; available: boolean }> {
  const params = new URLSearchParams({ key });
  if (documentId) params.set('documentId', documentId);
  return request(`/library/key-availability?${params}`, { headers: { Authorization: authorization } });
}
export function resolveDocumentKey(key: string, authorization: string): Promise<DocumentRecord> {
  return request(`/library/keys/${encodeURIComponent(key)}`, { headers: { Authorization: authorization } });
}
export function listDocumentUsage(id: string, authorization: string): Promise<DocumentLinkEvent[]> {
  return request(`/library/documents/${encodeURIComponent(id)}/usage`, { headers: { Authorization: authorization } });
}
export function archiveDocument(id: string, authorization: string): Promise<DocumentRecord> {
  return request(`/documents/${encodeURIComponent(id)}/archive`, { method: 'POST', headers: { Authorization: authorization } });
}
export function addDocumentAttachment(id: string, expectedRevision: number, file: File, authorization: string): Promise<DocumentRecord> {
  const body = new FormData(); body.set('file', file);
  return request(`/documents/${encodeURIComponent(id)}/attachments?expectedRevision=${expectedRevision}`, { method: 'POST', headers: { Authorization: authorization }, body });
}
export function changeDocumentAttachment(id: string, attachmentId: string, expectedRevision: number, primary: boolean, authorization: string): Promise<DocumentRecord> {
  return request(`/documents/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}${primary ? '/primary' : ''}?expectedRevision=${expectedRevision}`, { method: primary ? 'PUT' : 'DELETE', headers: { Authorization: authorization } });
}
export function previewDocumentBibtex(content: string, folderId: string | undefined, authorization: string): Promise<BibtexPreview> {
  return request('/library/bibtex/preview', json(authorization, 'POST', { content, folderId }));
}
export function importDocumentBibtex(body: BibtexImportRequest, authorization: string): Promise<{ documents: DocumentRecord[]; skipped: number }> {
  return request('/library/bibtex/import', json(authorization, 'POST', body), 60_000);
}

/** Return bytes only through fixed, authorized paths; callers must never accept an arbitrary proxy URL. */
export async function readDocumentDownload(options: { folderId?: string; documentIds?: string; includeFiles?: boolean; documentId?: string; revision?: number; attachmentId?: string }, authorization: string): Promise<Response> {
  let path: string;
  if (options.documentId && options.revision) {
    path = `/documents/${encodeURIComponent(options.documentId)}/revisions/${options.revision}/${options.attachmentId ? `attachments/${encodeURIComponent(options.attachmentId)}/` : ''}file`;
  } else {
    const params = new URLSearchParams();
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.documentIds) params.set('documentIds', options.documentIds);
    if (options.includeFiles) params.set('includeFiles', 'true');
    path = `/library/bibtex/export?${params}`;
  }
  try { return await fetchWithTimeout(`${base()}${path}`, { headers: { Authorization: authorization }, cache: 'no-store' }); }
  catch { throw new ApiUnavailableError('document'); }
}

export function reviseMaterial(targetType: MaterialTarget, targetId: string, documentId: string, body: { title: string; description: string; sourceUrl: string; expectedRevision: number; expectedLinkedRevisionId: string; scopeRevisionId: string | null }, authorization: string): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}/${encodeURIComponent(documentId)}/material`, json(authorization, 'PUT', body));
}

/** Upload once into the library; the host owns when the selected pin is committed. */
export function stageDocument(metadata: Parameters<typeof createLinkedDocument>[2], file: File | null, authorization: string): Promise<DocumentRecord> {
  const body = new FormData();
  body.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  if (file) body.set('file', file);
  return request('/library/documents', { method: 'POST', headers: { Authorization: authorization }, body });
}
