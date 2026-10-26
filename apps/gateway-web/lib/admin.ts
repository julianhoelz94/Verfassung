import { loginHref, type ReturnSearchParams } from './return-to';
import { redirect } from 'next/navigation';
import { canVisitAdmin } from './nav';
import { currentUser, type SessionUser } from './session';

export function adminPageState(user: SessionUser | null): 'ok' | 'login' | 'forbidden' {
  if (!user) {
    return 'login';
  }
  if (!canVisitAdmin(user.roles)) {
    return 'forbidden';
  }
  return 'ok';
}

export async function requireAdminPage(returnTo = '/admin', searchParams?: ReturnSearchParams): Promise<SessionUser | null> {
  const user = await currentUser();
  const access = adminPageState(user);
  if (access === 'login') {
    redirect(loginHref(returnTo, searchParams));
  }
  if (access === 'forbidden') {
    return null;
  }
  return user;
}

export async function requireAdminUser(forbiddenRedirect: string): Promise<SessionUser> {
  const user = await requireAdminPage(forbiddenRedirect);
  if (!user) {
    redirect(forbiddenRedirect);
  }
  return user;
}
