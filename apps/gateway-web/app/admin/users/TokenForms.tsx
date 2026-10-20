'use client';

import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { useFormState } from 'react-dom';
import { Alert, Button, Input } from '../../components/ui';
import { inviteUserAction, issueResetAction, createServiceTokenAction, rotateServiceTokenAction, type TokenRevealState } from '../../account/actions';
import { Stack } from '../../components/layout/Layout';

const initial: TokenRevealState = {};

export function InviteUserForm() {
  const [state, action] = useFormState(inviteUserAction, initial);
  return (
    <>
      {state.token ? (
        <Alert tone="success">
          <T value={ui.admin.users.tokenforms.inviteCreatedIfOutboundMailIsConfigured} />{' '}
          <code>{state.token}</code>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="error"><T value={ui.admin.users.tokenforms.thatAccountActionCouldNotBeCompleted} /></Alert> : null}
      <Stack as="form" action={action}>
        <Input label={<T value={ui.attrs.adminUsersTokenformsInputLabelEmail} />} id="email" name="email" type="email" required />
        <Input label={<T value={ui.attrs.adminUsersTokenformsInputLabelRoles} />} id="roles" name="roles" defaultValue="viewer" />
        <Button variant="primary"><T value={ui.admin.users.tokenforms.sendInvite} /></Button>
      </Stack>
    </>
  );
}

export function IssueResetForm({ userId }: { userId: string }) {
  const [state, action] = useFormState(issueResetAction, initial);
  return (
    <>
      {state.token ? (
        <Alert tone="success">
          <T value={ui.admin.users.tokenforms.resetTokenIssuedIfOutboundMailIs} />{' '}
          <code>{state.token}</code>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="error"><T value={ui.admin.users.tokenforms.thatAccountActionCouldNotBeCompleted} /></Alert> : null}
      <Stack as="form" action={action}>
        <input type="hidden" name="userId" value={userId} />
        <Button><T value={ui.admin.users.tokenforms.issueResetToken} /></Button>
      </Stack>
    </>
  );
}

export function CreateServiceTokenForm() {
  const [state, action] = useFormState(createServiceTokenAction, initial);
  return (
    <>
      {state.token ? (
        <Alert tone="success">
          <T value={ui.admin.users.tokenforms.tokenCreatedCopyItNowItIs} />{" "}<code>{state.token}</code>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="error"><T value={ui.admin.users.tokenforms.thatTokenActionCouldNotBeCompleted} /></Alert> : null}
      <Stack as="form" action={action}>
        <Input label={<T value={ui.attrs.adminUsersTokenformsInputLabelName} />} id="token-name" name="name" required />
        <Input
          label={<T value={ui.attrs.adminUsersTokenformsInputLabelScopes} />}
          id="token-scopes"
          name="scopes"
          defaultValue="catalog:write,content:write"
          required
        />
        <Button variant="primary"><T value={ui.admin.users.tokenforms.issueToken} /></Button>
      </Stack>
    </>
  );
}

export function RotateServiceTokenForm({ tokenId }: { tokenId: string }) {
  const [state, action] = useFormState(rotateServiceTokenAction, initial);
  return (
    <>
      {state.token ? (
        <Alert tone="success">
          <T value={ui.admin.users.tokenforms.tokenRotatedCopyItNowItIs} />{" "}<code>{state.token}</code>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="error"><T value={ui.admin.users.tokenforms.thatTokenActionCouldNotBeCompleted} /></Alert> : null}
      <Stack as="form" action={action}>
        <input type="hidden" name="tokenId" value={tokenId} />
        <Button><T value={ui.admin.users.tokenforms.rotate} /></Button>
      </Stack>
    </>
  );
}
