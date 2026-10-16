import { T, ui } from '../components/TranslationProvider';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { requestRegistrationStatus } from '../../lib/identity-client';
import { registerAction } from './actions';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  const enabled = await requestRegistrationStatus();
  return <PageMain>
    <PageHeader title={<T value={ui.attrs.registerPagePageHeaderTitleRegister} />} meta={<T value={ui.attrs.registerPagePageHeaderMetaCreateA} />} />
    {!enabled ? <Alert tone="info"><T value={ui.register.page.registrationIsCurrentlyClosed} /></Alert> : params.sent ? (
      <Alert tone="success"><T value={ui.register.page.ifThisAddressCanBeRegisteredYou} /></Alert>
    ) : <Card>
      {params.error ? <Alert tone="error"><T value={ui.register.page.registrationCouldNotBeRequestedCheckThe} /></Alert> : null}
      <form action={registerAction}>
        <Input label={<T value={ui.attrs.registerPageInputLabelEmail} />} id="register-email" name="email" type="email" autoComplete="email" required />
        <Button variant="primary"><T value={ui.register.page.sendConfirmationEmail} /></Button>
      </form>
    </Card>}
  </PageMain>;
}
