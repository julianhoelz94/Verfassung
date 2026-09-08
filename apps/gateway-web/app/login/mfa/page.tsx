import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser, mfaChallengeToken } from '../../../lib/session';
import { requestStartMfaEnroll } from '../../../lib/identity-client';
import { LoginEnrollForm } from '../../account/MfaForms';
import { completeMfaAction } from '../actions';

type MfaPageProps = {
  searchParams: Promise<{ error?: string; enroll?: string }>;
};

export default async function MfaPage(props: MfaPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  const challenge = await mfaChallengeToken();
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
      <PageHeader
        title={enroll ? 'Set up authenticator' : 'Authenticator code'}
        meta={
          enroll
            ? 'Admin and publisher accounts must enroll TOTP before signing in.'
            : 'Enter a 6-digit authenticator code or a recovery code.'
        }
      />
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
          <LoginEnrollForm />
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
