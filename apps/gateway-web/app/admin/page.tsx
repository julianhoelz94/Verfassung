import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import Link from 'next/link';
import { AdminForbidden } from '../components/AdminForbidden';
import { PageMain } from '../components/PageMain';
import { Card, PageHeader } from '../components/ui';
import { requireAdminPage } from '../../lib/admin';

export default async function AdminIndexPage() {
  if (!(await requireAdminPage())) {
    return <AdminForbidden title={ui.forbidden.admin} />;
  }
  return (
    <PageMain>
      <PageHeader title={<T value={ui.attrs.adminPagePageHeaderTitleAdmin} />} meta={<T value={ui.attrs.adminPagePageHeaderMetaUserAccounts} />} />
      <div className="card-grid">
        <Card>
          <h2 className="card-title">
            <Link href="/admin/users"><T value={ui.admin.page.users} /></Link>
          </h2>
          <p className="muted"><T value={ui.admin.page.inviteAccountsSetRolesAndRevokeSessions} /></p>
        </Card>
        <Card>
          <h2 className="card-title"><Link href="/admin/settings"><T value={ui.admin.page.accountSettings} /></Link></h2>
          <p className="muted"><T value={ui.admin.page.controlRegistrationAndConfigureOutgoingMail} /></p>
        </Card>
        <Card>
          <h2 className="card-title"><Link href="/admin/anonymous-browsing"><T value={ui.admin.page.anonymousBrowsing} /></Link></h2>
          <p className="muted"><T value={ui.admin.page.controlVisitorAccessAndApiCallRates} /></p>
        </Card>
        <Card>
          <h2 className="card-title">
            <Link href="/admin/constitutions"><T value={ui.admin.page.outlines} /></Link>
          </h2>
          <p className="muted"><T value={ui.admin.page.createConstitutionsAndEditTheirSectionOutline} /></p>
        </Card>
        <Card>
          <h2 className="card-title">
            <Link href="/admin/import"><T value={ui.admin.page.import} /></Link>
          </h2>
          <p className="muted"><T value={ui.admin.page.loadAJsonCorpusAndFollowThe} /></p>
        </Card>
        <Card>
          <h2 className="card-title"><Link href="/admin/legal/impressum"><T value={ui.admin.page.legalPages} /></Link></h2>
          <p className="muted"><T value={ui.admin.page.editAndPublishThe} />{" "}<Link href="/admin/legal/impressum"><T value={ui.admin.page.impressum} /></Link> <T value={ui.admin.page.and} />{" "}<Link href="/admin/legal/datenschutz"><T value={ui.admin.page.datenschutzerklarung} /></Link>.</p>
        </Card>
      </div>
    </PageMain>
  );
}
