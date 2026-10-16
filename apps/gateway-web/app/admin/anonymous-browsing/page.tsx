import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { PageMain } from '../../components/PageMain';
import { Alert, Card, PageHeader } from '../../components/ui';
import { requireAdminPage } from '../../../lib/admin';
import { requestAdminAnonymousBrowsingPolicy } from '../../../lib/anonymous-browsing-policy';
import { SESSION_COOKIE } from '../../../lib/session';
import { AnonymousBrowsingForm } from './AnonymousBrowsingForm';

export default async function AnonymousBrowsingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  if (!(await requireAdminPage())) return <AdminForbidden title="Anonymous browsing" />;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const policy = token ? await requestAdminAnonymousBrowsingPolicy(token).catch(() => null) : null;
  const params = await searchParams;
  return <PageMain>
    <PageHeader title="Anonymous browsing" meta="Control access and API call rates for visitors who are not signed in." />
    {params.error ? <Alert tone="error">Settings could not be saved. Check that every rate is positive and try again.</Alert> : null}
    {params.saved ? <Alert tone="success">Anonymous browsing settings saved.</Alert> : null}
    {!policy ? <Alert tone="error">Anonymous browsing settings could not be loaded.</Alert> :
      <Card><AnonymousBrowsingForm policy={policy} /></Card>}
  </PageMain>;
}
