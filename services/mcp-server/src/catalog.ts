export type Version = {
  id: string;
  constitutionId: string;
  countryCode?: string | null;
  jurisdictionId?: string | null;
  versionLabel: string;
  publicationStatus: string;
  effectiveDate?: string | null;
  languageCode: string;
  listing?: string;
  currentVersionId?: string | null;
};

export class UpstreamError extends Error {
  constructor(readonly status: number, readonly upstream: string, detail?: string) {
    super(status === 404 ? 'The requested record was not found.' : status === 401 || status === 403 ? 'This operation requires an authorized MCP key.' : status === 400 || status === 409 || status === 413 ? detail || 'The submitted content needs correction.' : `${upstream} is unavailable.`);
  }
}

async function upstreamFailure(response: Response, upstream: string): Promise<UpstreamError> {
  if (![400, 409, 413].includes(response.status)) return new UpstreamError(response.status, upstream);
  const body: unknown = await response.json().catch(() => null);
  let detail: string | undefined;
  if (body && typeof body === 'object') {
    const fields = body as Record<string, unknown>;
    detail = [fields.detail, fields.message, fields.title]
      .find((value): value is string => typeof value === 'string' && value.length > 0);
  }
  return new UpstreamError(response.status, upstream, detail?.slice(0, 1000));
}

const upstreams = {
  catalog: process.env.CATALOG_API_URL ?? 'http://catalog-service:8080',
  content: process.env.CONTENT_API_URL ?? 'http://content-service:8080',
  search: process.env.SEARCH_API_URL ?? 'http://search-service:8080',
  identity: process.env.IDENTITY_API_URL ?? 'http://identity-service:8080',
  ingestion: process.env.INGESTION_API_URL ?? 'http://ingestion-service:8080',
};

/** Preserve read/write deadlines and caller credentials through one transport path; never retry writes. */
async function requestJson<T>(
  upstream: keyof typeof upstreams,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  authorization?: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`${upstreams[upstream]}${path}`, {
    method,
    signal: AbortSignal.timeout(method === 'GET' ? 8_000 : 30_000),
    headers: {
      Accept: 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw await upstreamFailure(response, upstream);
  return response.json() as Promise<T>;
}

export function getJson<T>(upstream: keyof typeof upstreams, path: string, authorization?: string): Promise<T> {
  return requestJson(upstream, path, 'GET', authorization);
}

export function postJson<T>(upstream: keyof typeof upstreams, path: string, body: unknown, authorization: string, idempotencyKey?: string): Promise<T> {
  return requestJson(upstream, path, 'POST', authorization, body, idempotencyKey);
}

export function putJson<T>(upstream: keyof typeof upstreams, path: string, body: unknown, authorization: string): Promise<T> {
  return requestJson(upstream, path, 'PUT', authorization, body);
}

export function deleteJson<T>(upstream: keyof typeof upstreams, path: string, authorization: string): Promise<T> {
  return requestJson(upstream, path, 'DELETE', authorization);
}

export async function requirePublishedVersion(versionId: string): Promise<Version> {
  const version = await getJson<Version>('catalog', `/versions/${encodeURIComponent(versionId)}`);
  if (version.publicationStatus !== 'published') {
    // Do not disclose whether an unpublished version exists.
    throw new UpstreamError(404, 'catalog');
  }
  return version;
}

export async function authenticateMcpKey(authorization?: string): Promise<{ id?: string; scopes: string[]; resource?: string }> {
  if (!authorization || !/^Bearer ca_(?:mcp|oauth)_[A-Za-z0-9_-]+$/.test(authorization)) {
    throw new UpstreamError(401, 'identity');
  }
  const actor = await getJson<{ id?: string; scopes?: string[]; resource?: string }>('identity', '/me', authorization);
  if (authorization.startsWith('Bearer ca_oauth_') && actor.resource !== `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '')}/mcp`) throw new UpstreamError(401, 'identity');
  if (!actor.scopes?.includes('mcp:read')) throw new UpstreamError(403, 'identity');
  return { id: actor.id, scopes: actor.scopes, resource: actor.resource };
}

export function publicVersionUrl(version: Version): string | null {
  if (!version.countryCode && !version.jurisdictionId) return null;
  const base = (process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
  return version.countryCode ? `${base}/countries/${encodeURIComponent(version.countryCode)}/versions/${encodeURIComponent(version.id)}` : `${base}/jurisdictions/${encodeURIComponent(version.jurisdictionId!)}/versions/${encodeURIComponent(version.id)}`;
}
