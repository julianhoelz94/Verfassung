import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestMcpKeys, requestOAuthGrants, requestPasskeys, requestStartMfaEnroll } from '../../lib/identity-client';
import { PasskeyManager } from '../passkeys/PasskeyManager';
import { SESSION_COOKIE, currentUser, mfaChallengeToken } from '../../lib/session';
import { ConfirmEnrollForm, RegenerateRecoveryForm } from './MfaForms';
import { changePasswordAction, revokeMfaAction, startMfaEnrollAction } from './actions';
import { revokeMcpKeyAction, revokeOAuthGrantAction } from './actions';
import Image from 'next/image';
import { CreateMcpKeyForm, RotateMcpKeyForm } from './McpKeyForms';

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
      <PageHeader title="Account" meta={`Signed in as ${user.email}.`} />
      {searchParams.error === 'mfa' ? (
        <Alert tone="error">Authenticator action failed. Check the code and try again.</Alert>
      ) : searchParams.error === 'oauth' ? (
        <Alert tone="error">The chat client connection could not be revoked. Try again.</Alert>
      ) : searchParams.error === 'key' ? (
        <Alert tone="error">The MCP key could not be changed. Try again.</Alert>
      ) : searchParams.error ? (
        <Alert tone="error">Password could not be changed. Check the current password and policy.</Alert>
      ) : null}
      {searchParams.saved ? <Alert tone="success">Password updated.</Alert> : null}
      {searchParams.mfaRevoked ? <Alert tone="success">Authenticator enrollment was revoked.</Alert> : null}
      <Card>
        <section className="account-section" aria-labelledby="authenticator-title">
        <h2 id="authenticator-title">Authenticator</h2>
        {user.mfaRequired && !user.mfaEnabled ? (
          <p>Admin and publisher accounts must enroll an authenticator.</p>
        ) : null}
        {enrollRequested && enrollChallenge && enrollSecret ? (
          <>
            <p>Scan this QR code with Google Authenticator or another TOTP app, then enter its six-digit code.</p>
            {enrollQr ? <Image src={enrollQr} alt="Authenticator setup QR code" width={208} height={208} unoptimized /> : null}
            <p>If you cannot scan it, enter this setup key in the app: <code>{enrollSecret}</code></p>
            <p className="muted">The key is shown only during setup. Store the recovery codes you receive after confirming.</p>
            <ConfirmEnrollForm challengeToken={enrollChallenge} />
          </>
        ) : user.mfaEnabled ? (
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
        </section>
        <section className="account-section" aria-labelledby="password-title">
        <h2 id="password-title">Change password</h2>
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
        </section>
      </Card>
      <Card><PasskeyManager passkeys={passkeys} /></Card>
      <Card>
        <section className="account-section" id="mcp-keys" aria-labelledby="mcp-keys-title">
          <h2 id="mcp-keys-title">Connect a chat client</h2>
          <p>Connect an OAuth-capable client to <code>{mcpUrl}</code> and sign in when prompted. Approve read access, or request import access if you have editor rights. Access expires after 15 minutes and can be revoked by the client. You can also create a personal MCP key below for clients that need an Authorization header. Every import remains pending review.</p>
          <h3>Claude Code example</h3>
          <p>After copying a key, run this on your computer and replace the placeholder with the key:</p>
          <pre tabIndex={0}><code>{`claude mcp add --transport http constitution-atlas ${mcpUrl} --header "Authorization: Bearer <your-MCP-key>"`}</code></pre>
          <p><a href="https://code.claude.com/docs/en/mcp">Claude Code MCP setup instructions</a>. Use a client that supports a custom Authorization header for import keys.</p>
          <CreateMcpKeyForm canImport={canImport} />
          <h3>Connected OAuth clients</h3>
          {oauthGrants.length === 0 ? <p>No active OAuth connections.</p> : oauthGrants.map((grant) => <div key={grant.clientId}>
            <strong>{grant.clientName}</strong> · access expires {new Date(grant.expiresAt).toLocaleString()}<br />
            Client ID: <code>{grant.clientId}</code><br />
            Registered destinations: {grant.redirectUris.map(uri => { try { return new URL(uri).origin; } catch { return uri; } }).join(', ')}
            <form action={revokeOAuthGrantAction}><input type="hidden" name="clientId" value={grant.clientId} /><Button>Revoke access</Button></form>
          </div>)}
          <h3>Your MCP keys</h3>
          {mcpKeys.length === 0 ? <p>No keys yet.</p> : mcpKeys.map((key) => <div key={key.id}>
            <strong>{key.name}</strong> · {key.scopes.join(', ')} · expires {new Date(key.expiresAt).toLocaleDateString()}
            {key.revokedAt ? <span> · revoked</span> : <>
              <RotateMcpKeyForm keyId={key.id} />
              <form action={revokeMcpKeyAction}><input type="hidden" name="keyId" value={key.id} /><Button>Revoke</Button></form>
            </>}
          </div>)}
        </section>
      </Card>
    </PageMain>
  );
}
