import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestRegistrationStatus } from '../../lib/identity-client';
import { registerAction } from './actions';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  const enabled = await requestRegistrationStatus();
  return <PageMain>
    <PageHeader title="Register" meta="Create a viewer account to browse and use personal features." />
    {!enabled ? <Alert tone="info">Registration is currently closed.</Alert> : params.sent ? (
      <Alert tone="success">If this address can be registered, you will receive a confirmation email. Check your inbox.</Alert>
    ) : <Card>
      {params.error ? <Alert tone="error">Registration could not be requested. Check the address or try again later.</Alert> : null}
      <form action={registerAction}>
        <Input label="Email" id="register-email" name="email" type="email" autoComplete="email" required />
        <Button variant="primary">Send confirmation email</Button>
      </form>
    </Card>}
  </PageMain>;
}
