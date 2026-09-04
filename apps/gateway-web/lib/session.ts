import { cookies } from 'next/headers';
import { identityBaseUrl, requestLogin, requestLogout, requestMe, type SessionUser } from './identity-client';

export const SESSION_COOKIE = 'ca_session';
export type { SessionUser };

export { identityBaseUrl };

export async function login(email: string, password: string): Promise<SessionUser> {
  const body = await requestLogin(email, password);
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
    return { user: await requestMe(token), identityUnavailable: false };
  } catch {
    return { user: null, identityUnavailable: true };
  }
}
