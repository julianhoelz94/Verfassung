import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { confirmRegistrationAction } from '../actions';

export default async function ConfirmRegistrationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <PageMain>
    <PageHeader title="Confirm your account" meta="Choose a password, then sign in to add an authenticator app or passkey." />
    {params.error ? <Alert tone="error">The link has expired or the password does not meet policy. Request a new email if needed.</Alert> : null}
    <Card><form action={confirmRegistrationAction}>
      <Input label="Confirmation token" id="confirm-token" name="token" defaultValue={params.token ?? ''} required />
      <Input label="Password" id="confirm-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <Button variant="primary">Confirm and create account</Button>
    </form></Card>
  </PageMain>;
}
