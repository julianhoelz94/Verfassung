import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { FocusedPage } from '../components/layout/templates';
import { acceptInviteAction } from '../account/actions';
import { Stack } from '../components/layout/Layout';

type InvitePageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function InvitePage(props: InvitePageProps) {
  const searchParams = await props.searchParams;
  return (
    <FocusedPage width="reading" header={<PageHeader
        title={<T value={ui.attrs.invitePagePageHeaderTitleAcceptInvite} />}
        meta={<T value={ui.attrs.invitePagePageHeaderMetaSetA} />}
      />}>

      {searchParams.error ? <Alert tone="error"><T value={ui.invite.page.thatInviteIsInvalidOrThePassword} /></Alert> : null}
      <Card>
        <Stack as="form" action={acceptInviteAction}>
          <Input label={<T value={ui.attrs.invitePageInputLabelInviteToken} />} id="token" name="token" defaultValue={searchParams.token ?? ''} required />
          <Input
            label={<T value={ui.attrs.invitePageInputLabelPassword} />}
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Button variant="primary"><T value={ui.invite.page.activateAccount} /></Button>
        </Stack>
      </Card>
    </FocusedPage>
  );
}
