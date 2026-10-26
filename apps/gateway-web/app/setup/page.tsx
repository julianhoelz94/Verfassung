import { LocalizedRegion } from '../components/LocalizedRegion';
import { NavigatingActionForm } from '../components/NavigatingActionForm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSessionBearer } from '../../lib/session';
import { requireAdminPage } from '../../lib/admin';
import { setupRequest, type SetupDetails } from '../../lib/deployment-setup';
import { requestIdentitySettings } from '../../lib/identity-client';
import { setupMessages as m, requiredMessages } from '../../lib/setup-messages';
import { T } from '../components/TranslationProvider';
import { Alert, Button, Card, PageHeader } from '../components/ui';
import { SettingsPage } from '../components/layout/templates';
import { SetupPreferences } from './SetupPreferences';
import { ConnectionSettings } from './ConnectionSettings';
import { MailSettings } from '../admin/settings/MailSettings';
import { completeSetup } from './actions';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; tested?: string }>;
}) {
  const admin = await requireAdminPage();
  if (!admin) redirect('/login');
  const bearer = await requireSessionBearer();
  const details = await setupRequest<SetupDetails>('/setup', bearer);
  if (details.status.completed) redirect('/admin/settings');
  const settings = await requestIdentitySettings(bearer.replace(/^Bearer /, ''));
  const params = await searchParams;
  return (
    <SettingsPage
      header={<PageHeader title={<T value={m.title} />} meta={<T value={m.introduction} />} />}
      navigation={
        <LocalizedRegion as="nav" className="section-nav" label={m.progress}>
          <a href="#connection">
            <T value={m.connection} />
          </a>
          <a href="#preferences">
            <T value={m.general} />
          </a>
          <a href="#operator">
            <T value={m.operator} />
          </a>
          <a href="#email">
            <T value={m.email} />
          </a>
          <a href="#review">
            <T value={m.review} />
          </a>
        </LocalizedRegion>
      }
    >
      {params.error ? (
        <Alert tone="error">
          <T value={m.error} />{' '}
          <a href="/account/step-up?returnTo=%2Fsetup">
            <T value={m.stepUp} />
          </a>
        </Alert>
      ) : null}

      {params.saved || params.tested ? (
        <Alert tone="success">
          <T value={m.saved} />
        </Alert>
      ) : null}

      <section id="connection">
        <ConnectionSettings status={details.status} />
      </section>

      <section id="preferences">
        <SetupPreferences details={details} returnTo="/setup" />
      </section>

      <section id="operator">
        <Card>
          <h2>
            <T value={m.operator} />
          </h2>
          <p>
            <T value={m.legalHint} />
          </p>
          <ul>
            <li>
              <Link href="/admin/legal/impressum">
                <T value={m.imprint} />
              </Link>
            </li>
            <li>
              <Link href="/admin/legal/datenschutz">
                <T value={m.privacy} />
              </Link>
            </li>
            {details.languages.enabled.includes('en') ? (
              <>
                <li>
                  <Link href="/admin/legal/impressum_en">
                    <T value={m.englishImprint} />
                  </Link>
                </li>
                <li>
                  <Link href="/admin/legal/datenschutz_en">
                    <T value={m.englishPrivacy} />
                  </Link>
                </li>
              </>
            ) : null}
          </ul>
        </Card>
      </section>

      <section id="email">
        <MailSettings
          settings={settings}
          email={admin.email}
          mailDeferred={details.preferences.mailDeferred}
          managed={details.settings.filter((field) => !field.editable).map((field) => field.key)}
          returnTo="/setup"
        />
      </section>

      <section id="review">
        <Card>
          <h2>
            <T value={m.review} />
          </h2>
          <p>
            <T value={m.reviewHint} />
          </p>
          {details.required.length ? (
            <>
              <h3>
                <T value={m.required} />
              </h3>
              <ul>
                {details.required.map((key) => (
                  <li key={key}>
                    <T value={requiredMessages[key] ?? m.required} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <NavigatingActionForm action={completeSetup}>
            <Button variant="primary" disabled={details.required.length > 0}>
              <T value={m.finish} />
            </Button>
          </NavigatingActionForm>
        </Card>
      </section>
    </SettingsPage>
  );
}
