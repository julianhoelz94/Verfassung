import { redirect } from 'next/navigation';
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
      <p>
        Use a seeded local account. local-editor@example.local can edit, review, and publish. Dedicated
        reviewer and publisher accounts exist for separated duties.
      </p>
      {searchParams.error ? (
        <p id="login-error" role="alert" aria-live="assertive">
          Invalid email or password.
        </p>
      ) : null}
      <form action={loginAction}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            required
            aria-required="true"
            autoComplete="username"
            style={{ width: '100%', padding: 8 }}
            aria-invalid={searchParams.error ? true : undefined}
            aria-describedby={searchParams.error ? 'login-error' : undefined}
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            required
            aria-required="true"
            autoComplete="current-password"
            style={{ width: '100%', padding: 8 }}
          />
        </p>
        <button type="submit">Sign in</button>
      </form>
    </PageMain>
  );
}
