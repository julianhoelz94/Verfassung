import { T, ui } from '../components/TranslationProvider';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestMcpKeys, requestOAuthGrants, requestPasskeys, requestStartMfaEnroll } from '../../lib/identity-client';
import { PasskeyManager } from '../passkeys/PasskeyManager';
import { SESSION_COOKIE, currentUser, mfaChallengeToken } from '../../lib/session';
import { ConfirmEnrollForm, RegenerateRecoveryForm } from './MfaForms';
import { changePasswordAction, revokeMfaAction, startMfaEnrollAction, updateLanguagePreferenceAction } from './actions';
import { revokeMcpKeyAction, revokeOAuthGrantAction } from './actions';
import Image from 'next/image';
import { CreateMcpKeyForm, RotateMcpKeyForm } from './McpKeyForms';
import { availableLocales } from '../../lib/locale';

type AccountPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    enroll?: string;
    mfaRevoked?: string;
    languageSaved?: string;
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
  let enrollQr: string | null = null;
  let enrollChallenge: string | null = enrollRequested ? (await mfaChallengeToken()) ?? null : null;
  if (!user.mfaEnabled && enrollChallenge) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    try {
      const started = await requestStartMfaEnroll(enrollChallenge, token);
      enrollSecret = started.secret;
      enrollQr = started.qrDataUrl;
      enrollChallenge = started.challengeToken;
    } catch {
      enrollSecret = null;
    }
  }
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const mcpKeys = sessionToken ? await requestMcpKeys(sessionToken).catch(() => []) : [];
  const oauthGrants = sessionToken ? await requestOAuthGrants(sessionToken).catch(() => []) : [];
  const passkeys = sessionToken ? await requestPasskeys(sessionToken).catch(() => []) : [];
  const canImport = user.roles.includes('editor') || user.roles.includes('admin');
  const mcpUrl = new URL('/mcp', process.env.PUBLIC_BASE_URL || 'http://localhost').toString();
  return (
    <PageMain>
      <PageHeader title={<T value={ui.attrs.accountPagePageHeaderTitleAccount} />} meta={`Signed in as ${user.email}.`} />
      {searchParams.error === 'mfa' ? (
        <Alert tone="error"><T value={ui.account.page.authenticatorActionFailedCheckTheCodeAnd} /></Alert>
      ) : searchParams.error === 'oauth' ? (
        <Alert tone="error"><T value={ui.account.page.theChatClientConnectionCouldNotBe} /></Alert>
      ) : searchParams.error === 'key' ? (
        <Alert tone="error"><T value={ui.account.page.theMcpKeyCouldNotBeChanged} /></Alert>
      ) : searchParams.error === 'language' ? (
        <Alert tone="error"><T value={ui.account.page.languagePreferenceCouldNotBeSaved} /></Alert>
      ) : searchParams.error ? (
        <Alert tone="error"><T value={ui.account.page.passwordCouldNotBeChangedCheckThe} /></Alert>
      ) : null}
      {searchParams.saved ? <Alert tone="success"><T value={ui.account.page.passwordUpdated} /></Alert> : null}
      {searchParams.mfaRevoked ? <Alert tone="success"><T value={ui.account.page.authenticatorEnrollmentWasRevoked} /></Alert> : null}
      {searchParams.languageSaved ? <Alert tone="success"><T value={ui.account.page.languagePreferenceSaved} /></Alert> : null}
      <Card>
        <section className="account-section" aria-labelledby="language-title">
          <h2 id="language-title"><T value={ui.account.page.language} /></h2>
          <p><T value={ui.account.page.chooseTheWebsiteLanguageAutomaticFollowsYour} /></p>
          <form action={updateLanguagePreferenceAction}>
            <label htmlFor="languagePreference"><T value={ui.account.page.websiteLanguage} /></label>
            <select id="languagePreference" name="languagePreference" defaultValue={user.languagePreference ?? 'auto'}>
              <option value="auto"><T value={ui.account.page.automaticDeviceLanguage} /></option>
              {availableLocales.map((locale) => (
                <option value={locale} key={locale}><T value={ui.languageNames[locale]} /></option>
              ))}
            </select>
            <Button variant="primary"><T value={ui.account.page.saveLanguage} /></Button>
          </form>
        </section>
      </Card>
      <Card>
        <section className="account-section" aria-labelledby="authenticator-title">
        <h2 id="authenticator-title"><T value={ui.account.page.authenticator} /></h2>
        {user.mfaRequired && !user.mfaEnabled ? (
          <p><T value={ui.account.page.adminAndPublisherAccountsMustEnrollAn} /></p>
        ) : null}
        {enrollRequested && enrollChallenge && enrollSecret ? (
          <>
            <p><T value={ui.account.page.scanThisQrCodeWithGoogleAuthenticator} /></p>
            {enrollQr ? <Image src={enrollQr} alt="Authenticator setup QR code" width={208} height={208} unoptimized /> : null}
            <p><T value={ui.account.page.ifYouCannotScanItEnterThis} />{" "}<code>{enrollSecret}</code></p>
            <p className="muted"><T value={ui.account.page.theKeyIsShownOnlyDuringSetup} /></p>
            <ConfirmEnrollForm challengeToken={enrollChallenge} />
          </>
        ) : user.mfaEnabled ? (
          <>
            <p><T value={ui.account.page.authenticatorAppIsEnrolled} />{user.stepUpFresh ? ' and recently confirmed.' : '.'}</p>
            {user.mfaRequired ? (
              <p className="muted"><T value={ui.account.page.authenticatorEnrollmentIsRequiredForThisAccount} /></p>
            ) : (
              <form action={revokeMfaAction}>
                <Input label={<T value={ui.attrs.accountPageInputLabelAuthenticatorCode} />} id="revokeCode" name="code" inputMode="numeric" required />
                <Button><T value={ui.account.page.revokeAuthenticator} /></Button>
              </form>
            )}
            <RegenerateRecoveryForm />
          </>
        ) : (
          <>
            {enrollRequested ? (
              <Alert tone="error"><T value={ui.account.page.enrollmentCouldNotBeStartedTryAgain} /></Alert>
            ) : null}
            <form action={startMfaEnrollAction}>
              <Button variant="primary"><T value={ui.account.page.enrollAuthenticator} /></Button>
            </form>
          </>
        )}
        </section>
        <section className="account-section" aria-labelledby="password-title">
        <h2 id="password-title"><T value={ui.account.page.changePassword} /></h2>
        <form action={changePasswordAction}>
          <Input
            label={<T value={ui.attrs.accountPageInputLabelCurrentPassword} />}
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Input
            label={<T value={ui.attrs.accountPageInputLabelNewPassword} />}
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Button variant="primary"><T value={ui.account.page.updatePassword} /></Button>
        </form>
        </section>
      </Card>
      <Card><PasskeyManager passkeys={passkeys} /></Card>
      <Card>
        <section className="account-section" id="mcp-keys" aria-labelledby="mcp-keys-title">
          <h2 id="mcp-keys-title"><T value={ui.account.page.connectAChatClient} /></h2>
          <p><T value={ui.account.page.connectAnOauthCapableClientTo} />{" "}<code>{mcpUrl}</code> <T value={ui.account.page.andSignInWhenPromptedApproveRead} /></p>
          <h3><T value={ui.account.page.claudeCodeExample} /></h3>
          <p><T value={ui.account.page.afterCopyingAKeyRunThisOn} /></p>
          <pre tabIndex={0}><code>{`claude mcp add --transport http constitution-atlas ${mcpUrl} --header "Authorization: Bearer <your-MCP-key>"`}</code></pre>
          <p><a href="https://code.claude.com/docs/en/mcp"><T value={ui.account.page.claudeCodeMcpSetupInstructions} /></a><T value={ui.account.page.useAClientThatSupportsACustom} /></p>
          <CreateMcpKeyForm canImport={canImport} />
          <h3><T value={ui.account.page.connectedOauthClients} /></h3>
          {oauthGrants.length === 0 ? <p><T value={ui.account.page.noActiveOauthConnections} /></p> : oauthGrants.map((grant) => <div key={grant.clientId}>
            <strong>{grant.clientName}</strong> <T value={ui.account.page.accessExpires} />{" "}{new Date(grant.expiresAt).toLocaleString()}<br />
            <T value={ui.account.page.clientId} />{" "}<code>{grant.clientId}</code><br />
            <T value={ui.account.page.registeredDestinations} />{" "}{grant.redirectUris.map(uri => { try { return new URL(uri).origin; } catch { return uri; } }).join(', ')}
            <form action={revokeOAuthGrantAction}><input type="hidden" name="clientId" value={grant.clientId} /><Button><T value={ui.account.page.revokeAccess} /></Button></form>
          </div>)}
          <h3><T value={ui.account.page.yourMcpKeys} /></h3>
          {mcpKeys.length === 0 ? <p><T value={ui.account.page.noKeysYet} /></p> : mcpKeys.map((key) => <div key={key.id}>
            <strong>{key.name}</strong> · {key.scopes.join(', ')} <T value={ui.account.page.expires} />{" "}{new Date(key.expiresAt).toLocaleDateString()}
            {key.revokedAt ? <span> <T value={ui.account.page.revoked} /></span> : <>
              <RotateMcpKeyForm keyId={key.id} />
              <form action={revokeMcpKeyAction}><input type="hidden" name="keyId" value={key.id} /><Button><T value={ui.account.page.revoke} /></Button></form>
            </>}
          </div>)}
        </section>
      </Card>
    </PageMain>
  );
}
