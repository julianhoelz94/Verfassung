import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/session';
import { loginAction } from './actions';

type LoginPageProps = {
  searchParams: { error?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await currentUser();
  if (user) {
    redirect('/editor');
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Editor login</h1>
      <p>Use a seeded local account (for example local-editor@example.local).</p>
      {searchParams.error ? <p>Invalid email or password.</p> : null}
      <form action={loginAction}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            style={{ width: '100%', padding: 8 }}
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
            autoComplete="current-password"
            style={{ width: '100%', padding: 8 }}
          />
        </p>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
