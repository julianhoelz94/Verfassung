import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { canVisitEditor } from '../../lib/nav';
import { currentUser } from '../../lib/session';
import { loginAction } from './actions';

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

/** Seed-account hint is shown only while identity seeding is on (never in production). */
function seedHintEnabled(): boolean {
  return (process.env.IDENTITY_SEED_MODE ?? 'off') !== 'off';
}

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (user) {
    redirect(canVisitEditor(user.roles) ? '/editor' : '/');
  }

  return (
    <PageMain>
      <PageHeader
        title="Log in"
        meta={
          seedHintEnabled() ? (
            <>
              Use a seeded local account. local-editor@example.local can edit, review, and publish. Dedicated
              reviewer and publisher accounts exist for separated duties. Seeded admin and publisher accounts use the
              authenticator secret from <code>IDENTITY_SEED_TOTP_SECRET</code> in your <code>env/</code> profile.
            </>
          ) : (
            'Sign in with your editorial account.'
          )
        }
      />
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
