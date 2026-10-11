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
    return <PageMain><PageHeader title="Connect a chat client" meta="Sign in to review this connection request." /><Card><a href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in to continue</a></Card></PageMain>;
  }

  let clientName: string | null = null;
  try {
    const clientQuery = new URLSearchParams({ redirect_uri: values.redirect_uri, resource: values.resource });
    const response = await fetch(`${identityBaseUrl()}/oauth/clients/${encodeURIComponent(values.client_id)}?${clientQuery}`, { cache: 'no-store' });
    if (response.ok) clientName = ((await response.json()) as { client_name: string }).client_name;
  } catch { /* Show a safe error without redirecting to an unverified client. */ }
  if (!clientName || values.response_type !== 'code' || values.code_challenge_method !== 'S256') {
    return <PageMain><PageHeader title="Connection request rejected" /><Alert tone="error">This client or redirect address is invalid.</Alert></PageMain>;
  }
  return (
    <PageMain>
      <PageHeader title="Connect a chat client" meta="Review the access this client is requesting." />
      {incoming.error ? <Alert tone="error">The connection could not be authorized. Check your account permissions and try again.</Alert> : null}
      <Card>
        <p><strong>{clientName}</strong> requests access as {user.email}.</p>
        <p>Requested permissions: {values.scope.split(' ').join(', ')}.</p>
        <p>Constitution imports still require site review and a separate publisher.</p>
        <form action={authorizeClient}>
          {fields.map(field => <input key={field} type="hidden" name={field} value={values[field]} />)}
          <Button name="decision" value="approve" variant="primary">Allow access</Button>{' '}
          <Button name="decision" value="deny" variant="secondary">Deny</Button>
        </form>
      </Card>
    </PageMain>
  );
}
