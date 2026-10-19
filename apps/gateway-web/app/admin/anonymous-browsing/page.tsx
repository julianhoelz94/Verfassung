import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { PageMain } from '../../components/PageMain';
import { Alert, Card, PageHeader } from '../../components/ui';
import { requireAdminPage } from '../../../lib/admin';
import { requestAdminAnonymousBrowsingPolicy } from '../../../lib/anonymous-browsing-policy';
import { SESSION_COOKIE } from '../../../lib/session';
import { AnonymousBrowsingForm } from './AnonymousBrowsingForm';

export default async function AnonymousBrowsingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  if (!(await requireAdminPage())) return <AdminForbidden title={ui.forbidden.anonymousBrowsing} />;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const policy = token ? await requestAdminAnonymousBrowsingPolicy(token).catch(() => null) : null;
  const params = await searchParams;
  return <PageMain>
    <PageHeader title={<T value={ui.attrs.adminAnonymousBrowsingPagePageHeaderTitleAnonymous} />} meta={<T value={ui.attrs.adminAnonymousBrowsingPagePageHeaderMetaControl} />} />
    {params.error ? <Alert tone="error"><T value={ui.admin.anonymousBrowsing.page.settingsCouldNotBeSavedCheckThat} /></Alert> : null}
    {params.saved ? <Alert tone="success"><T value={ui.admin.anonymousBrowsing.page.anonymousBrowsingSettingsSaved} /></Alert> : null}
    {!policy ? <Alert tone="error"><T value={ui.admin.anonymousBrowsing.page.anonymousBrowsingSettingsCouldNotBeLoaded} /></Alert> :
      <Card><AnonymousBrowsingForm policy={policy} /></Card>}
  </PageMain>;
}
