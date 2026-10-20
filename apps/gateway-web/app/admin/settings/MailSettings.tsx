'use client';

import { useState } from 'react';
import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { Alert, Button, Card, Input } from '../../components/ui';
import { reviewUi } from '../../../lib/ui-review-messages';
import { setupMessages as m } from '../../../lib/setup-messages';
import type { IdentitySettings } from '../../../lib/identity-client';
import { saveIdentitySettingsAction, sendTestMailAction } from './actions';
import { Grid, Inline, Stack } from '../../components/layout/Layout';

export function MailSettings({ settings, email, mailDeferred, managed = [], returnTo }: { settings: IdentitySettings | null; email: string; mailDeferred?: boolean; managed?: string[]; returnTo: '/setup' | '/admin/settings' }) {
  const [deferred, setDeferred] = useState(mailDeferred ?? false);
  const [mailEnabled, setMailEnabled] = useState(settings?.mailEnabled ?? false);
  const [registration, setRegistration] = useState(settings?.selfRegistrationEnabled ?? false);
  const [smtpAuth, setSmtpAuth] = useState(settings?.smtpAuth ?? false);
  const outgoingEnabled = !deferred && mailEnabled;
  const managedRegistration = managed.includes('selfRegistrationEnabled') && settings?.selfRegistrationEnabled;
  const testAvailable = outgoingEnabled && settings?.mailEnabled && !mailDeferred;
  return <Stack gap="card">
    {managed.length ? <Alert><T value={m.managed} />. <T value={{ en: 'Deployment-managed fields are disabled below.', de: 'Durch die Bereitstellung verwaltete Felder sind unten deaktiviert.' }} /></Alert> : null}
    {!settings ? <Alert tone="error"><T value={ui.admin.settings.page.accountSettingsCouldNotBeLoaded} /></Alert> : <>
      <Card><h2><T value={m.email} /></h2><p><T value={m.emailHint} /></p>
      <NavigatingActionForm action={saveIdentitySettingsAction} className="settings-form">
        <input type="hidden" name="returnTo" value={returnTo} />
        {mailDeferred !== undefined ? <div>
          <input type="hidden" name="hasMailDeferredPreference" value="true" />
          <label><input type="checkbox" name="mailDeferred" checked={deferred} disabled={Boolean(managedRegistration) && !deferred} onChange={event => {
            setDeferred(event.target.checked);
            if (event.target.checked) setRegistration(false);
          }} /> <T value={m.deferEmail} /></label>
          <p className="muted"><T value={m.deferHint} /></p>
        </div> : null}
        {managedRegistration ? <Alert><T value={m.managedRegistration} /></Alert> : null}
        <fieldset><legend><T value={ui.admin.settings.page.outgoingMail} /></legend>
        {outgoingEnabled && (managed.includes('mailEnabled') || managedRegistration) ? <input type="hidden" name="mailEnabled" value="on" /> : null}
        <label><input type="checkbox" name="mailEnabled" disabled={deferred || managed.includes('mailEnabled') || (Boolean(managedRegistration) && outgoingEnabled)} checked={outgoingEnabled} onChange={event => {
          setMailEnabled(event.target.checked);
          if (!event.target.checked) setRegistration(false);
        }} /> <T value={ui.admin.settings.page.enableOutgoingMail} /></label>
        <Grid variant="form" columns={2} className="form-grid">
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelFrom} />} id="mailFrom" name="mailFrom" disabled={!outgoingEnabled || managed.includes('mailFrom')} type="email" required defaultValue={settings.mailFrom} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSender} />} id="mailFromName" name="mailFromName" disabled={!outgoingEnabled || managed.includes('mailFromName')} defaultValue={settings.mailFromName} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelPublic} />} id="mailPublicBaseUrl" name="mailPublicBaseUrl" disabled={!outgoingEnabled || managed.includes('mailPublicBaseUrl')} type="url" required defaultValue={settings.mailPublicBaseUrl} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP} />} id="smtpHost" name="smtpHost" disabled={!outgoingEnabled || managed.includes('smtpHost')} required defaultValue={settings.smtpHost} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP2} />} id="smtpPort" name="smtpPort" disabled={!outgoingEnabled || managed.includes('smtpPort')} type="number" min={1} max={65535} required defaultValue={settings.smtpPort} />
        <Input label={<T value={ui.attrs.adminSettingsPageInputLabelSMTP3} />} id="smtpUsername" name="smtpUsername" disabled={!outgoingEnabled || managed.includes('smtpUsername')} required={smtpAuth} defaultValue={settings.smtpUsername} />
        <Input label={<T value={settings.smtpPasswordSet ? ui.adminSettingsDynamic.newSmtpPassword : ui.adminSettingsDynamic.smtpPassword} />} id="smtpPassword" name="smtpPassword" disabled={!outgoingEnabled || managed.includes('smtpPassword')} required={smtpAuth && !settings.smtpPasswordSet} type="password" autoComplete="new-password" />
        </Grid>
        <Inline className="form-actions">
        <label><input type="checkbox" name="smtpAuth" disabled={!outgoingEnabled || managed.includes('smtpAuth')} checked={smtpAuth} onChange={event => setSmtpAuth(event.target.checked)} /> <T value={ui.admin.settings.page.smtpAuthentication} /></label>
        <label><input type="checkbox" name="smtpStarttls" disabled={!outgoingEnabled || managed.includes('smtpStarttls')} defaultChecked={settings.smtpStarttls} /> <T value={ui.admin.settings.page.starttls} /></label>
        <label><input type="checkbox" name="smtpSsl" disabled={!outgoingEnabled || managed.includes('smtpSsl')} defaultChecked={settings.smtpSsl} /> <T value={ui.admin.settings.page.implicitTls} /></label>
        </Inline></fieldset>
        <fieldset><legend><T value={ui.admin.settings.page.registration} /></legend>
        <label><input type="checkbox" name="selfRegistrationEnabled" disabled={!outgoingEnabled || managed.includes('selfRegistrationEnabled')} checked={outgoingEnabled && registration} onChange={event => setRegistration(event.target.checked)} /> <T value={ui.admin.settings.page.allowPeopleToRegisterThemselves} /></label>
        <p className="muted"><T value={outgoingEnabled ? reviewUi.registrationHint : m.registrationNeedsMail} /></p></fieldset>
        <Inline className="form-actions"><Button variant="primary"><T value={reviewUi.saveRegistrationMail} /></Button></Inline>
      </NavigatingActionForm></Card>
      <Card><h2 className="card-title"><T value={ui.admin.settings.page.testMail} /></h2>
        <p><T value={ui.admin.settings.page.sendATestMessageToAnyAddress} /></p>
        {!testAvailable ? <p><T value={m.saveMailBeforeTest} /></p> : null}
        <NavigatingActionForm action={sendTestMailAction}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <Input label={<T value={ui.attrs.adminSettingsPageInputLabelRecipient} />} id="test-mail-to" name="to" type="email" required disabled={!testAvailable} defaultValue={email} />
          <Button disabled={!testAvailable}><T value={ui.admin.settings.page.sendTestEmail} /></Button>
        </NavigatingActionForm>
      </Card>
    </>}
  </Stack>;
}
