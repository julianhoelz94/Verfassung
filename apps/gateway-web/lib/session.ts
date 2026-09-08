import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  identityBaseUrl,
  requestCompleteMfaLogin,
  requestConfirmMfaEnroll,
  requestLogin,
  requestLogout,
  type SessionUser,
} from './identity-client';
import { interpretMeResponse } from './interpret-me';

export const SESSION_COOKIE = 'ca_session';
export const MFA_CHALLENGE_COOKIE = 'ca_mfa_challenge';
export type { SessionUser };

export { identityBaseUrl };

async function sessionBearer(): Promise<string | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? `Bearer ${token}` : undefined;
}

export async function requireSessionBearer(): Promise<string> {
  const header = await sessionBearer();
  if (!header) {
    redirect('/login');
  }
  return header;
}

function cookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.SESSION_COOKIE_SECURE === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

async function incomingClientIp(): Promise<string | undefined> {
  const incoming = await headers();
  const forwarded = incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) {
    return forwarded;
  }
  return incoming.get('x-real-ip')?.trim() || undefined;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: SessionUser } | { mfa: 'challenge' | 'enroll' }> {
  const extraHeaders: Record<string, string> = {};
  const existing = (await cookies()).get(SESSION_COOKIE)?.value;
  if (existing) {
    extraHeaders.Authorization = `Bearer ${existing}`;
  }
  const clientIp = await incomingClientIp();
  if (clientIp) {
    extraHeaders['X-Forwarded-For'] = clientIp;
  }
  const body = await requestLogin(email, password, fetch, identityBaseUrl(), extraHeaders);
  if (body.mfaRequired && body.challengeToken) {
    await setChallengeCookie(body.challengeToken);
    return { mfa: 'challenge' };
  }
  if (body.mfaEnrollmentRequired && body.challengeToken) {
    await setChallengeCookie(body.challengeToken);
    return { mfa: 'enroll' };
  }
  if (!body.token) {
    throw new Error('Invalid credentials');
  }
  await clearChallengeCookie();
  await setSessionCookie(body.token, body.expiresInSeconds);
  return { user: body.user };
}

export async function completeMfaLogin(code: string, recoveryCode?: string): Promise<SessionUser> {
  const challengeToken = (await cookies()).get(MFA_CHALLENGE_COOKIE)?.value;
  if (!challengeToken) {
    throw new Error('MFA challenge expired');
  }
  const body = await requestCompleteMfaLogin(challengeToken, code || undefined, recoveryCode || undefined);
  if (!body.token) {
    throw new Error('Invalid credentials');
  }
  await clearChallengeCookie();
  await setSessionCookie(body.token, body.expiresInSeconds);
  return body.user;
}

export async function confirmMfaEnrollment(code: string): Promise<{ user: SessionUser; recoveryCodes: string[] }> {
  const store = await cookies();
  const challengeToken = store.get(MFA_CHALLENGE_COOKIE)?.value;
  const sessionToken = store.get(SESSION_COOKIE)?.value;
  const body = await requestConfirmMfaEnroll(code, challengeToken, sessionToken);
  await clearChallengeCookie();
  if (body.token) {
    await setSessionCookie(body.token, body.expiresInSeconds);
  }
  if (!body.user && !sessionToken) {
    throw new Error('Unable to confirm MFA enrollment');
  }
  return {
    user: body.user ?? { id: '', email: '', roles: [] },
    recoveryCodes: body.recoveryCodes,
  };
}

async function setSessionCookie(token: string, expiresInSeconds?: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: cookieSecure(),
    maxAge: expiresInSeconds ?? 60 * 60 * 24,
  });
}

export async function setChallengeCookie(token: string) {
  (await cookies()).set(MFA_CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: cookieSecure(),
    maxAge: 5 * 60,
  });
}

export async function clearChallengeCookie() {
  (await cookies()).delete(MFA_CHALLENGE_COOKIE);
}

export async function mfaChallengeToken(): Promise<string | undefined> {
  return (await cookies()).get(MFA_CHALLENGE_COOKIE)?.value;
}

export async function logout(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    await requestLogout(token).catch(() => undefined);
  }
  (await cookies()).delete(SESSION_COOKIE);
  await clearChallengeCookie();
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await currentSession();
  return session.user;
}

export async function currentSession(): Promise<{ user: SessionUser | null; identityUnavailable: boolean }> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
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
        store.delete(SESSION_COOKIE);
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
