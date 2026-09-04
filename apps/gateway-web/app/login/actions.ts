'use server';

import { redirect } from 'next/navigation';
import { canVisitEditor } from '../../lib/nav';
import { login, logout } from '../../lib/session';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  let user;
  try {
    user = await login(email, password);
  } catch {
    redirect('/login?error=1');
  }
  redirect(canVisitEditor(user.roles) ? '/editor' : '/');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/');
}
