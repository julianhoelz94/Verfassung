'use client';

import { useFormState } from 'react-dom';
import { Alert, Button, Input } from '../../components/ui';
import { inviteUserAction, issueResetAction, type TokenRevealState } from '../../account/actions';

const initial: TokenRevealState = {};

export function InviteUserForm() {
  const [state, action] = useFormState(inviteUserAction, initial);
  return (
    <>
      {state.token ? (
        <Alert tone="success">
          Invite created. One-time token: <code>{state.token}</code>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="error">That account action could not be completed.</Alert> : null}
      <form action={action}>
        <Input label="Email" id="email" name="email" type="email" required />
        <Input label="Roles (comma-separated)" id="roles" name="roles" defaultValue="viewer" />
        <Button variant="primary">Send invite</Button>
      </form>
    </>
  );
}

export function IssueResetForm({ userId }: { userId: string }) {
  const [state, action] = useFormState(issueResetAction, initial);
  return (
    <>
      {state.token ? (
        <Alert tone="success">
          Reset token issued. One-time token: <code>{state.token}</code>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="error">That account action could not be completed.</Alert> : null}
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <Button>Issue reset token</Button>
      </form>
    </>
  );
}
