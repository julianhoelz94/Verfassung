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
              reviewer and publisher accounts exist for separated duties. Editor, admin, and publisher accounts need
              a current six-digit code from an authenticator app configured with <code>IDENTITY_SEED_TOTP_SECRET</code>.
              If that setting is absent, use <code>CAATLASMFASEED22</code> as the authenticator secret.
              Seeding creates missing users only; changing a password in the env file does not update an existing user.
            </>
          ) : (
            'Sign in with your editorial account.'
          )
        }
      />
      {searchParams.error ? (
        <Alert tone="error">
          <span id="login-error">
            {searchParams.error === 'unavailable'
              ? 'Sign-in is temporarily unavailable. Check that the local stack is running.'
              : searchParams.error === 'rate-limit'
                ? 'Too many sign-in attempts. Wait a moment and try again.'
                : 'Invalid email or password.'}
          </span>
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
