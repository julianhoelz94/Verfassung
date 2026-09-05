import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { currentUser } from '../../lib/session';
import { changePasswordAction } from './actions';

type AccountPageProps = {
  searchParams: { error?: string; saved?: string };
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  return (
    <PageMain>
      <h1>Account</h1>
      <p className="lede">Signed in as {user.email}.</p>
      {searchParams.error ? <Alert tone="error">Password could not be changed. Check the current password and policy.</Alert> : null}
      {searchParams.saved ? <Alert tone="success">Password updated.</Alert> : null}
      <Card>
        <h2>Change password</h2>
        <form action={changePasswordAction}>
          <Input
            label="Current password"
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Input
            label="New password"
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Button variant="primary">Update password</Button>
        </form>
      </Card>
    </PageMain>
  );
}
