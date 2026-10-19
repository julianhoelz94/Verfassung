import { reviewUi } from '../../../lib/ui-review-messages';
import Link from 'next/link';
import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { LocalizedRegion } from '../../components/LocalizedRegion';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { PageMain } from '../../components/PageMain';
import { Alert, Button, Card, PageHeader } from '../../components/ui';
import { requireAdminPage } from '../../../lib/admin';
import { requestIdentitySettings } from '../../../lib/identity-client';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';
import { saveContentTranslationSettingsAction } from './actions';
import { MailSettings } from './MailSettings';
import { SetupPreferences } from '../../setup/SetupPreferences';
import { ConnectionSettings } from '../../setup/ConnectionSettings';
import { setupRequest, type SetupDetails } from '../../../lib/deployment-setup';
import { setupMessages as m } from '../../../lib/setup-messages';
import { translationSiteSettings } from '../../../lib/content-translation';

export default async function IdentitySettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; tested?: string }> }) {
  const params = await searchParams;
  if (!(await requireAdminPage())) return <AdminForbidden title={ui.forbidden.accountSettings} />;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await currentUser();
  const settings = token ? await requestIdentitySettings(token).catch(() => null) : null;
  const translationSettings = token ? await translationSiteSettings(token).catch(() => null) : null;
  const details = token ? await setupRequest<SetupDetails>('/setup', `Bearer ${token}`).catch(() => null) : null;
  return <PageMain className="wide settings-page">
    <PageHeader title={<T value={reviewUi.siteSettings} />} meta={<T value={reviewUi.siteSettingsHint} />} />
    {params.error ? <Alert tone="error"><T value={params.error === 'test' ? ui.adminSettingsDynamic.mailTestFailed : ui.adminSettingsDynamic.saveFailed} /></Alert> : null}
    {params.saved ? <Alert tone="success"><T value={ui.admin.settings.page.settingsSaved} /></Alert> : null}
    {params.tested ? <Alert tone="success"><T value={ui.admin.settings.page.testEmailSent} /></Alert> : null}
    <div className="settings-layout">
      <LocalizedRegion as="nav" className="section-nav" label={m.settings}>
        {details ? <><a href="#general"><T value={m.general} /></a><a href="#connection"><T value={m.connection} /></a></> : null}
        <Link href="/admin/legal/impressum"><T value={m.operator} /></Link>
        <a href="#email"><T value={m.email} /></a>
        {translationSettings ? <a href="#translation"><T value={ui.contentTranslation.title} /></a> : null}
      </LocalizedRegion>
      <div className="settings-content">
        {details ? <section id="general"><SetupPreferences details={details} returnTo="/admin/settings" /></section> : null}
        {details ? <section id="connection"><ConnectionSettings status={details.status} /></section> : null}
        <section id="email"><MailSettings settings={settings} email={user?.email ?? ''} managed={details?.settings.filter(field => !field.editable).map(field => field.key)} returnTo="/admin/settings" /></section>
        {translationSettings ? <Card id="translation">
          <h2><T value={ui.contentTranslation.title} /></h2>
          <NavigatingActionForm action={saveContentTranslationSettingsAction} className="stack">
            <label htmlFor="translationProvider"><T value={ui.contentTranslation.adminProvider} /></label>
            <select id="translationProvider" name="provider" defaultValue={translationSettings.provider}>
              <option value="off"><T value={ui.contentTranslation.disabled} /></option>
              <option value="google">Google Translate</option>
              <option value="deepl">DeepL</option>
            </select>
            <label htmlFor="sharedApiKey"><T value={ui.contentTranslation.sharedKey} /></label>
            <input id="sharedApiKey" name="sharedApiKey" type="password" autoComplete="off" />
            {translationSettings.sharedKeyConfigured ? <label><input type="checkbox" name="clearSharedApiKey" /> <T value={ui.contentTranslation.clearSharedKey} /></label> : null}
            {translationSettings.sharedKeyConfigured ? <p><T value={ui.contentTranslation.keyConfigured} /></p> : null}
            <p><T value={ui.contentTranslation.quota} />: {translationSettings.sharedGoogleCharactersUsed.toLocaleString()} / {translationSettings.sharedGoogleCharacterLimit.toLocaleString()}</p>
            <Button variant="primary"><T value={ui.contentTranslation.saveAdmin} /></Button>
          </NavigatingActionForm>
        </Card> : null}
      </div>
    </div>
  </PageMain>;
}
