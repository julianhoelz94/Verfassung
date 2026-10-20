import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { FocusedPage } from '../../components/layout/templates';
import { confirmRegistrationAction } from '../actions';
import { Stack } from '../../components/layout/Layout';

export default async function ConfirmRegistrationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <FocusedPage width="reading" header={<PageHeader title={<T value={ui.attrs.registerConfirmPagePageHeaderTitleConfirm} />} meta={<T value={ui.attrs.registerConfirmPagePageHeaderMetaChoose} />} />}>

    {params.error ? <Alert tone="error"><T value={ui.register.confirm.page.theLinkHasExpiredOrThePassword} /></Alert> : null}
    <Card><Stack as="form" action={confirmRegistrationAction}>
      <Input label={<T value={ui.attrs.registerConfirmPageInputLabelConfirmation} />} id="confirm-token" name="token" defaultValue={params.token ?? ''} required />
      <Input label={<T value={ui.attrs.registerConfirmPageInputLabelPassword} />} id="confirm-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      <Button variant="primary"><T value={ui.register.confirm.page.confirmAndCreateAccount} /></Button>
    </Stack></Card>
  </FocusedPage>;
}
