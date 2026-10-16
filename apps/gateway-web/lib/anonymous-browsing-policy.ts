import { identityBaseUrl } from './identity-client';

export type AnonymousRate = { requests: number; windowValue: number; windowUnit: 'minutes' | 'hours' | 'days' };
export type AnonymousBrowsingPolicy = { allowed: boolean; perIp: AnonymousRate; total: AnonymousRate; revision?: number };

export async function requestAnonymousBrowsingPolicy(
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = identityBaseUrl(),
): Promise<AnonymousBrowsingPolicy> {
  const response = await fetchImpl(`${baseUrl}/anonymous-browsing`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error('Anonymous browsing policy unavailable');
  return (await response.json()) as AnonymousBrowsingPolicy;
}

export async function requestAdminAnonymousBrowsingPolicy(token: string): Promise<AnonymousBrowsingPolicy> {
  const response = await fetch(`${identityBaseUrl()}/admin/anonymous-browsing`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to load anonymous browsing settings');
  return (await response.json()) as AnonymousBrowsingPolicy;
}

export async function updateAnonymousBrowsingPolicy(token: string, policy: AnonymousBrowsingPolicy): Promise<void> {
  const response = await fetch(`${identityBaseUrl()}/admin/anonymous-browsing`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(policy), cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    const error = new Error('Unable to save anonymous browsing settings') as Error & { code?: string };
    error.code = body.code;
    throw error;
  }
}
