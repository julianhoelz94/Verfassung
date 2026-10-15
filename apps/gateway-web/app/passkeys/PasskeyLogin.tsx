'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/ui';
import { getPasskey } from '../../lib/webauthn';
import { finishPasskeyLogin, startPasskeyLogin } from './actions';

export function PasskeyLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const started = await startPasskeyLogin();
      const credential = await getPasskey(started.options);
      const result = await finishPasskeyLogin(started.challengeId, credential);
      router.push(result.roles.some((role) => ['editor', 'reviewer', 'publisher', 'admin'].includes(role)) ? '/editor' : '/');
      router.refresh();
    } catch {
      setError('Passkey sign-in did not complete. Try again or use your password.');
    } finally {
      setBusy(false);
    }
  }
  return <div>
    <Button type="button" onClick={signIn} disabled={busy}>Sign in with a passkey</Button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
