import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AdminForbidden } from '../../../components/AdminForbidden';
import { Alert, PageHeader } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { loadCountriesWithDetails, getConstitutionSettings } from '../../../../lib/api';
import { requireAdminPage } from '../../../../lib/admin';
import { toOutlineKindWrite } from '../../../../lib/outline';
import { restoreOutlineAction } from '../actions';
import { OutlineEditor } from '../OutlineEditor';
import { DocumentLinks } from '../../../editor/documents/DocumentLinks';

type AdminOutlinePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; migration?: string; documentError?: string }>;
};

export default async function AdminOutlinePage(props: AdminOutlinePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  if (!(await requireAdminPage())) {
    return <AdminForbidden title="Outline" />;
  }
  const { details } = await loadCountriesWithDetails();
  const match = details
    .flatMap((country) =>
      (country?.constitutions ?? []).map((constitution) => ({ country, constitution })),
    )
    .find((row) => row.constitution.id === params.id);
  if (!match) {
    notFound();
  }
  const settings = await getConstitutionSettings(params.id);
  const kinds = (match.constitution.contentOutline?.kinds ?? []).map(toOutlineKindWrite);
  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/admin', label: 'Admin' },
          { href: '/admin/constitutions', label: 'Outlines' },
          { label: match.constitution.title },
        ]}
        title={match.constitution.title}
        meta={match.country?.name}
      />
      {searchParams.saved ? (
        <Alert tone="success">Settings saved. Historical versions retain their structural settings.</Alert>
      ) : null}
      {(match.constitution.versions ?? []).length === 0 ? <Alert tone="info">The structure is ready. <Link href="/admin/import">Import the first version</Link> or <Link href="/editor">open the editor</Link> to continue.</Alert> : null}
      {searchParams.migration ? <Alert tone="error">This change requires a reviewed successor migration. Existing versions have been preserved.</Alert> : null}
      {searchParams.error ? <Alert tone="error">The outline could not be saved.</Alert> : null}
      {searchParams.documentError ? <Alert tone="error">The document link could not be changed. Reload and try again.</Alert> : null}
      <p>
        Depth is the number of layers. The top layer is the provision the public table of contents lists. A concatenated
        layer (typical for sentences) has no heading and is joined with its siblings.
      </p>
      <OutlineEditor constitutionId={params.id} initial={kinds} settingsRevisionId={settings.id} />
      <DocumentLinks targetType="constitution" targetId={params.id} returnTo={`/admin/constitutions/${params.id}`} canEdit />
      {settings.predecessorId ? <form action={restoreOutlineAction} className="card">
        <h2>Settings history</h2><p>Restore the previous revision after checking its impact on stored content.</p>
        <input type="hidden" name="constitutionId" value={params.id} />
        <input type="hidden" name="settingsRevisionId" value={settings.id} />
        <input type="hidden" name="revisionId" value={settings.predecessorId} />
        <button type="submit">Restore previous settings</button>
      </form> : null}
    </PageMain>
  );
}
