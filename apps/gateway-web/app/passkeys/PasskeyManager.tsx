'use client';

import { Stack } from '../components/layout/Layout';

import { T, useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '../components/ui';
import { type PasskeyInfo } from '../../lib/identity-client';
import { createPasskey } from '../../lib/webauthn';
import { finishPasskeyEnrollment, revokePasskey, startPasskeyEnrollment } from './actions';

export function PasskeyManager({ passkeys }: { passkeys: PasskeyInfo[] }) {
  const t = useTranslation();
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function enroll() {
    setBusy(true);
    setMessage('');
    try {
      const started = await startPasskeyEnrollment(password);
      const credential = await createPasskey(started.options);
      await finishPasskeyEnrollment(started.challengeId, credential, label);
      setPassword('');
      setLabel('');
      setMessage(t(ui.state.passkeyAdded));
      router.refresh();
    } catch {
      setMessage(t(ui.state.passkeySetupFailed));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setMessage('');
    try {
      await revokePasskey(id, password);
      setPassword('');
      setMessage(t(ui.state.passkeyRemoved));
      router.refresh();
    } catch {
      setMessage(t(ui.state.passkeyRemovalFailed));
    } finally {
      setBusy(false);
    }
  }
  return <Stack as="section" className="account-section" aria-labelledby="passkeys-title">
    <h2 id="passkeys-title"><T value={ui.passkeys.passkeymanager.passkeys} /></h2>
    <p><T value={ui.passkeys.passkeymanager.useADevicePasskeyToSignIn} /></p>
    {passkeys.length ? <ul>{passkeys.map((key) => <li key={key.id}>
      {key.label} <T value={ui.passkeys.passkeymanager.added} />{" "}{new Date(key.createdAt).toLocaleDateString()}
      <Button type="button" onClick={() => revoke(key.id)} disabled={busy || !password}><T value={ui.passkeys.passkeymanager.remove} /></Button>
    </li>)}</ul> : <p><T value={ui.passkeys.passkeymanager.noPasskeysYet} /></p>}
    <Input label={<T value={ui.attrs.passkeysPasskeymanagerInputLabelPasskeyName} />} id="passkey-name" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t(ui.accessibility.myLaptop)} />
    <Input label={<T value={ui.attrs.passkeysPasskeymanagerInputLabelCurrentPassword} />} id="passkey-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
    <Button type="button" variant="primary" onClick={enroll} disabled={busy || !password}><T value={ui.passkeys.passkeymanager.addPasskey} /></Button>
    {message ? <p role="status">{message}</p> : null}
  </Stack>;
}
