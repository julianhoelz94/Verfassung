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
  expiresInSeconds?: number;
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

export type AdminUser = {
  id: string;
  email: string;
  roles: string[];
  enabled: boolean;
  status: string;
  createdAt: string;
};

async function readOk<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(fallback);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function requestUsers(token: string, fetchImpl: FetchLike = fetch, baseUrl = identityBaseUrl()): Promise<AdminUser[]> {
  const response = await fetchImpl(`${baseUrl}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return readOk(response, 'Unable to list users');
}

export async function requestInvite(
  token: string,
  email: string,
  roles: string[],
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<{ user: AdminUser; inviteToken: string }> {
  const response = await fetchImpl(`${baseUrl}/users/invites`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, roles }),
    cache: 'no-store',
  });
  return readOk(response, 'Unable to invite user');
}

export async function requestDisableUser(token: string, userId: string, fetchImpl: FetchLike = fetch, baseUrl = identityBaseUrl()): Promise<AdminUser> {
  const response = await fetchImpl(`${baseUrl}/users/${userId}/disable`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return readOk(response, 'Unable to disable user');
}

export async function requestEnableUser(token: string, userId: string, fetchImpl: FetchLike = fetch, baseUrl = identityBaseUrl()): Promise<AdminUser> {
  const response = await fetchImpl(`${baseUrl}/users/${userId}/enable`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return readOk(response, 'Unable to enable user');
}

export async function requestChangePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<void> {
  const response = await fetchImpl(`${baseUrl}/password/change`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
    cache: 'no-store',
  });
  await readOk(response, 'Unable to change password');
}

export async function requestPasswordReset(email: string, fetchImpl: FetchLike = fetch, baseUrl = identityBaseUrl()): Promise<void> {
  const response = await fetchImpl(`${baseUrl}/password/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
  await readOk(response, 'Unable to request reset');
}

export async function requestConfirmReset(
  token: string,
  newPassword: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<void> {
  const response = await fetchImpl(`${baseUrl}/password/reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
    cache: 'no-store',
  });
  await readOk(response, 'Unable to reset password');
}

export async function requestIssueReset(
  token: string,
  userId: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<{ resetToken: string }> {
  const response = await fetchImpl(`${baseUrl}/users/${userId}/password-resets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return readOk(response, 'Unable to issue reset');
}

export async function requestAcceptInvite(
  token: string,
  password: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<AdminUser> {
  const response = await fetchImpl(`${baseUrl}/invites/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    cache: 'no-store',
  });
  return readOk(response, 'Unable to accept invite');
}
