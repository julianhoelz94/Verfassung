import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestMcpKeys, requestStartMfaEnroll } from '../../lib/identity-client';
import { SESSION_COOKIE, currentUser, mfaChallengeToken } from '../../lib/session';
import { ConfirmEnrollForm, RegenerateRecoveryForm } from './MfaForms';
import { changePasswordAction, revokeMfaAction, startMfaEnrollAction } from './actions';
import { revokeMcpKeyAction } from './actions';
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
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const mcpKeys = sessionToken ? await requestMcpKeys(sessionToken).catch(() => []) : [];
  const canImport = user.roles.includes('editor') || user.roles.includes('admin');
  const mcpUrl = new URL('/mcp', process.env.PUBLIC_BASE_URL || 'http://localhost').toString();
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
        <section className="account-section" aria-labelledby="authenticator-title">
        <h2 id="authenticator-title">Authenticator</h2>
        {user.mfaRequired && !user.mfaEnabled ? (
          <p>Admin and publisher accounts must enroll an authenticator.</p>
        ) : null}
        {enrollRequested && enrollChallenge && enrollSecret ? (
          <>
            <p>
              Authenticator secret: <code>{enrollSecret}</code>
            </p>
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
      <Card>
        <section className="account-section" id="mcp-keys" aria-labelledby="mcp-keys-title">
          <h2 id="mcp-keys-title">Connect a chat client</h2>
          <p>Connect your client to <code>{mcpUrl}</code> with a personal MCP key. A read key lets you browse published constitutions; editors can create an import key to stage content. Every import remains pending review.</p>
          <h3>Claude Code example</h3>
          <p>After copying a key, run this on your computer and replace the placeholder with the key:</p>
          <pre tabIndex={0}><code>{`claude mcp add --transport http constitution-atlas ${mcpUrl} --header "Authorization: Bearer <your-MCP-key>"`}</code></pre>
          <p><a href="https://code.claude.com/docs/en/mcp">Claude Code MCP setup instructions</a>. Use a client that supports a custom Authorization header for import keys.</p>
          <CreateMcpKeyForm canImport={canImport} />
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
