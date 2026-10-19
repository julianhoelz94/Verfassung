'use client';

import { useRef, useState } from 'react';
import { ui } from '../../../lib/messages';
import { reviewUi } from '../../../lib/ui-review-messages';
import { Button, Input } from '../../components/ui';
import { T } from '../../components/TranslationProvider';
import { completeMfaAction } from '../actions';
import { NavigatingActionForm } from '../../components/NavigatingActionForm';

export function MfaLoginForm({ next, recovery = false }: { next?: string; recovery?: boolean }) {
  const [useRecovery, setUseRecovery] = useState(recovery);
  const root = useRef<HTMLDivElement>(null);
  function changeMethod() {
    setUseRecovery(value => !value);
    requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus());
  }
  return <div ref={root}><NavigatingActionForm action={completeMfaAction} className="mfa-form">
    {next ? <input type="hidden" name="next" value={next} /> : null}
    <input type="hidden" name="method" value={useRecovery ? 'recovery' : 'authenticator'} />
    <p id="mfa-method-hint"><T value={useRecovery ? reviewUi.recoveryHint : reviewUi.codeHint} /></p>
    {useRecovery ? <Input key="recovery" label={<T value={ui.attrs.loginMfaPageInputLabelRecovery} />} id="recoveryCode" name="recoveryCode" autoComplete="off" aria-describedby="mfa-method-hint" required /> :
      <Input key="authenticator" label={<T value={ui.attrs.loginMfaPageInputLabelAuthenticator} />} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="mfa-method-hint" required />}
    <div className="form-actions">
      <Button variant="primary"><T value={ui.login.mfa.page.continue} /></Button>
      <Button type="button" variant="ghost" onClick={changeMethod}><T value={useRecovery ? reviewUi.authenticator : reviewUi.recovery} /></Button>
    </div>
  </NavigatingActionForm></div>;
}
