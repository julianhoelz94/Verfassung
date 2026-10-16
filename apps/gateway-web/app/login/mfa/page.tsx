import { T, ui } from '../../components/TranslationProvider';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser, mfaChallengeToken } from '../../../lib/session';
import { requestStartMfaEnroll } from '../../../lib/identity-client';
import { LoginEnrollForm } from '../../account/MfaForms';
import { completeMfaAction } from '../actions';
import Image from 'next/image';
import { PasskeyLoginEnrollment } from '../../passkeys/PasskeyLoginEnrollment';
import { PasskeyLogin } from '../../passkeys/PasskeyLogin';

type MfaPageProps = {
  searchParams: Promise<{ error?: string; enroll?: string; next?: string }>;
};

export default async function MfaPage(props: MfaPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  const challenge = await mfaChallengeToken();
  const enroll = searchParams.enroll === '1';
  if (user && !enroll) {
    redirect(searchParams.next?.startsWith('/oauth/authorize?') ? searchParams.next : '/');
  }
  if (!challenge && !user) {
    redirect('/login');
  }

  let secret: string | null = null;
  let qrDataUrl: string | null = null;
  if (enroll) {
    try {
      const started = await requestStartMfaEnroll(challenge, undefined);
      secret = started.secret;
      qrDataUrl = started.qrDataUrl;
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
            ? 'Set up an authenticator app or a passkey before signing in.'
            : 'Enter a 6-digit authenticator code or a recovery code.'
        }
      />
      {searchParams.error ? (
        <Alert tone="error"><T value={ui.login.mfa.page.thatCodeCouldNotBeVerified} /></Alert>
      ) : null}
      {enroll ? (
        <Card>
          {secret ? (
            <>
              <p><T value={ui.login.mfa.page.scanThisCodeWithAnAuthenticatorApp} /></p>
              {qrDataUrl ? <Image src={qrDataUrl} alt="Authenticator setup QR code" width={208} height={208} unoptimized /> : null}
              <p><T value={ui.login.mfa.page.ifYouCannotScanItEnterThis} />{" "}<code>{secret}</code></p>
            </>
          ) : (
            <Alert tone="error"><T value={ui.login.mfa.page.enrollmentCouldNotBeStartedSignIn} /></Alert>
          )}
          <LoginEnrollForm next={searchParams.next?.startsWith('/oauth/authorize?') ? searchParams.next : undefined} />
          {!user ? <PasskeyLoginEnrollment /> : null}
          {!user ? <PasskeyLogin /> : null}
        </Card>
      ) : (
        <Card>
          <form action={completeMfaAction}>
            {searchParams.next?.startsWith('/oauth/authorize?') ? <input type="hidden" name="next" value={searchParams.next} /> : null}
            <Input
              label={<T value={ui.attrs.loginMfaPageInputLabelAuthenticator} />}
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Input label={<T value={ui.attrs.loginMfaPageInputLabelRecovery} />} id="recoveryCode" name="recoveryCode" autoComplete="off" />
            <Button variant="primary"><T value={ui.login.mfa.page.continue} /></Button>
          </form>
        </Card>
      )}
    </PageMain>
  );
}
