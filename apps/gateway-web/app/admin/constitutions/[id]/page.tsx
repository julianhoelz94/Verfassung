import { notFound } from 'next/navigation';
import { AdminForbidden } from '../../../components/AdminForbidden';
import { Alert } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { loadCountriesWithDetails } from '../../../../lib/api';
import { requireAdminPage } from '../../../../lib/admin';
import { toOutlineKindWrite } from '../../../../lib/outline';
import { OutlineEditor } from '../OutlineEditor';

type AdminOutlinePageProps = {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
};

export default async function AdminOutlinePage({ params, searchParams }: AdminOutlinePageProps) {
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
  const kinds = (match.constitution.contentOutline?.kinds ?? []).map(toOutlineKindWrite);
  return (
    <PageMain>
      <h1>{match.constitution.title}</h1>
      <p className="muted">{match.country?.name}</p>
      {searchParams.saved ? (
        <Alert tone="success">Outline saved. Existing versions were restructured if layers were removed.</Alert>
      ) : null}
      {searchParams.error ? <Alert tone="error">The outline could not be saved.</Alert> : null}
      <p>
        Depth is the number of layers. The top layer is the provision the public table of contents lists. A concatenated
        layer (typical for sentences) has no heading and is joined with its siblings.
      </p>
      <OutlineEditor constitutionId={params.id} initial={kinds} />
    </PageMain>
  );
}
