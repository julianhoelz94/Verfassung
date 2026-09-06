export function identityBaseUrl(): string {
  return process.env.IDENTITY_API_URL ?? 'http://localhost/api/identity';
}

export type SessionUser = {
  id: string;
  email: string;
  roles: string[];
  mfaEnabled?: boolean;
  mfaRequired?: boolean;
  stepUpFresh?: boolean;
};

export type LoginResult = {
  token?: string;
  user: SessionUser;
  expiresInSeconds?: number;
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  challengeToken?: string;
};

export class IdentityApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'IdentityApiError';
  }
}

type FetchLike = typeof fetch;

export async function requestLogin(
  email: string,
  password: string,
  fetchImpl: FetchLike = fetch,
  baseUrl: string = identityBaseUrl(),
  extraHeaders: Record<string, string> = {},
): Promise<LoginResult> {
  const response = await fetchImpl(`${baseUrl}/login`, {
    method: 'POST',
    headers: { ...extraHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new IdentityApiError('Invalid credentials', response.status);
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
    let code: string | undefined;
    let message = fallback;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.error) {
        message = body.error;
      }
      code = body.code;
    } catch {
      // Keep the fallback message when the body is not JSON.
    }
    throw new IdentityApiError(message, response.status, code);
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

async function postJson<T>(
  path: string,
  fallback: string,
  body: unknown,
  options: {
    token?: string;
    method?: string;
    fetchImpl?: FetchLike;
    baseUrl?: string;
  } = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? identityBaseUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return readOk(response, fallback);
}

export async function requestCompleteMfaLogin(
  challengeToken: string,
  code?: string,
  recoveryCode?: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<LoginResult> {
  return postJson(
    '/login/mfa',
    'Invalid authenticator or recovery code',
    { challengeToken, code, recoveryCode },
    { fetchImpl, baseUrl },
  );
}

export type MfaEnrollStart = {
  secret: string;
  otpauthUrl: string;
  challengeToken: string;
};

export async function requestStartMfaEnroll(
  challengeToken?: string,
  sessionToken?: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<MfaEnrollStart> {
  return postJson('/mfa/enroll/start', 'Unable to start MFA enrollment', { challengeToken }, {
    token: sessionToken,
    fetchImpl,
    baseUrl,
  });
}

export type MfaEnrollConfirm = {
  recoveryCodes: string[];
  token?: string;
  user?: SessionUser;
  expiresInSeconds?: number;
};

export async function requestConfirmMfaEnroll(
  code: string,
  challengeToken?: string,
  sessionToken?: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<MfaEnrollConfirm> {
  return postJson(
    '/mfa/enroll/confirm',
    'Unable to confirm MFA enrollment',
    { code, challengeToken },
    { token: sessionToken, fetchImpl, baseUrl },
  );
}

export async function requestStepUp(
  token: string,
  code: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<void> {
  await postJson('/mfa/step-up', 'Unable to confirm step-up authentication', { code }, {
    token,
    fetchImpl,
    baseUrl,
  });
}

export async function requestRevokeMfa(
  token: string,
  code: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<void> {
  await postJson('/mfa', 'Unable to revoke MFA', { code }, {
    token,
    method: 'DELETE',
    fetchImpl,
    baseUrl,
  });
}

export async function requestRegenerateRecovery(
  token: string,
  code: string,
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<{ recoveryCodes: string[] }> {
  return postJson('/mfa/recovery/regenerate', 'Unable to replace recovery codes', { code }, {
    token,
    fetchImpl,
    baseUrl,
  });
}

export async function requestUpdateRoles(
  token: string,
  userId: string,
  roles: string[],
  fetchImpl: FetchLike = fetch,
  baseUrl = identityBaseUrl(),
): Promise<AdminUser> {
  const response = await fetchImpl(`${baseUrl}/users/${userId}/roles`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles }),
    cache: 'no-store',
  });
  return readOk(response, 'Unable to update roles');
}
