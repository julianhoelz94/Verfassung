import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { currentUser } from '../../../lib/session';
import { identityBaseUrl } from '../../../lib/identity-client';
import { Alert, Button, Card, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { authorizeClient } from './actions';

type Params = Record<string, string | string[] | undefined>;
const fields = ['client_id', 'redirect_uri', 'resource', 'response_type', 'code_challenge', 'code_challenge_method', 'scope', 'state'] as const;

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const incoming = await searchParams;
  const values = Object.fromEntries(fields.map(field => [field, typeof incoming[field] === 'string' ? incoming[field] : ''])) as Record<string, string>;
  if (!values.scope) values.scope = 'mcp:read';
  const query = new URLSearchParams(values);
  const returnPath = `/oauth/authorize?${query}`;
  const user = await currentUser();
  if (!user) {
    return <PageMain><PageHeader title={<T value={ui.attrs.oauthAuthorizePagePageHeaderTitleConnect} />} meta={<T value={ui.attrs.oauthAuthorizePagePageHeaderMetaSign} />} /><Card><a href={`/login?next=${encodeURIComponent(returnPath)}`}><T value={ui.oauth.authorize.page.signInToContinue} /></a></Card></PageMain>;
  }

  let clientName: string | null = null;
  try {
    const clientQuery = new URLSearchParams({ redirect_uri: values.redirect_uri, resource: values.resource });
    const response = await fetchWithTimeout(`${identityBaseUrl()}/oauth/clients/${encodeURIComponent(values.client_id)}?${clientQuery}`, { cache: 'no-store' });
    if (response.ok) clientName = ((await response.json()) as { client_name: string }).client_name;
  } catch { /* Show a safe error without redirecting to an unverified client. */ }
  if (!clientName || values.response_type !== 'code' || values.code_challenge_method !== 'S256') {
    return <PageMain><PageHeader title={<T value={ui.attrs.oauthAuthorizePagePageHeaderTitleConnection} />} /><Alert tone="error"><T value={ui.oauth.authorize.page.thisClientOrRedirectAddressIsInvalid} /></Alert></PageMain>;
  }
  const wantsImport = values.scope.split(' ').includes('ingestion:import');
  const canImport = user.roles.some(role => role === 'editor' || role === 'admin');
  const needsStepUp = wantsImport && canImport && !user.stepUpFresh;
  return (
    <PageMain>
      <PageHeader title={<T value={ui.attrs.oauthAuthorizePagePageHeaderTitleConnect} />} meta={<T value={ui.attrs.oauthAuthorizePagePageHeaderMetaReview} />} />
      {incoming.error ? <Alert tone="error"><T value={ui.oauth.authorize.page.theConnectionCouldNotBeAuthorizedCheck} /></Alert> : null}
      <Card>
        <p><strong>{clientName}</strong> <T value={ui.oauth.authorize.page.requestsAccessAs} />{" "}{user.email}.</p>
        <p><T value={ui.oauth.authorize.page.clientId} />{" "}<code>{values.client_id}</code></p>
        <p><T value={ui.oauth.authorize.page.connectionDestination} />{" "}<code>{new URL(values.redirect_uri).origin}</code></p>
        <p><T value={ui.oauth.authorize.page.requestedPermissions} />{" "}{values.scope.split(' ').join(', ')}.</p>
        <p><T value={ui.oauth.authorize.page.constitutionImportsStillRequireSiteReviewAnd} /></p>
        {wantsImport && !canImport ? <Alert tone="error"><T value={ui.oauth.authorize.page.anEditorOrAdministratorAccountIsRequired} /></Alert> : null}
        {needsStepUp ? <p><a href={`/account/step-up?returnTo=${encodeURIComponent(returnPath)}`}><T value={ui.oauth.authorize.page.confirmWithYourAuthenticatorToAllowImport} /></a></p> : null}
        <form action={authorizeClient}>
          {fields.map(field => <input key={field} type="hidden" name={field} value={values[field]} />)}
          <Button name="decision" value="approve" variant="primary" disabled={wantsImport && (!canImport || needsStepUp)}><T value={ui.oauth.authorize.page.allowAccess} /></Button>{' '}
          <Button name="decision" value="deny" variant="secondary"><T value={ui.oauth.authorize.page.deny} /></Button>
        </form>
      </Card>
    </PageMain>
  );
}
