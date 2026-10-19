'use client';

import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { useFormState } from 'react-dom';
import { useState } from 'react';
import { Alert, Button, Input } from '../components/ui';
import { confirmEnrollAction, type EnrollConfirmState } from '../login/actions';
import { confirmAccountMfaAction, regenerateRecoveryAction, startMfaEnrollAction, type RecoveryRevealState } from './actions';
import { Disclosure } from '../components/Disclosure';
import { reviewUi } from '../../lib/ui-review-messages';

export function StartMfaEnrollForm() {
  const [pending, setPending] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    if (pending) return;
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setPending(true);
    try {
      const started = await startMfaEnrollAction(password);
      window.location.assign(started ? '/account?enroll=1' : '/account?error=mfa');
    } catch {
      window.location.assign('/account?error=mfa');
    }
  }}><Input label={<T value={ui.attrs.loginPageInputLabelPassword} />} id="mfaPassword" name="password" type="password" autoComplete="current-password" required /><Button variant="primary" disabled={pending}><T value={ui.account.page.enrollAuthenticator} /></Button></form>;
}

const initial: RecoveryRevealState = {};

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="recovery-codes" role="status">
      <p><T value={ui.account.mfaforms.storeTheseRecoveryCodesNowTheyAre} /></p>
      <ul>{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
    </div>
  );
}

const failed = <Alert tone="error"><T value={ui.account.mfaforms.authenticatorActionFailedCheckTheCodeAnd} /></Alert>;

export function ConfirmEnrollForm({ challengeToken }: { challengeToken: string }) {
  const [state, action] = useFormState(confirmAccountMfaAction, initial);
  if (state.recoveryCodes) {
    return (
      <>
        <RecoveryCodes codes={state.recoveryCodes} />
        <p>
          <a href="/account"><T value={ui.account.mfaforms.backToAccount} /></a>
        </p>
      </>
    );
  }
  return (
    <>
      {state.error ? failed : null}
      <form action={action}>
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <Input label={<T value={ui.attrs.accountMfaformsInputLabelAuthenticatorCode} />} id="enrollCode" name="code" inputMode="numeric" required />
        <Button variant="primary"><T value={ui.account.mfaforms.confirmEnrollment} /></Button>
      </form>
    </>
  );
}

export function RegenerateRecoveryForm() {
  const [state, action] = useFormState(regenerateRecoveryAction, initial);
  return (
    <>
      {state.recoveryCodes ? <RecoveryCodes codes={state.recoveryCodes} /> : null}
      <Disclosure summary={<T value={reviewUi.recoveryManage} />} open={Boolean(state.error)}>
      <p><T value={reviewUi.recoveryReplaceHint} /></p>
      {state.error ? failed : null}
      <form action={action}>
        <Input label={<T value={ui.attrs.accountMfaformsInputLabelAuthenticatorCode} />} id="recoveryRotateCode" name="code" inputMode="numeric" required />
        <Button><T value={ui.account.mfaforms.replaceRecoveryCodes} /></Button>
      </form>
      </Disclosure>
    </>
  );
}

const initialEnroll: EnrollConfirmState = {};

export function LoginEnrollForm({ next }: { next?: string } = {}) {
  const [state, setState] = useState<EnrollConfirmState>(initialEnroll);
  const [pending, setPending] = useState(false);
  if (state.recoveryCodes) {
    return (
      <>
        <RecoveryCodes codes={state.recoveryCodes} />
        <p>
          <a href={state.continueTo ?? '/'}><T value={ui.account.mfaforms.continue} /></a>
        </p>
      </>
    );
  }
  return (
    <>
      {state.error ? <Alert tone="error"><T value={ui.account.mfaforms.thatCodeCouldNotBeVerified} /></Alert> : null}
      <form aria-busy={pending} onSubmit={async event => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        setPending(true);
        try { setState(await confirmEnrollAction(initialEnroll, data)); }
        catch { setState({ error: true }); }
        finally { setPending(false); }
      }}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Input
          label={<T value={ui.attrs.accountMfaformsInputLabelAuthenticatorCode} />}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
        <Button variant="primary" disabled={pending}><T value={ui.account.mfaforms.confirmEnrollment} /></Button>
      </form>
    </>
  );
}
