import { T } from '../../components/TranslationProvider';
import { RoleEditor } from './RoleEditor';
import { statusMessage, roleMessage } from '../../../lib/ui-labels';
import { ui } from '../../../lib/messages';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Badge, Button, Card, DataList, DataRow, Input, PageHeader } from '../../components/ui';
import { CollectionPage } from '../../components/layout/templates';
import { disableUserAction, enableUserAction, revokeServiceTokenAction } from '../../account/actions';
import { InviteUserForm, IssueResetForm, CreateServiceTokenForm, RotateServiceTokenForm } from './TokenForms';
import { requireAdminPage } from '../../../lib/admin';
import { requestUsers, requestServiceTokens, type AdminUser, type ServiceToken } from '../../../lib/identity-client';
import { FormattedDate } from '../../../lib/format-date';
import { SESSION_COOKIE } from '../../../lib/session';
import { Inline, Stack } from '../../components/layout/Layout';

type AdminUsersPageProps = {
  searchParams: Promise<{ error?: string; q?: string; status?: string; role?: string }>;
};

function statusTone(user: AdminUser): 'added' | 'removed' | 'info' | 'neutral' {
  if (user.status === 'invited') {
    return 'info';
  }
  if (user.enabled) {
    return 'added';
  }
  return 'removed';
}

