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
    return <AdminForbidden title="Users" />;
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
      <PageHeader title="Users" meta="Invite accounts, set roles, rotate machine tokens, and revoke access." />
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error">Administrator role required.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">That account action could not be completed.</Alert>
      ) : null}
      {usersError ? <Alert tone="error">The user list could not be loaded.</Alert> : null}
      <Card>
        <h2 className="card-title">Invite</h2>
        <InviteUserForm />
      </Card>
      <Card>
        <h2 className="card-title">Find users</h2>
        <form method="get" action="/admin/users" className="form-row">
          <Input label="Search email" id="user-search" name="q" type="search" defaultValue={searchParams.q ?? ''} />
          <label>Status <select name="status" defaultValue={searchParams.status ?? ''}>
            <option value="">All</option><option value="active">Active</option><option value="pending_confirmation">Pending confirmation</option><option value="invited">Invited</option><option value="disabled">Disabled</option>
          </select></label>
          <label>Role <select name="role" defaultValue={searchParams.role ?? ''}>
            <option value="">All</option><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="reviewer">Reviewer</option><option value="publisher">Publisher</option><option value="admin">Admin</option>
          </select></label>
          <Button>Search</Button>
        </form>
        <p className="muted">Showing {shownUsers.length} of {users.length} users.</p>
      </Card>
      {shownUsers.length === 0 && !usersError ? <p>No users match these filters.</p> : null}
      <DataList columns={4}>
        {shownUsers.map((item) => (
          <DataRow
            key={item.id}
            cells={[
              { label: 'Email', value: item.email },
              {
                label: 'Status',
                value: <Badge tone={statusTone(item)}>{item.status}</Badge>,
              },
              { label: 'Roles', value: item.roles.join(', ') },
              {
                label: 'Actions',
                value:
                  item.status === 'invited' ? (
                    <span className="muted">Waiting for the invite to be accepted.</span>
                  ) : item.status === 'pending_confirmation' ? (
                    <span className="muted">Waiting for email confirmation.</span>
                  ) : item.enabled ? (
                    <div className="form-row">
                      <form action={disableUserAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <Button>Disable</Button>
                      </form>
                      <IssueResetForm userId={item.id} />
                      <form action={updateRolesAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <fieldset>
                          <legend>Roles</legend>
                          {(['viewer', 'editor', 'reviewer', 'publisher', 'admin'] as const).map((role) =>
                            <label key={role} className="form-row">
                              <input type="checkbox" name="role" value={role} defaultChecked={item.roles.includes(role)} /> {role}
                            </label>
                          )}
                        </fieldset>
                        <Button>Update roles</Button>
                      </form>
                    </div>
                  ) : (
                    <form action={enableUserAction}>
                      <input type="hidden" name="userId" value={item.id} />
                      <Button variant="primary">Activate</Button>
                    </form>
                  ),
              },
            ]}
          />
        ))}
      </DataList>
      <Card>
        <h2 className="card-title">Service tokens</h2>
        <p className="muted">Machine tokens expire after 90 days unless rotated. The plaintext secret is shown once.</p>
        <CreateServiceTokenForm />
      </Card>
      <DataList columns={4}>
        {tokens.map((item) => (
          <DataRow
            key={item.id}
            cells={[
              { label: 'Name', value: item.name },
              { label: 'Scopes', value: item.scopes.join(', ') },
              {
                label: 'Expires',
                value: item.revokedAt ? (
                  <Badge tone="removed">Revoked</Badge>
                ) : (
                  <FormattedDate value={item.expiresAt} />
                ),
              },
              {
                label: 'Actions',
                value: item.revokedAt ? (
                  <span className="muted">Revoked</span>
                ) : (
                  <div className="form-row">
                    <RotateServiceTokenForm tokenId={item.id} />
                    <form action={revokeServiceTokenAction}>
                      <input type="hidden" name="tokenId" value={item.id} />
                      <Button>Revoke</Button>
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
