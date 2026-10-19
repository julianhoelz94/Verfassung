'use client';

import { T, useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/ui';
import { createPasskey } from '../../lib/webauthn';
import { finishPasskeyLoginEnrollment, startPasskeyLoginEnrollment } from './actions';

export function PasskeyLoginEnrollment() {
  const t = useTranslation();
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
      setError(t(ui.state.passkeyEnrollmentFailed));
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <Button type="button" onClick={enroll} disabled={busy}><T value={ui.passkeys.passkeyloginenrollment.setUpAPasskeyInstead} /></Button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
