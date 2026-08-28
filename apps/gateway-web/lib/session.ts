import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'ca_session';

export type SessionUser = {
  id: string;
  email: string;
  roles: string[];
};

export function identityBaseUrl(): string {
  return process.env.IDENTITY_API_URL ?? 'http://localhost/api/identity';
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const response = await fetch(`${identityBaseUrl()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Invalid credentials');
  }
  const body = (await response.json()) as { token: string; user: SessionUser };
  cookies().set(SESSION_COOKIE, body.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return body.user;
}

export async function logout(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await fetch(`${identityBaseUrl()}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }
  cookies().delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const response = await fetch(`${identityBaseUrl()}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as SessionUser;
}
