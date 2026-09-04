import { cookies, headers } from 'next/headers';
import { identityBaseUrl, requestLogout, type SessionUser } from './identity-client';
import { interpretMeResponse } from './interpret-me';

export const SESSION_COOKIE = 'ca_session';
export type { SessionUser };

export { identityBaseUrl };

function cookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.SESSION_COOKIE_SECURE === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

function incomingClientIp(): string | undefined {
  const incoming = headers();
  const forwarded = incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) {
    return forwarded;
  }
  return incoming.get('x-real-ip')?.trim() || undefined;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const existing = cookies().get(SESSION_COOKIE)?.value;
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (existing) {
    requestHeaders.Authorization = `Bearer ${existing}`;
  }
  const clientIp = incomingClientIp();
  if (clientIp) {
    requestHeaders['X-Forwarded-For'] = clientIp;
  }
  const response = await fetch(`${identityBaseUrl()}/login`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Invalid credentials');
  }
  const body = (await response.json()) as {
    token: string;
    user: SessionUser;
    expiresInSeconds?: number;
  };
  cookies().set(SESSION_COOKIE, body.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: cookieSecure(),
    maxAge: body.expiresInSeconds ?? 60 * 60 * 24,
  });
  return body.user;
}

export async function logout(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await requestLogout(token).catch(() => undefined);
  }
  cookies().delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await currentSession();
  return session.user;
}

export async function currentSession(): Promise<{ user: SessionUser | null; identityUnavailable: boolean }> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return { user: null, identityUnavailable: false };
  }
  try {
    const response = await fetch(`${identityBaseUrl()}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const decision = interpretMeResponse({ networkError: false, status: response.status });
    if (decision.clearCookie) {
      try {
        cookies().delete(SESSION_COOKIE);
      } catch {
        // App Router layouts cannot mutate cookies; signed-out rendering still proceeds.
      }
    }
    if (decision.signedOut) {
      return { user: null, identityUnavailable: response.status >= 500 };
    }
    return { user: (await response.json()) as SessionUser, identityUnavailable: false };
  } catch {
    return { user: null, identityUnavailable: true };
  }
}
