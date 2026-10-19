import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { Alert, Button, Card, Input } from '../../components/ui';
import { setupMessages as m } from '../../../lib/setup-messages';
import type { IdentitySettings } from '../../../lib/identity-client';
import { saveIdentitySettingsAction, sendTestMailAction } from './actions';

export function MailSettings({ settings, email, managed = [], returnTo }: { settings: IdentitySettings | null; email: string; managed?: string[]; returnTo: '/setup' | '/admin/settings' }) {
  return <>
    {managed.length ? <Alert><T value={m.managed} />. <T value={{ en: 'Deployment-managed fields are disabled below.', de: 'Durch die Bereitstellung verwaltete Felder sind unten deaktiviert.' }} /></Alert> : null}
    {!settings ? <Alert tone="error"><T value={ui.admin.settings.page.accountSettingsCouldNotBeLoaded} /></Alert> : <>
      <Card><NavigatingActionForm action={saveIdentitySettingsAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <h2 className="card-title"><T value={ui.admin.settings.page.registration} /></h2>
        <label><input type="checkbox" name="selfRegistrationEnabled" disabled={managed.includes('selfRegistrationEnabled')} defaultChecked={settings.selfRegistrationEnabled} /> <T value={ui.admin.settings.page.allowPeopleToRegisterThemselves} /></label>
        <p className="muted"><T value={ui.admin.settings.page.offByDefaultNewAccountsReceiveOnly} /></p>
        <h2 className="card-title"><T value={ui.admin.settings.page.outgoingMail} /></h2>
        <label><input type="checkbox" name="mailEnabled" disabled={managed.includes('mailEnabled')} defaultChecked={settings.mailEnabled} /> <T value={ui.admin.settings.page.enableOutgoingMail} /></label>
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelFrom} />} id="mailFrom" name="mailFrom" disabled={managed.includes('mailFrom')} type="email" defaultValue={settings.mailFrom} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSender} />} id="mailFromName" name="mailFromName" disabled={managed.includes('mailFromName')} defaultValue={settings.mailFromName} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelPublic} />} id="mailPublicBaseUrl" name="mailPublicBaseUrl" disabled={managed.includes('mailPublicBaseUrl')} type="url" defaultValue={settings.mailPublicBaseUrl} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP} />} id="smtpHost" name="smtpHost" disabled={managed.includes('smtpHost')} defaultValue={settings.smtpHost} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP2} />} id="smtpPort" name="smtpPort" disabled={managed.includes('smtpPort')} type="number" min={1} max={65535} defaultValue={settings.smtpPort} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP3} />} id="smtpUsername" name="smtpUsername" disabled={managed.includes('smtpUsername')} defaultValue={settings.smtpUsername} />
        <Input label={<T value={settings.smtpPasswordSet ? ui.adminSettingsDynamic.newSmtpPassword : ui.adminSettingsDynamic.smtpPassword} />} id="smtpPassword" name="smtpPassword" disabled={managed.includes('smtpPassword')} type="password" autoComplete="new-password" />
        <label><input type="checkbox" name="smtpAuth" disabled={managed.includes('smtpAuth')} defaultChecked={settings.smtpAuth} /> <T value={ui.admin.settings.page.smtpAuthentication} /></label>
        <label><input type="checkbox" name="smtpStarttls" disabled={managed.includes('smtpStarttls')} defaultChecked={settings.smtpStarttls} /> <T value={ui.admin.settings.page.starttls} /></label>
        <label><input type="checkbox" name="smtpSsl" disabled={managed.includes('smtpSsl')} defaultChecked={settings.smtpSsl} /> <T value={ui.admin.settings.page.implicitTls} /></label>
        <Button variant="primary"><T value={ui.admin.settings.page.saveSettings} /></Button>
      </NavigatingActionForm></Card>
      <Card><h2 className="card-title"><T value={ui.admin.settings.page.testMail} /></h2>
        <p><T value={ui.admin.settings.page.sendATestMessageToAnyAddress} /></p>
        <NavigatingActionForm action={sendTestMailAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <Input label={<T value={ui.attrs.adminSettingsPageInputLabelRecipient} />} id="test-mail-to" name="to" type="email" required defaultValue={email} />
          <Button><T value={ui.admin.settings.page.sendTestEmail} /></Button>
        </NavigatingActionForm>
      </Card>
    </>}
  </>;
}
