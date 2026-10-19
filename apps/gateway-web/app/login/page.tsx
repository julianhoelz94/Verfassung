import { NavigatingActionForm } from '../components/NavigatingActionForm';
import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { canVisitEditor } from '../../lib/nav';
import { currentUser } from '../../lib/session';
import { loginAction } from './actions';
import { requestRegistrationStatus } from '../../lib/identity-client';
import { setupStatus } from '../../lib/deployment-setup';
import { setupMessages as m } from '../../lib/setup-messages';
import { PasskeyLogin } from '../passkeys/PasskeyLogin';
import { reviewUi } from '../../lib/ui-review-messages';

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string; registered?: string }>;
};

/** Seed-account hint is shown only while identity seeding is on (never in production). */
function seedHintEnabled(): boolean {
  return (process.env.IDENTITY_SEED_MODE ?? 'off') !== 'off';
}

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  const setup = await setupStatus();
  const registrationEnabled = await requestRegistrationStatus();
  if (user) {
    if (!setup.completed) redirect('/setup');
    redirect(searchParams.next?.startsWith('/oauth/authorize?') ? searchParams.next : canVisitEditor(user.roles) ? '/editor' : '/');
  }

  return (
    <PageMain>
      <PageHeader
        title={<T value={ui.attrs.loginPagePageHeaderTitleLogIn} />}
        meta={
          seedHintEnabled() ? (
            <>
              <T value={ui.login.page.useASeededLocalAccountLocalEditor} />{" "}<code>IDENTITY_SEED_TOTP_SECRET</code><T value={ui.login.page.ifThatSettingIsAbsentUse} />{" "}<code>CAATLASMFASEED22</code> <T value={ui.login.page.asTheAuthenticatorSecretSeedingCreatesMissing} />{" "}</>
          ) : (
            <T value={reviewUi.signInHint} />
          )
        }
      />
      {searchParams.error ? (
        <Alert tone="error">
          <span id="login-error">
            <T value={searchParams.error === 'unavailable'
              ? ui.loginFeedback.unavailable
              : searchParams.error === 'rate-limit'
                ? ui.loginFeedback.rateLimit
                : ui.loginFeedback.invalid} />
          </span>
        </Alert>
      ) : null}
      {searchParams.registered ? <Alert tone="success"><T value={ui.login.page.accountConfirmedYouCanSignIn} /></Alert> : null}
      {!setup.completed ? <Alert tone="info"><T value={m.adminOnly} /></Alert> : null}
      <Card>
        <NavigatingActionForm action={loginAction}>
          {searchParams.next?.startsWith('/oauth/authorize?') ? <input type="hidden" name="next" value={searchParams.next} /> : null}
          <Input
            label={<T value={ui.attrs.loginPageInputLabelEmail} />}
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
            label={<T value={ui.attrs.loginPageInputLabelPassword} />}
            id="password"
            name="password"
            type="password"
            required
            aria-required="true"
            autoComplete="current-password"
          />
          <Button variant="primary"><T value={ui.login.page.signIn} /></Button>
        </NavigatingActionForm>
      </Card>
      {setup.completed ? <Card><PasskeyLogin /></Card> : null}
      {setup.completed ? <p>
        <a href="/reset"><T value={ui.login.page.forgotPassword} /></a>
      </p> : null}
      {setup.completed && registrationEnabled ? <p><a href="/register"><T value={ui.login.page.createAnAccount} /></a></p> : null}
    </PageMain>
  );
}
