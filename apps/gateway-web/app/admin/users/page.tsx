import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Badge, Button, Card, DataList, DataRow, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { disableUserAction, enableUserAction, updateRolesAction } from '../../account/actions';
import { InviteUserForm, IssueResetForm } from './TokenForms';
import { requireAdminPage } from '../../../lib/admin';
import { requestUsers, type AdminUser } from '../../../lib/identity-client';
import { SESSION_COOKIE } from '../../../lib/session';

type AdminUsersPageProps = {
  searchParams: { error?: string };
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

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  if (!(await requireAdminPage())) {
    return <AdminForbidden title="Users" />;
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  let users: AdminUser[] = [];
  let usersError = false;
  if (token) {
    try {
      users = await requestUsers(token);
    } catch {
      usersError = true;
    }
  }
  return (
    <PageMain className="wide">
      <PageHeader title="Users" meta="Invite accounts, set roles, and revoke access." />
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
      <DataList columns={4}>
        {users.map((item) => (
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
                  ) : item.enabled ? (
                    <div className="form-row">
                      <form action={disableUserAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <Button>Disable</Button>
                      </form>
                      <IssueResetForm userId={item.id} />
                      <form action={updateRolesAction}>
                        <input type="hidden" name="userId" value={item.id} />
                        <Input
                          label="Roles (comma-separated)"
                          id={`roles-${item.id}`}
                          name="roles"
                          defaultValue={item.roles.join(', ')}
                        />
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
    </PageMain>
  );
}
