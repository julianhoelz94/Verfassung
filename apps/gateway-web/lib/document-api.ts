import { ApiUnavailableError } from './api';

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
};

export type DocumentRecord = {
  id: string;
  currentRevision: number;
  status: 'active' | 'archived';
  createdAt: string;
  revision: DocumentRevision;
};

export type DocumentLink = {
  documentId: string;
  revisionId: string | null;
  document: DocumentRecord;
};

export type DocumentLinkEvent = {
  id: string;
  targetType: 'constitution' | 'amendment';
  targetId: string;
  documentId: string;
  revisionId: string | null;
  action: 'attach' | 'detach';
  actorId: string;
  occurredAt: string;
};

function base(): string {
  return process.env.DOCUMENT_API_URL ?? 'http://localhost/api/document';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, { cache: 'no-store', ...options });
  } catch {
    throw new ApiUnavailableError('document');
  }
  if (!response.ok) {
    throw new Error(`Document service returned ${response.status}`);
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

export function listDocuments(q?: string): Promise<DocumentRecord[]> {
  return request(`/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export function getDocument(id: string, revision?: number): Promise<DocumentRecord> {
  return request(`/documents/${encodeURIComponent(id)}${revision ? `?revision=${revision}` : ''}`);
}

export function listDocumentRevisions(id: string): Promise<DocumentRevision[]> {
  return request(`/documents/${encodeURIComponent(id)}/revisions`);
}

export function listDocumentEvents(id: string, authorization: string): Promise<{ id: string; eventType: string; occurredAt: string }[]> {
  return request(`/documents/${encodeURIComponent(id)}/events`, { headers: { Authorization: authorization } });
}

export function createDocument(body: { title: string; description?: string; sourceUrl?: string }, authorization: string): Promise<DocumentRecord> {
  return request('/documents', json(authorization, 'POST', body));
}

export function reviseDocument(id: string, body: { title: string; description?: string; sourceUrl?: string; expectedRevision: number }, authorization: string): Promise<DocumentRecord> {
  return request(`/documents/${encodeURIComponent(id)}`, json(authorization, 'PUT', body));
}

export function uploadDocument(id: string, expectedRevision: number, file: File, authorization: string): Promise<DocumentRecord> {
  const body = new FormData();
  body.set('file', file);
  return request(`/documents/${encodeURIComponent(id)}/file?expectedRevision=${expectedRevision}`, {
    method: 'POST', headers: { Authorization: authorization }, body,
  });
}

export function listDocumentLinks(targetType: 'constitution' | 'amendment', targetId: string): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}`);
}

export function listDocumentLinkEvents(targetType: 'constitution' | 'amendment', targetId: string, authorization: string): Promise<DocumentLinkEvent[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}/events`, { headers: { Authorization: authorization } });
}

export function attachDocument(targetType: 'constitution' | 'amendment', targetId: string, documentId: string, revisionId: string | null, authorization: string): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}`, json(authorization, 'POST', { documentId, revisionId }));
}

export function detachDocument(targetType: 'constitution' | 'amendment', targetId: string, documentId: string, authorization: string): Promise<DocumentLink[]> {
  return request(`/links/${targetType}/${encodeURIComponent(targetId)}/${encodeURIComponent(documentId)}`, {
    method: 'DELETE', headers: { Authorization: authorization },
  });
}
