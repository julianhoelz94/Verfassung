import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { Alert, Button, Card, Input } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { disableUserAction, enableUserAction, inviteUserAction, issueResetAction, updateRolesAction } from '../../account/actions';
import { requireAdminPage } from '../../../lib/admin';
import { requestUsers, type AdminUser } from '../../../lib/identity-client';
import { SESSION_COOKIE } from '../../../lib/session';

type AdminUsersPageProps = {
  searchParams: { invited?: string; reset?: string; error?: string };
};

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
    <PageMain>
      <h1>Users</h1>
      {searchParams.error === 'forbidden' ? (
        <Alert tone="error">Administrator role required.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">That account action could not be completed.</Alert>
      ) : null}
      {usersError ? <Alert tone="error">The user list could not be loaded.</Alert> : null}
      {searchParams.invited ? (
        <Alert tone="success">Invite created. One-time token: {searchParams.invited}</Alert>
      ) : null}
      {searchParams.reset ? (
        <Alert tone="success">Reset token issued. One-time token: {searchParams.reset}</Alert>
      ) : null}
      <Card>
        <h2>Invite</h2>
        <form action={inviteUserAction}>
          <Input label="Email" id="email" name="email" type="email" required />
          <Input label="Roles (comma-separated)" id="roles" name="roles" defaultValue="viewer" />
          <Button variant="primary">Send invite</Button>
        </form>
      </Card>
      <ul className="search-hits">
        {users.map((item) => (
          <li key={item.id} className="card">
            <p>
              <strong>{item.email}</strong> · {item.status} · {item.roles.join(', ')}
            </p>
            {item.status === 'invited' ? (
              <p className="muted">Waiting for the invite to be accepted. Invite again to issue a new token.</p>
            ) : item.enabled ? (
              <div className="form-row">
                <form action={disableUserAction}>
                  <input type="hidden" name="userId" value={item.id} />
                  <Button>Disable</Button>
                </form>
                <form action={issueResetAction}>
                  <input type="hidden" name="userId" value={item.id} />
                  <Button>Issue reset token</Button>
                </form>
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
            )}
          </li>
        ))}
      </ul>
    </PageMain>
  );
}
