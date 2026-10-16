import { T, ui } from '../../components/TranslationProvider';
import { cookies } from 'next/headers';
import { AdminForbidden } from '../../components/AdminForbidden';
import { PageMain } from '../../components/PageMain';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui';
import { requireAdminPage } from '../../../lib/admin';
import { requestIdentitySettings } from '../../../lib/identity-client';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';
import { saveIdentitySettingsAction, sendTestMailAction } from './actions';

export default async function IdentitySettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; tested?: string }> }) {
  const params = await searchParams;
  if (!(await requireAdminPage())) return <AdminForbidden title="Account settings" />;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await currentUser();
  const settings = token ? await requestIdentitySettings(token).catch(() => null) : null;
  return <PageMain>
    <PageHeader title={<T value={ui.attrs.adminSettingsPagePageHeaderTitleAccount} />} meta={<T value={ui.attrs.adminSettingsPagePageHeaderMetaControl} />} />
    {params.error ? <Alert tone="error">{params.error === 'test' ? 'Test email could not be delivered. Check the settings and SMTP service.' : 'Settings could not be saved. Check the values and try again.'}</Alert> : null}
    {params.saved ? <Alert tone="success"><T value={ui.admin.settings.page.settingsSaved} /></Alert> : null}
    {params.tested ? <Alert tone="success"><T value={ui.admin.settings.page.testEmailSent} /></Alert> : null}
    {!settings ? <Alert tone="error"><T value={ui.admin.settings.page.accountSettingsCouldNotBeLoaded} /></Alert> : <>
      <Card><form action={saveIdentitySettingsAction}>
        <h2 className="card-title"><T value={ui.admin.settings.page.registration} /></h2>
        <label><input type="checkbox" name="selfRegistrationEnabled" defaultChecked={settings.selfRegistrationEnabled} /> <T value={ui.admin.settings.page.allowPeopleToRegisterThemselves} /></label>
        <p className="muted"><T value={ui.admin.settings.page.offByDefaultNewAccountsReceiveOnly} /></p>
        <h2 className="card-title"><T value={ui.admin.settings.page.outgoingMail} /></h2>
        <label><input type="checkbox" name="mailEnabled" defaultChecked={settings.mailEnabled} /> <T value={ui.admin.settings.page.enableOutgoingMail} /></label>
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelFrom} />} id="mailFrom" name="mailFrom" type="email" defaultValue={settings.mailFrom} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSender} />} id="mailFromName" name="mailFromName" defaultValue={settings.mailFromName} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelPublic} />} id="mailPublicBaseUrl" name="mailPublicBaseUrl" type="url" defaultValue={settings.mailPublicBaseUrl} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP} />} id="smtpHost" name="smtpHost" defaultValue={settings.smtpHost} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP2} />} id="smtpPort" name="smtpPort" type="number" min={1} max={65535} defaultValue={settings.smtpPort} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP3} />} id="smtpUsername" name="smtpUsername" defaultValue={settings.smtpUsername} />
        <Input label={settings.smtpPasswordSet ? 'New SMTP password (leave blank to keep current)' : 'SMTP password'} id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" />
        <label><input type="checkbox" name="smtpAuth" defaultChecked={settings.smtpAuth} /> <T value={ui.admin.settings.page.smtpAuthentication} /></label>
        <label><input type="checkbox" name="smtpStarttls" defaultChecked={settings.smtpStarttls} /> <T value={ui.admin.settings.page.starttls} /></label>
        <label><input type="checkbox" name="smtpSsl" defaultChecked={settings.smtpSsl} /> <T value={ui.admin.settings.page.implicitTls} /></label>
        <Button variant="primary"><T value={ui.admin.settings.page.saveSettings} /></Button>
      </form></Card>
      <Card><h2 className="card-title"><T value={ui.admin.settings.page.testMail} /></h2>
        <p><T value={ui.admin.settings.page.sendATestMessageToAnyAddress} /></p>
        <form action={sendTestMailAction}>
          <Input label={<T value={ui.attrs.adminSettingsPageInputLabelRecipient} />} id="test-mail-to" name="to" type="email" required defaultValue={user?.email ?? ''} />
          <Button><T value={ui.admin.settings.page.sendTestEmail} /></Button>
        </form>
      </Card>
    </>}
  </PageMain>;
}
