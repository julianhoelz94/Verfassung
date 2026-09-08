import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestStartMfaEnroll } from '../../lib/identity-client';
import { SESSION_COOKIE, currentUser, mfaChallengeToken } from '../../lib/session';
import { ConfirmEnrollForm, RegenerateRecoveryForm } from './MfaForms';
import { changePasswordAction, revokeMfaAction, startMfaEnrollAction } from './actions';

type AccountPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    enroll?: string;
    mfaRevoked?: string;
  }>;
};

export default async function AccountPage(props: AccountPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  // The enrollment challenge lives in the httpOnly `ca_mfa_challenge` cookie set by
  // `startMfaEnrollAction`; `?enroll=1` only marks that enrollment was requested.
  const enrollRequested = searchParams.enroll === '1';
  let enrollSecret: string | null = null;
  let enrollChallenge: string | null = enrollRequested ? (await mfaChallengeToken()) ?? null : null;
  if (!user.mfaEnabled && enrollChallenge) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    try {
      const started = await requestStartMfaEnroll(enrollChallenge, token);
      enrollSecret = started.secret;
      enrollChallenge = started.challengeToken;
    } catch {
      enrollSecret = null;
    }
  }
  return (
    <PageMain>
      <PageHeader title="Account" meta={`Signed in as ${user.email}.`} />
      {searchParams.error === 'mfa' ? (
        <Alert tone="error">Authenticator action failed. Check the code and try again.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">Password could not be changed. Check the current password and policy.</Alert>
      ) : null}
      {searchParams.saved ? <Alert tone="success">Password updated.</Alert> : null}
      {searchParams.mfaRevoked ? <Alert tone="success">Authenticator enrollment was revoked.</Alert> : null}
      <Card>
        <h2>Authenticator</h2>
        {user.mfaRequired && !user.mfaEnabled ? (
          <p>Admin and publisher accounts must enroll an authenticator.</p>
        ) : null}
        {user.mfaEnabled ? (
          <>
            <p>Authenticator app is enrolled{user.stepUpFresh ? ' and recently confirmed.' : '.'}</p>
            {user.mfaRequired ? (
              <p className="muted">Authenticator enrollment is required for this account and cannot be revoked.</p>
            ) : (
              <form action={revokeMfaAction}>
                <Input label="Authenticator code" id="revokeCode" name="code" inputMode="numeric" required />
                <Button>Revoke authenticator</Button>
              </form>
            )}
            <RegenerateRecoveryForm />
          </>
        ) : enrollSecret && enrollChallenge ? (
          <>
            <p>
              Authenticator secret: <code>{enrollSecret}</code>
            </p>
            <ConfirmEnrollForm challengeToken={enrollChallenge} />
          </>
        ) : (
          <>
            {enrollRequested ? (
              <Alert tone="error">Enrollment could not be started. Try again.</Alert>
            ) : null}
            <form action={startMfaEnrollAction}>
              <Button variant="primary">Enroll authenticator</Button>
            </form>
          </>
        )}
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
