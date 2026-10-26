'use client';

import { safeLoginReturnTo } from '../../lib/return-to';
import { T, useTranslation } from '../components/TranslationProvider';
import { canVisitEditor } from '../../lib/nav';
import { ui } from '../../lib/messages';
import { useState } from 'react';
import { Button } from '../components/ui';
import { createPasskey } from '../../lib/webauthn';
import { finishPasskeyLoginEnrollment, startPasskeyLoginEnrollment } from './actions';

export function PasskeyLoginEnrollment({ next }: { next?: string } = {}) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const started = await startPasskeyLoginEnrollment();
      const credential = await createPasskey(started.options);
      const result = await finishPasskeyLoginEnrollment(started.challengeId, credential);
      window.location.assign(safeLoginReturnTo(next, canVisitEditor(result.roles) ? '/editor' : '/'));
    } catch {
      setError(t(ui.state.passkeyEnrollmentFailed));
      setBusy(false);
    }
  }

  return <div>
    <Button type="button" onClick={enroll} disabled={busy}><T value={ui.passkeys.passkeyloginenrollment.setUpAPasskeyInstead} /></Button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
