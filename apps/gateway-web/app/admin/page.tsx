import Link from 'next/link';
import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { reviewUi } from '../../lib/ui-review-messages';
import { AdminForbidden } from '../components/AdminForbidden';
import { PageMain } from '../components/PageMain';
import { Card, PageHeader } from '../components/ui';
import { requireAdminPage } from '../../lib/admin';

export default async function AdminIndexPage() {
  if (!(await requireAdminPage())) return <AdminForbidden title={ui.forbidden.admin} />;
  const groups = [
    { title: reviewUi.peopleAccess, links: [
      { href: '/admin/users', title: ui.admin.page.users, hint: ui.admin.page.inviteAccountsSetRolesAndRevokeSessions },
      { href: '/admin/anonymous-browsing', title: ui.admin.page.anonymousBrowsing, hint: ui.admin.page.controlVisitorAccessAndApiCallRates },
      { href: '/admin/settings', title: reviewUi.siteSettings, hint: reviewUi.siteSettingsHint },
    ] },
    { title: reviewUi.contentManagement, links: [
      { href: '/admin/constitutions', title: ui.admin.page.outlines, hint: ui.admin.page.createConstitutionsAndEditTheirSectionOutline },
      { href: '/admin/import', title: ui.admin.page.import, hint: ui.admin.page.loadAJsonCorpusAndFollowThe },
      { href: '/admin/legal/impressum', title: reviewUi.legalPages, hint: ui.attrs.adminLegalKeyPagePageHeaderMeta },
    ] },
  ];
  return <PageMain className="wide">
    <PageHeader title={<T value={ui.attrs.adminPagePageHeaderTitleAdmin} />} meta={<T value={reviewUi.adminHint} />} />
    {groups.map(group => <section key={group.title.en}>
      <h2 className="section-title"><T value={group.title} /></h2>
      <div className="card-grid admin-grid">{group.links.map(link => <Card key={link.href}>
        <h3 className="card-title"><Link href={link.href}><T value={link.title} /></Link></h3>
        <p className="muted"><T value={link.hint} /></p>
      </Card>)}</div>
    </section>)}
  </PageMain>;
}
