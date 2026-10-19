import { setupStatus } from '../../../lib/deployment-setup';
import { currentLocale } from '../../../lib/server-locale';
import { message } from '../../../lib/messages';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { redirect } from 'next/navigation';
import { Alert, Card, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser, mfaChallengeToken } from '../../../lib/session';
import { requestStartMfaEnroll } from '../../../lib/identity-client';
import { LoginEnrollForm } from '../../account/MfaForms';
import { MfaLoginForm } from './MfaLoginForm';
import { MfaSetup } from '../../components/MfaSetup';
import { PasskeyLoginEnrollment } from '../../passkeys/PasskeyLoginEnrollment';
import { PasskeyLogin } from '../../passkeys/PasskeyLogin';
import { identityRequestFetch } from '../../../lib/identity-request';

type MfaPageProps = {
  searchParams: Promise<{ error?: string; enroll?: string; next?: string; method?: string }>;
};

export default async function MfaPage(props: MfaPageProps) {
  const locale = await currentLocale();
  const setup = await setupStatus();
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
      const started = await requestStartMfaEnroll(challenge, undefined, undefined, await identityRequestFetch());
      secret = started.secret;
      qrDataUrl = started.qrDataUrl;
    } catch {
      secret = null;
    }
  }

  return (
    <PageMain>
      <PageHeader
        title={message(locale, enroll ? ui.loginFeedback.setupAuthenticator : ui.loginFeedback.authenticatorCode)}
        meta={message(locale, enroll ? ui.loginFeedback.setupBeforeSignIn : ui.loginFeedback.enterCode)}
      />
      {searchParams.error ? (
        <Alert tone="error"><T value={ui.login.mfa.page.thatCodeCouldNotBeVerified} /></Alert>
      ) : null}
      {enroll ? (
        <Card>
          {secret ? (
            <MfaSetup secret={secret} qrDataUrl={qrDataUrl} qrLabel={message(locale, ui.accessibility.authenticatorQr)} />
          ) : (
            <Alert tone="error"><T value={ui.login.mfa.page.enrollmentCouldNotBeStartedSignIn} /></Alert>
          )}
          <LoginEnrollForm next={searchParams.next?.startsWith('/oauth/authorize?') ? searchParams.next : undefined} />
          {setup.completed && !user ? <PasskeyLoginEnrollment next={searchParams.next} /> : null}
          {setup.completed && !user ? <PasskeyLogin next={searchParams.next} /> : null}
        </Card>
      ) : (
        <Card>
          <MfaLoginForm next={searchParams.next?.startsWith('/oauth/authorize?') ? searchParams.next : undefined} recovery={searchParams.method === 'recovery'} focus={['recovery', 'authenticator'].includes(searchParams.method ?? '')} />
          {setup.completed && !user ? <PasskeyLogin next={searchParams.next} /> : null}
        </Card>
      )}
    </PageMain>
  );
}
