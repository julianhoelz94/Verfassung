import { notFound, redirect } from 'next/navigation';
import { Alert } from '../../../components/ui';
import { PageMain } from '../../../components/PageMain';
import { getCountry, listCountries } from '../../../../lib/api';
import { canVisitAdmin } from '../../../../lib/nav';
import { toOutlineKindWrite } from '../../../../lib/outline';
import { currentUser } from '../../../../lib/session';
import { OutlineEditor } from '../OutlineEditor';

type AdminOutlinePageProps = {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
};

export default async function AdminOutlinePage({ params, searchParams }: AdminOutlinePageProps) {
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitAdmin(user.roles)) {
    return (
      <PageMain>
        <h1>Outline</h1>
        <Alert tone="error">Administrator role required.</Alert>
      </PageMain>
    );
  }
  const countries = (await listCountries().catch(() => [])) ?? [];
  const details = await Promise.all(countries.map((country) => getCountry(country.isoCode).catch(() => null)));
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
