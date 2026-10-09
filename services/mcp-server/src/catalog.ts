export type Version = {
  id: string;
  constitutionId: string;
  countryCode?: string | null;
  versionLabel: string;
  publicationStatus: string;
  effectiveDate?: string | null;
  languageCode: string;
  listing?: string;
};

export class UpstreamError extends Error {
  constructor(readonly status: number, readonly upstream: string) {
    super(status === 404 ? 'The requested record was not found.' : `${upstream} is unavailable.`);
  }
}

const upstreams = {
  catalog: process.env.CATALOG_API_URL ?? 'http://catalog-service:8080',
  content: process.env.CONTENT_API_URL ?? 'http://content-service:8080',
  search: process.env.SEARCH_API_URL ?? 'http://search-service:8080',
};

export async function getJson<T>(upstream: keyof typeof upstreams, path: string): Promise<T> {
  const response = await fetch(`${upstreams[upstream]}${path}`, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new UpstreamError(response.status, upstream);
  return response.json() as Promise<T>;
}

export async function requirePublishedVersion(versionId: string): Promise<Version> {
  const version = await getJson<Version>('catalog', `/versions/${encodeURIComponent(versionId)}`);
  if (version.publicationStatus !== 'published' || version.listing !== 'public') {
    // Do not disclose whether an unpublished version exists.
    throw new UpstreamError(404, 'catalog');
  }
  return version;
}

export function publicVersionUrl(version: Version): string | null {
  if (!version.countryCode) return null;
  const base = (process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
  return `${base}/countries/${encodeURIComponent(version.countryCode)}/versions/${encodeURIComponent(version.id)}`;
}
