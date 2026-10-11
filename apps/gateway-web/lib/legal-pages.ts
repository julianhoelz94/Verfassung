export type LegalPageKey = 'impressum' | 'datenschutz';

export type LegalPageRevision = {
  revision: number;
  content: string;
  createdAt: string;
  createdBy: string;
};

export type LegalPageState = {
  key: LegalPageKey;
  draft: LegalPageRevision | null;
  published: LegalPageRevision | null;
};

function base(): string {
  return process.env.DOCUMENT_API_URL ?? 'http://localhost/api/document';
}

async function read<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const response = await fetch(`${base()}${path}`, options);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Legal page service returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function publicLegalPage(key: LegalPageKey): Promise<LegalPageRevision | null> {
  return read(`/legal-pages/${key}`, { next: { revalidate: 60 } });
}

export function adminLegalPage(key: LegalPageKey, bearer: string): Promise<LegalPageState | null> {
  return read(`/legal-pages/${key}/editor`, { cache: 'no-store', headers: { Authorization: bearer } });
}

export async function adminLegalPageRevisions(key: LegalPageKey, bearer: string): Promise<LegalPageRevision[]> {
  return (await read<LegalPageRevision[]>(`/legal-pages/${key}/editor/revisions`, { cache: 'no-store', headers: { Authorization: bearer } })) ?? [];
}

async function write(key: LegalPageKey, action: 'draft' | 'publish', body: object, bearer: string): Promise<LegalPageState> {
  const response = await fetch(`${base()}/legal-pages/${key}/${action}`, {
    method: action === 'draft' ? 'PUT' : 'POST',
    cache: 'no-store',
    headers: { Authorization: bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Legal page service returned ${response.status}`);
  return response.json() as Promise<LegalPageState>;
}

export function saveLegalPageDraft(key: LegalPageKey, content: string, expectedRevision: number, bearer: string): Promise<LegalPageState> {
  return write(key, 'draft', { content, expectedRevision }, bearer);
}

export function publishLegalPage(key: LegalPageKey, expectedRevision: number, bearer: string): Promise<LegalPageState> {
  return write(key, 'publish', { expectedRevision }, bearer);
}
