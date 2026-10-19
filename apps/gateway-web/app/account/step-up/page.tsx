import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser } from '../../../lib/session';
import { stepUpAction } from '../actions';

type StepUpPageProps = {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
};

export default async function StepUpPage(props: StepUpPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  return (
    <PageMain>
      <PageHeader title={<T value={ui.attrs.accountStepUpPagePageHeaderTitleConfirm} />} meta={<T value={ui.attrs.accountStepUpPagePageHeaderMetaPublishing} />} />
      {searchParams.error ? <Alert tone="error"><T value={ui.account.stepUp.page.thatAuthenticatorCodeCouldNotBeVerified} /></Alert> : null}
      <Card>
        <form action={stepUpAction}>
          <input type="hidden" name="returnTo" value={searchParams.returnTo ?? '/account'} />
          <Input
            label={<T value={ui.attrs.accountStepUpPageInputLabelAuthenticator} />}
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <Button variant="primary"><T value={ui.account.stepUp.page.continue} /></Button>
        </form>
      </Card>
    </PageMain>
  );
}
