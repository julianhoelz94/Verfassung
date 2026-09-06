import { redirect } from 'next/navigation';
import { Alert, Button, Card, Input } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { currentUser } from '../../../lib/session';
import { stepUpAction } from '../actions';

type StepUpPageProps = {
  searchParams: { error?: string; returnTo?: string };
};

export default async function StepUpPage({ searchParams }: StepUpPageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  return (
    <PageMain>
      <h1>Confirm it is you</h1>
      <p className="lede">Publishing and role changes need a recent authenticator code.</p>
      {searchParams.error ? <Alert tone="error">That authenticator code could not be verified.</Alert> : null}
      <Card>
        <form action={stepUpAction}>
          <input type="hidden" name="returnTo" value={searchParams.returnTo ?? '/account'} />
          <Input
            label="Authenticator code"
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <Button variant="primary">Continue</Button>
        </form>
      </Card>
    </PageMain>
  );
}
