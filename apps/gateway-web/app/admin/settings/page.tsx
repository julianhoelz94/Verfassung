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
    <PageHeader title="Account settings" meta="Control registration and outbound email." />
    {params.error ? <Alert tone="error">{params.error === 'test' ? 'Test email could not be delivered. Check the settings and SMTP service.' : 'Settings could not be saved. Check the values and try again.'}</Alert> : null}
    {params.saved ? <Alert tone="success">Settings saved.</Alert> : null}
    {params.tested ? <Alert tone="success">Test email sent.</Alert> : null}
    {!settings ? <Alert tone="error">Account settings could not be loaded.</Alert> : <>
      <Card><form action={saveIdentitySettingsAction}>
        <h2 className="card-title">Registration</h2>
        <label><input type="checkbox" name="selfRegistrationEnabled" defaultChecked={settings.selfRegistrationEnabled} /> Allow people to register themselves</label>
        <p className="muted">Off by default. New accounts receive only the viewer role and must confirm their email.</p>
        <h2 className="card-title">Outgoing mail</h2>
        <label><input type="checkbox" name="mailEnabled" defaultChecked={settings.mailEnabled} /> Enable outgoing mail</label>
        <Input label="From address" id="mailFrom" name="mailFrom" type="email" defaultValue={settings.mailFrom} />
        <Input label="Sender name" id="mailFromName" name="mailFromName" defaultValue={settings.mailFromName} />
        <Input label="Public site URL" id="mailPublicBaseUrl" name="mailPublicBaseUrl" type="url" defaultValue={settings.mailPublicBaseUrl} />
        <Input label="SMTP host" id="smtpHost" name="smtpHost" defaultValue={settings.smtpHost} />
        <Input label="SMTP port" id="smtpPort" name="smtpPort" type="number" min={1} max={65535} defaultValue={settings.smtpPort} />
        <Input label="SMTP username" id="smtpUsername" name="smtpUsername" defaultValue={settings.smtpUsername} />
        <Input label={settings.smtpPasswordSet ? 'New SMTP password (leave blank to keep current)' : 'SMTP password'} id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" />
        <label><input type="checkbox" name="smtpAuth" defaultChecked={settings.smtpAuth} /> SMTP authentication</label>
        <label><input type="checkbox" name="smtpStarttls" defaultChecked={settings.smtpStarttls} /> STARTTLS</label>
        <label><input type="checkbox" name="smtpSsl" defaultChecked={settings.smtpSsl} /> Implicit TLS</label>
        <Button variant="primary">Save settings</Button>
      </form></Card>
      <Card><h2 className="card-title">Test mail</h2>
        <p>Send a test message to any address after saving the settings.</p>
        <form action={sendTestMailAction}>
          <Input label="Recipient" id="test-mail-to" name="to" type="email" required defaultValue={user?.email ?? ''} />
          <Button>Send test email</Button>
        </form>
      </Card>
    </>}
  </PageMain>;
}
