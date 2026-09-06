import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestStartMfaEnroll } from '../../lib/identity-client';
import { SESSION_COOKIE, currentUser } from '../../lib/session';
import { changePasswordAction, confirmAccountMfaAction, regenerateRecoveryAction, revokeMfaAction, startMfaEnrollAction } from './actions';

type AccountPageProps = {
  searchParams: {
    error?: string;
    saved?: string;
    recovery?: string;
    enrollChallenge?: string;
    mfaRevoked?: string;
  };
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  const recoveryCodes = searchParams.recovery ? searchParams.recovery.split(',').filter(Boolean) : [];
  let enrollSecret: string | null = null;
  let enrollChallenge: string | null = searchParams.enrollChallenge ?? null;
  if (!user.mfaEnabled && enrollChallenge) {
    const token = cookies().get(SESSION_COOKIE)?.value;
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
      <h1>Account</h1>
      <p className="lede">Signed in as {user.email}.</p>
      {searchParams.error === 'mfa' ? (
        <Alert tone="error">Authenticator action failed. Check the code and try again.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">Password could not be changed. Check the current password and policy.</Alert>
      ) : null}
      {searchParams.saved ? <Alert tone="success">Password updated.</Alert> : null}
      {searchParams.mfaRevoked ? <Alert tone="success">Authenticator enrollment was revoked.</Alert> : null}
      {recoveryCodes.length > 0 ? (
        <Alert tone="success">
          Store these recovery codes now; they are shown only once.{' '}
          {recoveryCodes.map((code) => (
            <code key={code}>{code} </code>
          ))}
        </Alert>
      ) : null}
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
            <form action={regenerateRecoveryAction}>
              <Input label="Authenticator code" id="recoveryRotateCode" name="code" inputMode="numeric" required />
              <Button>Replace recovery codes</Button>
            </form>
          </>
        ) : enrollSecret && enrollChallenge ? (
          <>
            <p>
              Authenticator secret: <code>{enrollSecret}</code>
            </p>
            <form action={confirmAccountMfaAction}>
              <input type="hidden" name="challengeToken" value={enrollChallenge} />
              <Input label="Authenticator code" id="enrollCode" name="code" inputMode="numeric" required />
              <Button variant="primary">Confirm enrollment</Button>
            </form>
          </>
        ) : (
          <>
            {searchParams.enrollChallenge ? (
              <Alert tone="error">Enrollment could not be started. Try again.</Alert>
            ) : null}
            <form action={startMfaEnrollAction}>
              <Button variant="primary">Enroll authenticator</Button>
            </form>
          </>
        )}
      </Card>
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
