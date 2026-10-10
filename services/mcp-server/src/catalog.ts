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
  constructor(readonly status: number, readonly upstream: string, detail?: string) {
    super(status === 404 ? 'The requested record was not found.' : status === 401 || status === 403 ? 'This operation requires an authorized MCP key.' : status === 400 || status === 409 || status === 413 ? detail || 'The submitted content needs correction.' : `${upstream} is unavailable.`);
  }
}

async function upstreamFailure(response: Response, upstream: string): Promise<UpstreamError> {
  if (![400, 409, 413].includes(response.status)) return new UpstreamError(response.status, upstream);
  const body = await response.text().catch(() => '');
  let detail = '';
  try { const data = JSON.parse(body) as { detail?: string; title?: string; message?: string }; detail = data.detail || data.message || data.title || ''; }
  catch { detail = ''; }
  return new UpstreamError(response.status, upstream, detail.slice(0, 1000));
}

const upstreams = {
  catalog: process.env.CATALOG_API_URL ?? 'http://catalog-service:8080',
  content: process.env.CONTENT_API_URL ?? 'http://content-service:8080',
  search: process.env.SEARCH_API_URL ?? 'http://search-service:8080',
  identity: process.env.IDENTITY_API_URL ?? 'http://identity-service:8080',
  ingestion: process.env.INGESTION_API_URL ?? 'http://ingestion-service:8080',
};

export async function getJson<T>(upstream: keyof typeof upstreams, path: string, authorization?: string): Promise<T> {
  const response = await fetch(`${upstreams[upstream]}${path}`, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
  });
  if (!response.ok) throw await upstreamFailure(response, upstream);
  return response.json() as Promise<T>;
}

export async function postJson<T>(upstream: keyof typeof upstreams, path: string, body: unknown, authorization: string, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${upstreams[upstream]}${path}`, {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await upstreamFailure(response, upstream);
  return response.json() as Promise<T>;
}

export async function putJson<T>(upstream: keyof typeof upstreams, path: string, body: unknown, authorization: string): Promise<T> {
  const response = await fetch(`${upstreams[upstream]}${path}`, {
    method: 'PUT', signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await upstreamFailure(response, upstream);
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
