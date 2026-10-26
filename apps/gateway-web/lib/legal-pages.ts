import { fetchWithTimeout } from './fetch-with-timeout';
export type LegalPageKey = 'impressum' | 'datenschutz' | 'impressum_en' | 'datenschutz_en';

export type LegalPageRevision = {
  revision: number;
  content: string;
  createdAt: string;
  createdBy: string;
  separateContact?: boolean;
};

export type LegalPageState = {
  key: LegalPageKey;
  draft: LegalPageRevision | null;
  published: LegalPageRevision | null;
};

export type ImprintDetails = {
  revision: number;
  name: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
};

export type ImprintDetailsState = { draft: ImprintDetails | null; published: ImprintDetails | null; managedFields?: string[] };

export type LegalPageErrorReason = 'contact_required' | 'example_contact' | 'example_text' | 'duplicate_contact' | 'invalid_contact' | 'conflict' | 'unavailable';

export class LegalPageWriteError extends Error {
  constructor(readonly reason: LegalPageErrorReason) {
    super(reason);
    this.name = 'LegalPageWriteError';
  }
}

async function rejectWrite(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null);
  const reasons: Record<string, LegalPageErrorReason> = {
    'Publish the shared imprint details first': 'contact_required',
    'Replace example contact details before publication': 'example_contact',
    'Replace example legal details before publication': 'example_text',
    'Remove contact and address details from the legal prose before publication': 'duplicate_contact',
    'Imprint details must be complete': 'invalid_contact',
    'Invalid contact email': 'invalid_contact',
  };
  throw new LegalPageWriteError(response.status === 409 ? 'conflict' : (Object.prototype.hasOwnProperty.call(reasons, payload?.error) ? reasons[payload.error] : 'unavailable'));
}

function base(): string {
  return process.env.DOCUMENT_API_URL ?? 'http://localhost/api/document';
}

async function read<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const response = await fetchWithTimeout(`${base()}${path}`, options);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Legal page service returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function publicLegalPage(key: LegalPageKey): Promise<LegalPageRevision | null> {
  return read(`/legal-pages/${key}`, { cache: 'no-store' });
}

export function publicImprintDetails(): Promise<ImprintDetails | null> {
  return read('/legal-pages/imprint-details', { cache: 'no-store' });
}

export function adminImprintDetails(bearer: string): Promise<ImprintDetailsState | null> {
  return read('/legal-pages/imprint-details/editor', { cache: 'no-store', headers: { Authorization: bearer } });
}

export function adminLegalPage(key: LegalPageKey, bearer: string): Promise<LegalPageState | null> {
  return read(`/legal-pages/${key}/editor`, { cache: 'no-store', headers: { Authorization: bearer } });
}

export async function adminLegalPageRevisions(key: LegalPageKey, bearer: string): Promise<LegalPageRevision[]> {
  return (await read<LegalPageRevision[]>(`/legal-pages/${key}/editor/revisions`, { cache: 'no-store', headers: { Authorization: bearer } })) ?? [];
}

async function write(key: LegalPageKey, action: 'draft' | 'publish', body: object, bearer: string): Promise<LegalPageState> {
  const response = await fetchWithTimeout(`${base()}/legal-pages/${key}/${action}`, {
    method: action === 'draft' ? 'PUT' : 'POST',
    cache: 'no-store',
    headers: { Authorization: bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) await rejectWrite(response);
  return response.json() as Promise<LegalPageState>;
}

export function saveLegalPageDraft(key: LegalPageKey, content: string, expectedRevision: number, bearer: string, contact?: Omit<ImprintDetails, 'revision'> & { expectedRevision: number }): Promise<LegalPageState> {
  return write(key, 'draft', { content, expectedRevision, contact }, bearer);
}

export function publishLegalPage(key: LegalPageKey, expectedRevision: number, bearer: string, expectedContactRevision?: number): Promise<LegalPageState> {
  return write(key, 'publish', { expectedRevision, expectedContactRevision }, bearer);
}
