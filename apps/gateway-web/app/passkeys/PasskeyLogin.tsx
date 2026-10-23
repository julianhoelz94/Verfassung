'use client';

import { T, useTranslation } from '../components/TranslationProvider';
import { canVisitEditor } from '../../lib/nav';
import { ui } from '../../lib/messages';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/ui';
import { getPasskey } from '../../lib/webauthn';
import { finishPasskeyLogin, startPasskeyLogin, startPasskeyStepUp, finishPasskeyStepUp } from './actions';
import { safeLoginReturnTo, safeReturnTo } from '../../lib/return-to';

export function PasskeyLogin({ next, stepUp = false }: { next?: string; stepUp?: boolean } = {}) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const started = stepUp ? await startPasskeyStepUp() : await startPasskeyLogin();
      const credential = await getPasskey(started.options);
      if (stepUp) {
        await finishPasskeyStepUp(started.challengeId, credential);
        router.push(safeReturnTo(next ?? '/account', '/account'));
      } else {
        const result = await finishPasskeyLogin(started.challengeId, credential);
        router.push(safeLoginReturnTo(next, canVisitEditor(result.roles) ? '/editor' : '/'));
      }
      router.refresh();
    } catch {
      setError(t(ui.state.passkeySignInFailed));
    } finally {
      setBusy(false);
    }
  }
  return <div>
    <Button type="button" onClick={signIn} disabled={busy}><T value={ui.passkeys.passkeylogin.useAPasskey} /></Button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
