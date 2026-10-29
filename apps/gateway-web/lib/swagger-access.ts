import { fetchWithTimeout } from './fetch-with-timeout';
import { IdentityApiError, identityBaseUrl } from './identity-client';

export type SwaggerAccessPolicy = { enabled: boolean };

async function readPolicy(response: Response): Promise<SwaggerAccessPolicy> {
  if (!response.ok) throw new Error('Swagger access settings unavailable');
  const policy: unknown = await response.json();
  if (!policy || typeof policy !== 'object' || !('enabled' in policy) || typeof policy.enabled !== 'boolean') {
    throw new Error('Invalid Swagger access settings');
  }
  return { enabled: policy.enabled };
}

export async function requestSwaggerAccessPolicy(
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = identityBaseUrl(),
): Promise<SwaggerAccessPolicy> {
  return readPolicy(await fetchWithTimeout(`${baseUrl}/swagger-access`, {
    cache: 'no-store', signal: AbortSignal.timeout(2000),
  }, fetchImpl));
}

export async function requestAdminSwaggerAccessPolicy(token: string): Promise<SwaggerAccessPolicy> {
  return readPolicy(await fetchWithTimeout(`${identityBaseUrl()}/admin/swagger-access`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  }));
}

export async function updateSwaggerAccessPolicy(token: string, policy: SwaggerAccessPolicy): Promise<void> {
  const response = await fetchWithTimeout(`${identityBaseUrl()}/admin/swagger-access`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(policy), cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    throw new IdentityApiError('Unable to save Swagger access settings', response.status, body.code);
  }
}
