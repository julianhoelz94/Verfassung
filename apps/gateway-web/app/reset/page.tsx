import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { FocusedPage } from '../components/layout/templates';
import { confirmResetAction, requestResetAction } from '../account/actions';
import { Stack } from '../components/layout/Layout';

type ResetPageProps = {
  searchParams: Promise<{ token?: string; sent?: string; error?: string }>;
};

export default async function ResetPage(props: ResetPageProps) {
  const searchParams = await props.searchParams;
  return (
    <FocusedPage width="reading" header={<PageHeader
        title={<T value={ui.attrs.resetPagePageHeaderTitleResetPassword} />}
        meta={<T value={ui.attrs.resetPagePageHeaderMetaEnterYour} />}
      />}>

      {searchParams.sent ? (
        <Alert><T value={ui.reset.page.ifThatAccountExistsAResetWas} /></Alert>
      ) : null}
      {searchParams.error ? <Alert tone="error"><T value={ui.reset.page.thatResetLinkIsInvalidOrThe} /></Alert> : null}
      <Card>
        <Stack as="form" action={requestResetAction}>
          <Input label={<T value={ui.attrs.resetPageInputLabelEmail} />} id="reset-email" name="email" type="email" autoComplete="username" required />
          <Button variant="primary"><T value={ui.reset.page.requestReset} /></Button>
        </Stack>
        <h2><T value={ui.reset.page.confirmReset} /></h2>
        <Stack as="form" action={confirmResetAction}>
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
        </Stack>
      </Card>
    </FocusedPage>
  );
}
