'use client';

import { T, ui } from '../components/TranslationProvider';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/ui';
import { createPasskey } from '../../lib/webauthn';
import { finishPasskeyLoginEnrollment, startPasskeyLoginEnrollment } from './actions';

export function PasskeyLoginEnrollment() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const started = await startPasskeyLoginEnrollment();
      const credential = await createPasskey(started.options);
      const result = await finishPasskeyLoginEnrollment(started.challengeId, credential);
      router.push(result.roles.some((role) => ['editor', 'reviewer', 'publisher', 'admin'].includes(role)) ? '/editor' : '/');
      router.refresh();
    } catch {
      setError('Passkey setup did not complete. Try again or set up an authenticator.');
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <Button type="button" onClick={enroll} disabled={busy}><T value={ui.passkeys.passkeyloginenrollment.setUpAPasskeyInstead} /></Button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
