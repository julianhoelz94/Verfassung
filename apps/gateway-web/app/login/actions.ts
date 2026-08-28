'use server';

import { redirect } from 'next/navigation';
import { login, logout } from '../../lib/session';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    await login(email, password);
  } catch {
    redirect('/login?error=1');
  }
  redirect('/editor');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/');
}