export default async function AdminUsersPage(props: AdminUsersPageProps) {
  const searchParams = await props.searchParams;
  if (!(await requireAdminPage('/admin/users', searchParams))) {
    return <AdminForbidden title={ui.forbidden.users} />;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let users: AdminUser[] = [];
  let usersError = false;
  let tokens: ServiceToken[] = [];
  if (token) {
    try {
      users = await requestUsers(token);
    } catch {
      usersError = true;
    }
    try {
      tokens = await requestServiceTokens(token);
    } catch {
      tokens = [];
    }
  }
  const query = (searchParams.q ?? '').trim().toLowerCase();
  const shownUsers = users.filter((user) =>
    (!query || user.email.toLowerCase().includes(query)) &&
    (!searchParams.status || user.status === searchParams.status) &&
    (!searchParams.role || user.roles.includes(searchParams.role))
  );
  return (
    <CollectionPage width="content" className="admin-users-page" header={<PageHeader title={<T value={ui.attrs.adminUsersPagePageHeaderTitleUsers} />} meta={<T value={ui.attrs.adminUsersPagePageHeaderMetaInvite} />} />}>

      {searchParams.error === 'forbidden' ? (
        <Alert tone="error"><T value={ui.admin.users.page.administratorRoleRequired} /></Alert>
      ) : searchParams.error ? (
        <Alert tone="error"><T value={ui.admin.users.page.thatAccountActionCouldNotBeCompleted} /></Alert>
      ) : null}
      {usersError ? <Alert tone="error"><T value={ui.admin.users.page.theUserListCouldNotBeLoaded} /></Alert> : null}
      <Card>
        <h2 className="card-title"><T value={ui.admin.users.page.invite} /></h2>
        <InviteUserForm />
      </Card>
      <Card>
        <h2 className="card-title"><T value={ui.admin.users.page.findUsers} /></h2>
        <Inline align="end" as="form" method="get" action="/admin/users" className="form-row">
          <Input label={<T value={ui.attrs.adminUsersPageInputLabelSearch} />} id="user-search" name="q" type="search" defaultValue={searchParams.q ?? ''} />
          <label><T value={ui.admin.users.page.status} />{" "}<select name="status" defaultValue={searchParams.status ?? ''}>
            <option value=""><T value={ui.admin.users.page.all} /></option><option value="active"><T value={ui.admin.users.page.active} /></option><option value="pending_confirmation"><T value={ui.admin.users.page.pendingConfirmation} /></option><option value="invited"><T value={ui.admin.users.page.invited} /></option><option value="disabled"><T value={ui.admin.users.page.disabled} /></option>
          </select></label>
          <label><T value={ui.admin.users.page.role} />{" "}<select name="role" defaultValue={searchParams.role ?? ''}>
            <option value=""><T value={ui.admin.users.page.all} /></option>{['viewer', 'editor', 'reviewer', 'publisher', 'admin'].map(role => <option key={role} value={role}><T value={roleMessage(role)} /></option>)}
          </select></label>
          <Button><T value={ui.admin.users.page.search} /></Button>
        </Inline>
        <p className="muted"><T value={ui.admin.users.page.showing} />{" "}{shownUsers.length} <T value={ui.admin.users.page.of} />{" "}{users.length} <T value={ui.admin.users.page.users} /></p>
      </Card>
      {shownUsers.length === 0 && !usersError ? <p><T value={ui.admin.users.page.noUsersMatchTheseFilters} /></p> : null}
      <DataList columns={4}>
        {shownUsers.map((item) => (
          <DataRow
            key={item.id}
            cells={[
              { label: <T value={ui.remainingStatus.email} />, value: item.email },
              {
                label: <T value={ui.remainingStatus.status} />,
                value: <Badge tone={statusTone(item)}><T value={statusMessage(item.status)} /></Badge>,
              },
              { label: <T value={ui.remainingStatus.roles} />, value: <div className="role-badges">{item.roles.map(role => <Badge key={role}><T value={roleMessage(role)} /></Badge>)}</div> },
              {
                label: <T value={ui.remainingStatus.actions} />,
                value:
                  item.status === 'invited' ? (
                    <span className="muted"><T value={ui.admin.users.page.waitingForTheInviteToBeAccepted} /></span>
                  ) : item.status === 'pending_confirmation' ? (
                    <span className="muted"><T value={ui.admin.users.page.waitingForEmailConfirmation} /></span>
                  ) : item.enabled ? (
                    <Inline align="end" className="form-row">
                      <Stack as="form" action={disableUserAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <Button><T value={ui.admin.users.page.disable} /></Button>
                      </Stack>
                      <IssueResetForm userId={item.id} />
                      <RoleEditor userId={item.id} roles={item.roles} />
                    </Inline>
                  ) : (
                    <Stack as="form" action={enableUserAction}>
                      <input type="hidden" name="userId" value={item.id} />
                      <Button variant="primary"><T value={ui.admin.users.page.activate} /></Button>
                    </Stack>
                  ),
              },
            ]}
          />
        ))}
      </DataList>
      <Card className="service-token-card">
        <h2 className="card-title"><T value={ui.admin.users.page.serviceTokens} /></h2>
        <p className="muted"><T value={ui.admin.users.page.machineTokensExpireAfter90DaysUnless} /></p>
        <CreateServiceTokenForm />
      </Card>
      <DataList columns={4}>
        {tokens.map((item) => (
          <DataRow
            key={item.id}
            cells={[
              { label: <T value={ui.remainingStatus.name} />, value: item.name },
              { label: <T value={ui.remainingStatus.scopes} />, value: item.scopes.join(', ') },
              {
                label: <T value={ui.remainingStatus.expires} />,
                value: item.revokedAt ? (
                  <Badge tone="removed"><T value={ui.admin.users.page.revoked} /></Badge>
                ) : (
                  <FormattedDate value={item.expiresAt} />
                ),
              },
              {
                label: <T value={ui.remainingStatus.actions} />,
                value: item.revokedAt ? (
                  <span className="muted"><T value={ui.admin.users.page.revoked} /></span>
                ) : (
                  <Inline align="end" className="form-row">
                    <RotateServiceTokenForm tokenId={item.id} />
                    <Stack as="form" action={revokeServiceTokenAction}>
                      <input type="hidden" name="tokenId" value={item.id} />
                      <Button><T value={ui.admin.users.page.revoke} /></Button>
                    </Stack>
                  </Inline>
                ),
              },
            ]}
          />
        ))}
      </DataList>
    </CollectionPage>
  );
}
