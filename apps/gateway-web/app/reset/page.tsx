import { Alert, Button, Card, Input } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { confirmResetAction, requestResetAction } from '../account/actions';

type ResetPageProps = {
  searchParams: { token?: string; sent?: string; error?: string };
};

export default function ResetPage({ searchParams }: ResetPageProps) {
  return (
    <PageMain>
      <h1>Reset password</h1>
      <p className="lede">
        Enter your email to request a reset. The response is the same whether or not that account exists.
        In this local stack, an administrator can also issue a one-time token from Users and send it to you.
      </p>
      {searchParams.sent ? <Alert>If that account exists, a reset token was issued for an administrator to deliver.</Alert> : null}
      {searchParams.error ? <Alert tone="error">That reset link is invalid or the password does not meet policy.</Alert> : null}
      <Card>
        <form action={requestResetAction}>
          <Input label="Email" id="reset-email" name="email" type="email" autoComplete="username" required />
          <Button variant="primary">Request reset</Button>
        </form>
      </Card>
      <Card>
        <h2>Confirm reset</h2>
        <form action={confirmResetAction}>
          <Input label="Reset token" id="token" name="token" defaultValue={searchParams.token ?? ''} required />
          <Input
            label="New password"
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Button variant="primary">Set new password</Button>
        </form>
      </Card>
    </PageMain>
  );
}
