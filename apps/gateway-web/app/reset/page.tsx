import { T, ui } from '../components/TranslationProvider';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { confirmResetAction, requestResetAction } from '../account/actions';

type ResetPageProps = {
  searchParams: Promise<{ token?: string; sent?: string; error?: string }>;
};

export default async function ResetPage(props: ResetPageProps) {
  const searchParams = await props.searchParams;
  return (
    <PageMain>
      <PageHeader
        title={<T value={ui.attrs.resetPagePageHeaderTitleResetPassword} />}
        meta={<T value={ui.attrs.resetPagePageHeaderMetaEnterYour} />}
      />
      {searchParams.sent ? (
        <Alert><T value={ui.reset.page.ifThatAccountExistsAResetWas} /></Alert>
      ) : null}
      {searchParams.error ? <Alert tone="error"><T value={ui.reset.page.thatResetLinkIsInvalidOrThe} /></Alert> : null}
      <Card>
        <form action={requestResetAction}>
          <Input label={<T value={ui.attrs.resetPageInputLabelEmail} />} id="reset-email" name="email" type="email" autoComplete="username" required />
          <Button variant="primary"><T value={ui.reset.page.requestReset} /></Button>
        </form>
        <h2><T value={ui.reset.page.confirmReset} /></h2>
        <form action={confirmResetAction}>
          <Input label={<T value={ui.attrs.resetPageInputLabelResetToken} />} id="token" name="token" defaultValue={searchParams.token ?? ''} required />
          <Input
            label={<T value={ui.attrs.resetPageInputLabelNewPassword} />}
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Button variant="primary"><T value={ui.reset.page.setNewPassword} /></Button>
        </form>
      </Card>
    </PageMain>
  );
}
