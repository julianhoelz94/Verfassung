import { T } from '../../../components/TranslationProvider';
import { Stack } from '../../../components/layout/Layout';
import { ui } from '../../../../lib/messages';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AdminForbidden } from '../../../components/AdminForbidden';
import { Alert, PageHeader } from '../../../components/ui';
import { WorkspacePage } from '../../../components/layout/templates';
import { loadCountriesWithDetails, getConstitutionSettings } from '../../../../lib/api';
import { requireAdminPage } from '../../../../lib/admin';
import { toOutlineKindWrite } from '../../../../lib/outline';
import { restoreOutlineAction } from '../actions';
import { OutlineEditor } from '../OutlineEditor';
import { DocumentLinks } from '../../../editor/documents/DocumentLinks';
import { requireSessionBearer } from '../../../../lib/session';
import surfaceStyles from '../../../components/surfaces.module.css';

type AdminOutlinePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; migration?: string; documentError?: string }>;
};

export default async function AdminOutlinePage(props: AdminOutlinePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  if (!(await requireAdminPage(`/admin/constitutions/${encodeURIComponent(params.id)}`, searchParams))) {
    return <AdminForbidden title={ui.forbidden.outline} />;
  }
  const authorization = await requireSessionBearer();
  const { details } = await loadCountriesWithDetails(authorization);
  const match = details
    .flatMap((country) =>
      (country?.constitutions ?? []).map((constitution) => ({ country, constitution })),
    )
    .find((row) => row.constitution.id === params.id);
  if (!match) {
    notFound();
  }
  const settings = await getConstitutionSettings(params.id, authorization);
  const kinds = (match.constitution.contentOutline?.kinds ?? []).map(toOutlineKindWrite);
  return (
    <WorkspacePage width="content" header={<PageHeader
        breadcrumbs={[
          { href: '/admin', label: <T value={ui.nav.admin} /> },
          { href: '/admin/constitutions', label: <T value={ui.nav.outlines} /> },
          { label: match.constitution.title },
        ]}
        title={match.constitution.title}
        meta={match.country?.name}
      />}>

      {searchParams.saved ? (
        <Alert tone="success"><T value={ui.admin.constitutions.id.page.settingsSavedHistoricalVersionsRetainTheirStructural} /></Alert>
      ) : null}
      {(match.constitution.versions ?? []).length === 0 ? <Alert tone="info"><T value={ui.admin.constitutions.id.page.theStructureIsReady} />{" "}<Link href="/admin/import"><T value={ui.admin.constitutions.id.page.importTheFirstVersion} /></Link> <T value={ui.admin.constitutions.id.page.or} />{" "}<Link href="/editor"><T value={ui.admin.constitutions.id.page.openTheEditor} /></Link> <T value={ui.admin.constitutions.id.page.toContinue} /></Alert> : null}
      {searchParams.migration ? <Alert tone="error"><T value={ui.admin.constitutions.id.page.thisChangeRequiresAReviewedSuccessorMigration} /></Alert> : null}
      {searchParams.error ? <Alert tone="error"><T value={ui.admin.constitutions.id.page.theOutlineCouldNotBeSaved} /></Alert> : null}
      {searchParams.documentError ? <Alert tone="error"><T value={ui.admin.constitutions.id.page.theDocumentLinkCouldNotBeChanged} /></Alert> : null}
      <p>
        <T value={ui.admin.constitutions.id.page.depthIsTheNumberOfLayersThe} />{" "}</p>
      <OutlineEditor constitutionId={params.id} initial={kinds} settingsRevisionId={settings.id} />
      <DocumentLinks targetType="constitution" targetId={params.id} returnTo={`/admin/constitutions/${params.id}`} canEdit />
      {settings.predecessorId ? <Stack as="form" action={restoreOutlineAction} className={["card", surfaceStyles.card].join(' ')}>
        <h2><T value={ui.admin.constitutions.id.page.settingsHistory} /></h2><p><T value={ui.admin.constitutions.id.page.restoreThePreviousRevisionAfterCheckingIts} /></p>
        <input type="hidden" name="constitutionId" value={params.id} />
        <input type="hidden" name="settingsRevisionId" value={settings.id} />
        <input type="hidden" name="revisionId" value={settings.predecessorId} />
        <button type="submit"><T value={ui.admin.constitutions.id.page.restorePreviousSettings} /></button>
      </Stack> : null}
    </WorkspacePage>
  );
}
