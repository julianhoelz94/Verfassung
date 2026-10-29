import { catalogBaseUrl, readJson } from './api';
import type { ConstitutionLifecycleEvent, ContentOutline, VersionDetail, VersionSummary } from './api';
import { fetchWithTimeout } from './fetch-with-timeout';

export type ConstitutionMetadata = { revisionId: string; title: string; slug: string; predecessorId: string | null };
export type ConstitutionMetadataWrite = Pick<ConstitutionMetadata, 'title' | 'slug'> & { expectedRevisionId: string; retainSlugAlias: true };
export type ConstitutionDetails = {
  metadata: ConstitutionMetadata;
  version: VersionDetail;
  versionFacts: VersionSummary | null;
  outline: ContentOutline | null;
  events: ConstitutionLifecycleEvent[];
};

export class ConstitutionMetadataError extends Error {
  constructor(public readonly status: number, public readonly key: string) { super(key); }
}

export function getConstitutionMetadata(id: string, authorization: string): Promise<ConstitutionMetadata | null> {
  return readJson<ConstitutionMetadata>(`${catalogBaseUrl()}/constitutions/${encodeURIComponent(id)}/metadata`, 'catalog', authorization);
}

/** Preserve the Catalog revision guard and permanent slug-alias requirement. */
export async function saveConstitutionMetadata(id: string, payload: ConstitutionMetadataWrite, authorization: string): Promise<ConstitutionMetadata> {
  const response = await fetchWithTimeout(`${catalogBaseUrl()}/constitutions/${encodeURIComponent(id)}/metadata`, {
    method: 'PUT', cache: 'no-store', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const key = ['stale_metadata', 'slug_reserved', 'slug_alias_required'].includes(body?.code) ? body.code : 'save_failed';
    throw new ConstitutionMetadataError(response.status, key);
  }
  return await response.json() as ConstitutionMetadata;
}
