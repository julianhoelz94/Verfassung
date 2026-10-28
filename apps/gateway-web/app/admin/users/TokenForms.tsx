'use client';

import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { useActionState } from 'react';
import { Alert, Button, Input } from '../../components/ui';
import { inviteUserAction, issueResetAction, createServiceTokenAction, rotateServiceTokenAction, type TokenRevealState } from '../../account/actions';
import { Stack } from '../../components/layout/Layout';
import { RoleFields } from './RoleFields';

const initial: TokenRevealState = {};

export function InviteUserForm() {
  const [state, action] = useActionState(inviteUserAction, initial);
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
        <RoleFields roles={['viewer']} />
        <Button variant="primary"><T value={ui.admin.users.tokenforms.sendInvite} /></Button>
      </Stack>
    </>
  );
}

export function IssueResetForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(issueResetAction, initial);
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
  const [state, action] = useActionState(createServiceTokenAction, initial);
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
  const [state, action] = useActionState(rotateServiceTokenAction, initial);
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
