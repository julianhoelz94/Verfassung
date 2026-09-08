import { Alert, Button, Card, Input, PageHeader } from '../components/ui';
import { PageMain } from '../components/PageMain';
import { acceptInviteAction } from '../account/actions';

type InvitePageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function InvitePage(props: InvitePageProps) {
  const searchParams = await props.searchParams;
  return (
    <PageMain>
      <PageHeader
        title="Accept invite"
        meta="Set a password to activate the invited account. There is no public self-registration."
      />
      {searchParams.error ? <Alert tone="error">That invite is invalid or the password does not meet policy.</Alert> : null}
      <Card>
        <form action={acceptInviteAction}>
          <Input label="Invite token" id="token" name="token" defaultValue={searchParams.token ?? ''} required />
          <Input
            label="Password"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Button variant="primary">Activate account</Button>
        </form>
      </Card>
    </PageMain>
  );
}
