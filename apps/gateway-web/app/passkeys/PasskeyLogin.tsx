'use client';

import { T, useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/ui';
import { getPasskey } from '../../lib/webauthn';
import { finishPasskeyLogin, startPasskeyLogin } from './actions';

export function PasskeyLogin() {
  const t = useTranslation();
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
