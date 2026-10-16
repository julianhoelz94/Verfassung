import { T, ui } from '../../components/TranslationProvider';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { confirmRegistrationAction } from '../actions';

export default async function ConfirmRegistrationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <PageMain>
    <PageHeader title={<T value={ui.attrs.registerConfirmPagePageHeaderTitleConfirm} />} meta={<T value={ui.attrs.registerConfirmPagePageHeaderMetaChoose} />} />
    {params.error ? <Alert tone="error"><T value={ui.register.confirm.page.theLinkHasExpiredOrThePassword} /></Alert> : null}
    <Card><form action={confirmRegistrationAction}>
      <Input label={<T value={ui.attrs.registerConfirmPageInputLabelConfirmation} />} id="confirm-token" name="token" defaultValue={params.token ?? ''} required />
      <Input label={<T value={ui.attrs.registerConfirmPageInputLabelPassword} />} id="confirm-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <Button variant="primary"><T value={ui.register.confirm.page.confirmAndCreateAccount} /></Button>
    </form></Card>
  </PageMain>;
}
