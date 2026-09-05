import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { disableUserAction, enableUserAction, inviteUserAction, issueResetAction } from '../../account/actions';
import { requestUsers } from '../../../lib/identity-client';
import { canVisitAdmin } from '../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';

type AdminUsersPageProps = {
  searchParams: { invited?: string; reset?: string; error?: string };
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitAdmin(user.roles)) {
    return (
      <PageMain>
        <h1>Users</h1>
        <Alert tone="error">Administrator role required.</Alert>
      </PageMain>
    );
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  const users = token ? await requestUsers(token).catch(() => []) : [];
  return (
    <PageMain>
      <h1>Users</h1>
      {searchParams.error ? <Alert tone="error">That account action could not be completed.</Alert> : null}
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
