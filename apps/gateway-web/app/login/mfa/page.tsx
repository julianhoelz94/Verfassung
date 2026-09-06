import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser, mfaChallengeToken } from '../../../lib/session';
import { requestStartMfaEnroll } from '../../../lib/identity-client';
import { completeMfaAction, confirmEnrollAction } from '../actions';

type MfaPageProps = {
  searchParams: { error?: string; enroll?: string };
};

export default async function MfaPage({ searchParams }: MfaPageProps) {
  const user = await currentUser();
  const challenge = mfaChallengeToken();
  const enroll = searchParams.enroll === '1';
  if (user && !enroll) {
    redirect('/');
  }
  if (!challenge && !user) {
    redirect('/login');
  }

  let secret: string | null = null;
  let otpauthUrl: string | null = null;
  if (enroll) {
    try {
      const started = await requestStartMfaEnroll(challenge, undefined);
      secret = started.secret;
      otpauthUrl = started.otpauthUrl;
    } catch {
      secret = null;
    }
  }

  return (
    <PageMain>
      <h1>{enroll ? 'Set up authenticator' : 'Authenticator code'}</h1>
      <p className="lede">
        {enroll
          ? 'Admin and publisher accounts must enroll TOTP before signing in.'
          : 'Enter a 6-digit authenticator code or a recovery code.'}
      </p>
      {searchParams.error ? (
        <Alert tone="error">That code could not be verified.</Alert>
      ) : null}
      {enroll ? (
        <Card>
          {secret ? (
            <>
              <p>
                Authenticator secret: <code>{secret}</code>
              </p>
              {otpauthUrl ? (
                <p className="muted">
                  otpauth URL: <code>{otpauthUrl}</code>
                </p>
              ) : null}
            </>
          ) : (
            <Alert tone="error">Enrollment could not be started. Sign in again.</Alert>
          )}
          <form action={confirmEnrollAction}>
            <Input
              label="Authenticator code"
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <Button variant="primary">Confirm enrollment</Button>
          </form>
        </Card>
      ) : (
        <Card>
          <form action={completeMfaAction}>
            <Input
              label="Authenticator code"
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Input label="Recovery code" id="recoveryCode" name="recoveryCode" autoComplete="off" />
            <Button variant="primary">Continue</Button>
          </form>
        </Card>
      )}
    </PageMain>
  );
}
