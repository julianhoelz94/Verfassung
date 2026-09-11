import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { PageMain } from '../../components/PageMain';
import { Alert, Badge, Button, DataList, DataRow, PageHeader, Select } from '../../components/ui';
import { FormattedDate } from '../../../lib/format-date';
import { getCountry, listConstitutionAmendments, listCountries, type Amendment, type ConstitutionSummary } from '../../../lib/api';
import { amendmentErrorMessage } from '../../../lib/amendment-editor-api';
import { canVisitEditor } from '../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';

type AmendmentsPageProps = {
  searchParams: Promise<{
    constitutionId?: string;
    saved?: string;
    published?: string;
    withdrawn?: string;
    error?: string;
  }>;
};

function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role) || roles.includes('admin');
}

function kindLabel(kind: string | undefined): string {
  switch (kind) {
    case 'legal_amendment':
      return 'Legal amendment';
    case 'official_errata':
      return 'Official errata';
    default:
      return kind ?? 'Unknown';
  }
}

function statusTone(status: string | undefined): 'added' | 'removed' | 'changed' {
  if (status === 'published') {
    return 'added';
  }
  if (status === 'withdrawn') {
    return 'removed';
  }
  return 'changed';
}

async function loadConstitutions(): Promise<ConstitutionSummary[]> {
  try {
    const countries = (await listCountries()) ?? [];
    const details = await Promise.all(countries.map((country) => getCountry(country.isoCode).catch(() => null)));
    return details.flatMap((country) => country?.constitutions ?? []);
  } catch {
    return [];
  }
}

export default async function AmendmentsPage(props: AmendmentsPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitEditor(user.roles)) {
    return (
      <PageMain className="wide">
        <PageHeader title="Amending laws" meta={`Signed in as ${user.email}, but this account has no editorial role.`} />
      </PageMain>
    );
  }

  const canEdit = hasRole(user.roles, 'editor');
  const constitutions = await loadConstitutions();
  const selectedConstitution =
    constitutions.find((constitution) => constitution.id === searchParams.constitutionId) ?? constitutions[0];
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  let amendments: Amendment[] = [];
  if (selectedConstitution && sessionToken) {
    try {
      amendments =
        (await listConstitutionAmendments(selectedConstitution.id, {
          status: 'all',
          authorization: `Bearer ${sessionToken}`,
        })) ?? [];
    } catch {
      amendments = [];
    }
  }

  const errorMessage = amendmentErrorMessage(searchParams.error);
  const newHref = selectedConstitution
    ? `/editor/amendments/new?constitutionId=${encodeURIComponent(selectedConstitution.id)}`
    : '/editor/amendments/new';

  return (
    <PageMain className="wide">
      <PageHeader
        title="Amending laws"
        eyebrow="Editorial workspace"
        meta={`Signed in as ${user.email}. Roles: ${user.roles.join(', ')}.`}
        actions={
          canEdit && selectedConstitution ? (
            <a className="btn btn-primary" href={newHref}>
              Add amending law
            </a>
          ) : null
        }
      />
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? <Alert tone="success">Draft saved.</Alert> : null}
      {searchParams.published ? <Alert tone="success">Amending law published.</Alert> : null}
      {searchParams.withdrawn ? <Alert tone="success">Amending law withdrawn.</Alert> : null}
      {constitutions.length > 0 && selectedConstitution ? (
        <form method="get" className="toolbar">
          <Select id="constitutionId" name="constitutionId" label="Constitution" defaultValue={selectedConstitution.id}>
            {constitutions.map((constitution) => (
              <option key={constitution.id} value={constitution.id}>
                {constitution.title}
              </option>
            ))}
          </Select>
          <Button type="submit">Show laws</Button>
        </form>
      ) : (
        <p className="muted">No constitutions are available yet.</p>
      )}
      {selectedConstitution ? (
        <section>
          <h2 className="section-title">{selectedConstitution.title}</h2>
          {amendments.length === 0 ? (
            <p className="muted">No amending laws recorded for this constitution yet.</p>
          ) : (
            <DataList columns={4}>
              {amendments.map((amendment) => (
                <DataRow
                  key={amendment.id}
                  cells={[
                    {
                      label: 'Title',
                      value: <a href={`/editor/amendments/${encodeURIComponent(amendment.id)}`}>{amendment.title}</a>,
                    },
                    { label: 'Kind', value: kindLabel(amendment.kind) },
                    {
                      label: 'Enacted',
                      value: <FormattedDate value={amendment.enactedOn} />,
                    },
                    {
                      label: 'Status',
                      value: <Badge tone={statusTone(amendment.status)}>{amendment.status ?? 'draft'}</Badge>,
                    },
                  ]}
                />
              ))}
            </DataList>
          )}
        </section>
      ) : null}
    </PageMain>
  );
}
