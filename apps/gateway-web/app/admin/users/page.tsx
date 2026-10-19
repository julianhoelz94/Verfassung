import { T } from '../../components/TranslationProvider';
import { RoleList } from '../../components/SignedInSummary';
import { statusMessage, roleMessage } from '../../../lib/ui-labels';
import { ui } from '../../../lib/messages';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Badge, Button, Card, DataList, DataRow, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { disableUserAction, enableUserAction, updateRolesAction, revokeServiceTokenAction } from '../../account/actions';
import { InviteUserForm, IssueResetForm, CreateServiceTokenForm, RotateServiceTokenForm } from './TokenForms';
import { requireAdminPage } from '../../../lib/admin';
import { requestUsers, requestServiceTokens, type AdminUser, type ServiceToken } from '../../../lib/identity-client';
import { FormattedDate } from '../../../lib/format-date';
import { SESSION_COOKIE } from '../../../lib/session';

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
  if (!(await requireAdminPage())) {
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
    <PageMain className="wide">
      <PageHeader title={<T value={ui.attrs.adminUsersPagePageHeaderTitleUsers} />} meta={<T value={ui.attrs.adminUsersPagePageHeaderMetaInvite} />} />
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
        <form method="get" action="/admin/users" className="form-row">
          <Input label={<T value={ui.attrs.adminUsersPageInputLabelSearch} />} id="user-search" name="q" type="search" defaultValue={searchParams.q ?? ''} />
          <label><T value={ui.admin.users.page.status} />{" "}<select name="status" defaultValue={searchParams.status ?? ''}>
            <option value=""><T value={ui.admin.users.page.all} /></option><option value="active"><T value={ui.admin.users.page.active} /></option><option value="pending_confirmation"><T value={ui.admin.users.page.pendingConfirmation} /></option><option value="invited"><T value={ui.admin.users.page.invited} /></option><option value="disabled"><T value={ui.admin.users.page.disabled} /></option>
          </select></label>
          <label><T value={ui.admin.users.page.role} />{" "}<select name="role" defaultValue={searchParams.role ?? ''}>
            <option value=""><T value={ui.admin.users.page.all} /></option><option value="viewer"><T value={ui.admin.users.page.viewer} /></option><option value="editor"><T value={ui.admin.users.page.editor} /></option><option value="reviewer"><T value={ui.admin.users.page.reviewer} /></option><option value="publisher"><T value={ui.admin.users.page.publisher} /></option><option value="admin"><T value={ui.admin.users.page.admin} /></option>
          </select></label>
          <Button><T value={ui.admin.users.page.search} /></Button>
        </form>
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
              { label: <T value={ui.remainingStatus.roles} />, value: <RoleList roles={item.roles} /> },
              {
                label: <T value={ui.remainingStatus.actions} />,
                value:
                  item.status === 'invited' ? (
                    <span className="muted"><T value={ui.admin.users.page.waitingForTheInviteToBeAccepted} /></span>
                  ) : item.status === 'pending_confirmation' ? (
                    <span className="muted"><T value={ui.admin.users.page.waitingForEmailConfirmation} /></span>
                  ) : item.enabled ? (
                    <div className="form-row">
                      <form action={disableUserAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <Button><T value={ui.admin.users.page.disable} /></Button>
                      </form>
                      <IssueResetForm userId={item.id} />
                      <form action={updateRolesAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <fieldset>
                          <legend><T value={ui.admin.users.page.roles} /></legend>
                          {(['viewer', 'editor', 'reviewer', 'publisher', 'admin'] as const).map((role) =>
                            <label key={role} className="form-row">
                              <input type="checkbox" name="role" value={role} defaultChecked={item.roles.includes(role)} /> <T value={roleMessage(role)} />
                            </label>
                          )}
                        </fieldset>
                        <Button><T value={ui.admin.users.page.updateRoles} /></Button>
                      </form>
                    </div>
                  ) : (
                    <form action={enableUserAction}>
                      <input type="hidden" name="userId" value={item.id} />
                      <Button variant="primary"><T value={ui.admin.users.page.activate} /></Button>
                    </form>
                  ),
              },
            ]}
          />
        ))}
      </DataList>
      <Card>
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
                  <div className="form-row">
                    <RotateServiceTokenForm tokenId={item.id} />
                    <form action={revokeServiceTokenAction}>
                      <input type="hidden" name="tokenId" value={item.id} />
                      <Button><T value={ui.admin.users.page.revoke} /></Button>
                    </form>
                  </div>
                ),
              },
            ]}
          />
        ))}
      </DataList>
    </PageMain>
  );
}
