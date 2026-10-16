'use server';

import { redirect } from 'next/navigation';
import { requestConfirmRegistration, requestRegistration } from '../../lib/identity-client';

export async function registerAction(formData: FormData): Promise<void> {
  try {
    await requestRegistration(String(formData.get('email') ?? ''));
  } catch {
    redirect('/register?error=1');
  }
  redirect('/register?sent=1');
}

export async function confirmRegistrationAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  try {
    await requestConfirmRegistration(token, String(formData.get('password') ?? ''));
  } catch {
    redirect(`/register/confirm?token=${encodeURIComponent(token)}&error=1`);
  }
  redirect('/login?registered=1');
}
