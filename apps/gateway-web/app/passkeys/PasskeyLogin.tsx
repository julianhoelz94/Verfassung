'use client';

import { T, useTranslation } from '../components/TranslationProvider';
import { canVisitEditor } from '../../lib/nav';
import { ui } from '../../lib/messages';
import { useState } from 'react';
import { Button } from '../components/ui';
import { getPasskey } from '../../lib/webauthn';
import { finishPasskeyLogin, startPasskeyLogin, startPasskeyStepUp, finishPasskeyStepUp } from './actions';
import { safeLoginReturnTo, safeReturnTo } from '../../lib/return-to';

export function PasskeyLogin({ next, stepUp = false }: { next?: string; stepUp?: boolean } = {}) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const started = stepUp ? await startPasskeyStepUp() : await startPasskeyLogin();
      const credential = await getPasskey(started.options);
      let destination: string;
      if (stepUp) {
        await finishPasskeyStepUp(started.challengeId, credential);
        destination = safeReturnTo(next ?? '/account', '/account');
      } else {
        const result = await finishPasskeyLogin(started.challengeId, credential);
        destination = safeLoginReturnTo(next, canVisitEditor(result.roles) ? '/editor' : '/');
      }
      // Read the confirmed session on arrival; refreshing the old route can cancel a queued push.
      window.location.assign(destination);
    } catch {
      setError(t(ui.state.passkeySignInFailed));
      setBusy(false);
    }
  }
  return <div>
    <Button type="button" onClick={signIn} disabled={busy}><T value={ui.passkeys.passkeylogin.useAPasskey} /></Button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
