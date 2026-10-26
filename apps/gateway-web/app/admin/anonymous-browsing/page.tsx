import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { CollectionPage } from '../../components/layout/templates';
import { Alert, Card, PageHeader } from '../../components/ui';
import { requireAdminPage } from '../../../lib/admin';
import { requestAdminAnonymousBrowsingPolicy } from '../../../lib/anonymous-browsing-policy';
import { SESSION_COOKIE } from '../../../lib/session';
import { AnonymousBrowsingForm } from './AnonymousBrowsingForm';
import { setupMessages as m } from '../../../lib/setup-messages';

export default async function AnonymousBrowsingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; returnTo?: string }> }) {
  if (!(await requireAdminPage())) return <AdminForbidden title={ui.forbidden.anonymousBrowsing} />;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const policy = token ? await requestAdminAnonymousBrowsingPolicy(token).catch(() => null) : null;
  const params = await searchParams;
  const returnTo = params.returnTo === '/setup' || params.returnTo === '/admin/settings' ? params.returnTo : undefined;
  return <CollectionPage width="reading" header={<PageHeader title={<T value={ui.attrs.adminAnonymousBrowsingPagePageHeaderTitleAnonymous} />} meta={<T value={ui.attrs.adminAnonymousBrowsingPagePageHeaderMetaControl} />}
      actions={returnTo ? <a className="btn btn-secondary" href={`${returnTo}#${returnTo === '/setup' ? 'preferences' : 'general'}`}><T value={returnTo === '/setup' ? m.backToSetup : m.backToSettings} /></a> : undefined} />}>

    {params.error ? <Alert tone="error"><T value={ui.admin.anonymousBrowsing.page.settingsCouldNotBeSavedCheckThat} /></Alert> : null}
    {params.saved ? <Alert tone="success"><T value={ui.admin.anonymousBrowsing.page.anonymousBrowsingSettingsSaved} /></Alert> : null}
    {!policy ? <Alert tone="error"><T value={ui.admin.anonymousBrowsing.page.anonymousBrowsingSettingsCouldNotBeLoaded} /></Alert> :
      <Card><AnonymousBrowsingForm policy={policy} returnTo={returnTo} /></Card>}
  </CollectionPage>;
}
