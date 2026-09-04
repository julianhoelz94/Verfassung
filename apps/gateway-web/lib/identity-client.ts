export function identityBaseUrl(): string {
  return process.env.IDENTITY_API_URL ?? 'http://localhost/api/identity';
}

export type SessionUser = {
  id: string;
  email: string;
  roles: string[];
};

export type LoginResult = {
  token: string;
  user: SessionUser;
};

type FetchLike = typeof fetch;

export async function requestLogin(
  email: string,
  password: string,
  fetchImpl: FetchLike = fetch,
  baseUrl: string = identityBaseUrl(),
): Promise<LoginResult> {
  const response = await fetchImpl(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Invalid credentials');
  }
  return (await response.json()) as LoginResult;
}

export async function requestMe(
  token: string,
  fetchImpl: FetchLike = fetch,
  baseUrl: string = identityBaseUrl(),
): Promise<SessionUser | null> {
  const response = await fetchImpl(`${baseUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as SessionUser;
}

export async function requestLogout(
  token: string,
  fetchImpl: FetchLike = fetch,
  baseUrl: string = identityBaseUrl(),
): Promise<void> {
  await fetchImpl(`${baseUrl}/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
}
