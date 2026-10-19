import { reviewUi } from '../../../lib/ui-review-messages';
import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { PageMain } from '../../components/PageMain';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { requireAdminPage } from '../../../lib/admin';
import { requestIdentitySettings } from '../../../lib/identity-client';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';
import { saveIdentitySettingsAction, sendTestMailAction, saveContentTranslationSettingsAction } from './actions';
import { translationSiteSettings } from '../../../lib/content-translation';

export default async function IdentitySettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; tested?: string }> }) {
  const params = await searchParams;
  if (!(await requireAdminPage())) return <AdminForbidden title={ui.forbidden.accountSettings} />;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await currentUser();
  const settings = token ? await requestIdentitySettings(token).catch(() => null) : null;
  const translationSettings = token ? await translationSiteSettings(token).catch(() => null) : null;
  return <PageMain className="wide settings-page">
    <PageHeader title={<T value={reviewUi.siteSettings} />} meta={<T value={reviewUi.siteSettingsHint} />} />
    {params.error ? <Alert tone="error"><T value={params.error === 'test' ? ui.adminSettingsDynamic.mailTestFailed : ui.adminSettingsDynamic.saveFailed} /></Alert> : null}
    {params.saved ? <Alert tone="success"><T value={ui.admin.settings.page.settingsSaved} /></Alert> : null}
    {params.tested ? <Alert tone="success"><T value={ui.admin.settings.page.testEmailSent} /></Alert> : null}
    {!settings ? <Alert tone="error"><T value={ui.admin.settings.page.accountSettingsCouldNotBeLoaded} /></Alert> : <>
      <Card><NavigatingActionForm action={saveIdentitySettingsAction} className="settings-form">
        <fieldset>
        <legend><T value={ui.admin.settings.page.registration} /></legend>
        <label><input type="checkbox" name="selfRegistrationEnabled" defaultChecked={settings.selfRegistrationEnabled} /> <T value={ui.admin.settings.page.allowPeopleToRegisterThemselves} /></label>
        <p className="muted"><T value={reviewUi.registrationHint} /></p>
        </fieldset>
        <fieldset>
        <legend><T value={ui.admin.settings.page.outgoingMail} /></legend>
        <label><input type="checkbox" name="mailEnabled" defaultChecked={settings.mailEnabled} /> <T value={ui.admin.settings.page.enableOutgoingMail} /></label>
        <div className="form-grid">
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelFrom} />} id="mailFrom" name="mailFrom" type="email" defaultValue={settings.mailFrom} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSender} />} id="mailFromName" name="mailFromName" defaultValue={settings.mailFromName} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelPublic} />} id="mailPublicBaseUrl" name="mailPublicBaseUrl" type="url" defaultValue={settings.mailPublicBaseUrl} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP} />} id="smtpHost" name="smtpHost" defaultValue={settings.smtpHost} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP2} />} id="smtpPort" name="smtpPort" type="number" min={1} max={65535} defaultValue={settings.smtpPort} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP3} />} id="smtpUsername" name="smtpUsername" defaultValue={settings.smtpUsername} />
        <Input label={<T value={settings.smtpPasswordSet ? ui.adminSettingsDynamic.newSmtpPassword : ui.adminSettingsDynamic.smtpPassword} />} id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" />
        </div>
        <div className="form-actions">
        <label><input type="checkbox" name="smtpAuth" defaultChecked={settings.smtpAuth} /> <T value={ui.admin.settings.page.smtpAuthentication} /></label>
        <label><input type="checkbox" name="smtpStarttls" defaultChecked={settings.smtpStarttls} /> <T value={ui.admin.settings.page.starttls} /></label>
        <label><input type="checkbox" name="smtpSsl" defaultChecked={settings.smtpSsl} /> <T value={ui.admin.settings.page.implicitTls} /></label>
        </div>
        </fieldset>
        <div className="form-actions"><Button variant="primary"><T value={reviewUi.saveRegistrationMail} /></Button></div>
      </NavigatingActionForm></Card>
      <Card><h2 className="card-title"><T value={ui.admin.settings.page.testMail} /></h2>
        <p><T value={ui.admin.settings.page.sendATestMessageToAnyAddress} /></p>
        <NavigatingActionForm action={sendTestMailAction}>
          <Input label={<T value={ui.attrs.adminSettingsPageInputLabelRecipient} />} id="test-mail-to" name="to" type="email" required defaultValue={user?.email ?? ''} />
          <Button><T value={ui.admin.settings.page.sendTestEmail} /></Button>
        </NavigatingActionForm>
      </Card>
    </>}
    {translationSettings ? <Card>
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
  </PageMain>;
}
