'use server';

import { cookies } from 'next/headers';
import { requestPasskeyFinishEnrollment, requestPasskeyStartEnrollment, requestPasskeyStartLogin, requestPasskeyStartLoginEnrollment, requestRevokePasskey } from '../../lib/identity-client';
import { completePasskeyLogin, completePasskeyLoginEnrollment, mfaChallengeToken, SESSION_COOKIE } from '../../lib/session';

async function sessionToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('Sign in first');
  return token;
}

export async function startPasskeyEnrollment(password: string) {
  return requestPasskeyStartEnrollment(await sessionToken(), password);
}

export async function finishPasskeyEnrollment(challengeId: string, credential: unknown, label: string) {
  return requestPasskeyFinishEnrollment(await sessionToken(), challengeId, credential, label);
}

export async function startPasskeyLogin() {
  return requestPasskeyStartLogin();
}

export async function finishPasskeyLogin(challengeId: string, credential: unknown) {
  const user = await completePasskeyLogin(challengeId, credential);
  return { roles: user.roles };
}

export async function startPasskeyLoginEnrollment() {
  const challengeToken = await mfaChallengeToken();
  if (!challengeToken) throw new Error('Login challenge expired');
  return requestPasskeyStartLoginEnrollment(challengeToken);
}

export async function finishPasskeyLoginEnrollment(challengeId: string, credential: unknown) {
  const user = await completePasskeyLoginEnrollment(challengeId, credential);
  return { roles: user.roles };
}

export async function revokePasskey(id: string, password: string) {
  return requestRevokePasskey(await sessionToken(), id, password);
}
