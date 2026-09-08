'use client';

import { useFormState } from 'react-dom';
import { Alert, Button, Input } from '../components/ui';
import { confirmEnrollAction, type EnrollConfirmState } from '../login/actions';
import { confirmAccountMfaAction, regenerateRecoveryAction, type RecoveryRevealState } from './actions';

const initial: RecoveryRevealState = {};

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <Alert tone="success">
      Store these recovery codes now; they are shown only once.{' '}
      {codes.map((code) => (
        <code key={code}>{code} </code>
      ))}
    </Alert>
  );
}

const failed = <Alert tone="error">Authenticator action failed. Check the code and try again.</Alert>;

export function ConfirmEnrollForm({ challengeToken }: { challengeToken: string }) {
  const [state, action] = useFormState(confirmAccountMfaAction, initial);
  if (state.recoveryCodes) {
    return (
      <>
        <RecoveryCodes codes={state.recoveryCodes} />
        <p>
          <a href="/account">Back to account</a>
        </p>
      </>
    );
  }
  return (
    <>
      {state.error ? failed : null}
      <form action={action}>
        <input type="hidden" name="challengeToken" value={challengeToken} />
        <Input label="Authenticator code" id="enrollCode" name="code" inputMode="numeric" required />
        <Button variant="primary">Confirm enrollment</Button>
      </form>
    </>
  );
}

export function RegenerateRecoveryForm() {
  const [state, action] = useFormState(regenerateRecoveryAction, initial);
  return (
    <>
      {state.recoveryCodes ? <RecoveryCodes codes={state.recoveryCodes} /> : null}
      {state.error ? failed : null}
      <form action={action}>
        <Input label="Authenticator code" id="recoveryRotateCode" name="code" inputMode="numeric" required />
        <Button>Replace recovery codes</Button>
      </form>
    </>
  );
}

const initialEnroll: EnrollConfirmState = {};

export function LoginEnrollForm() {
  const [state, action] = useFormState(confirmEnrollAction, initialEnroll);
  if (state.recoveryCodes) {
    return (
      <>
        <RecoveryCodes codes={state.recoveryCodes} />
        <p>
          <a href={state.continueTo ?? '/'}>Continue</a>
        </p>
      </>
    );
  }
  return (
    <>
      {state.error ? <Alert tone="error">That code could not be verified.</Alert> : null}
      <form action={action}>
        <Input
          label="Authenticator code"
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
        <Button variant="primary">Confirm enrollment</Button>
      </form>
    </>
  );
}
