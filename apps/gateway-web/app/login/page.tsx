import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { canVisitEditor } from '../../lib/nav';
import { currentUser } from '../../lib/session';
import { loginAction } from './actions';

type LoginPageProps = {
  searchParams: { error?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await currentUser();
  if (user) {
    redirect(canVisitEditor(user.roles) ? '/editor' : '/');
  }

  return (
    <PageMain>
      <h1>Log in</h1>
      <p className="lede">
        Use a seeded local account. local-editor@example.local can edit, review, and publish. Dedicated
        reviewer and publisher accounts exist for separated duties.
      </p>
      {searchParams.error ? (
        <Alert tone="error">
          <span id="login-error">Invalid email or password.</span>
        </Alert>
      ) : null}
      <Card>
        <form action={loginAction}>
          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            required
            aria-required="true"
            autoComplete="username"
            aria-invalid={searchParams.error ? true : undefined}
            aria-describedby={searchParams.error ? 'login-error' : undefined}
          />
          <Input
            label="Password"
            id="password"
            name="password"
            type="password"
            required
            aria-required="true"
            autoComplete="current-password"
          />
          <Button variant="primary">Sign in</Button>
        </form>
      </Card>
      <p>
        <a href="/reset">Forgot password</a>
      </p>
    </PageMain>
  );
}
