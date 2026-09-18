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
    review?: string;
  }>;
};

function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role) || roles.includes('admin');
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
        <PageHeader title="Legal changes" meta={`Signed in as ${user.email}, but this account has no editorial role.`} />
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
  const visibleAmendments = searchParams.review === 'needs_review'
    ? amendments.filter((amendment) => amendment.reviewStatus === 'needs_review')
    : amendments;
  const newHref = selectedConstitution
    ? `/editor/amendments/new?constitutionId=${encodeURIComponent(selectedConstitution.id)}`
    : '/editor/amendments/new';

  return (
    <PageMain className="wide">
      <PageHeader
        title="Legal changes"
        eyebrow="Editorial workspace"
        meta={`Signed in as ${user.email}. Roles: ${user.roles.join(', ')}.`}
        actions={
          canEdit && selectedConstitution ? (
            <a className="btn btn-primary" href={newHref}>
              Add legal change
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
          <Select id="review" name="review" label="Review status" defaultValue={searchParams.review ?? ''}>
            <option value="">All legal changes</option>
            <option value="needs_review">Needs review</option>
          </Select>
          <Button type="submit">Show laws</Button>
        </form>
      ) : (
        <p className="muted">No constitutions are available yet.</p>
      )}
      {selectedConstitution ? (
        <section>
          <h2 className="section-title">{selectedConstitution.title}</h2>
          {visibleAmendments.length === 0 ? (
            <p className="muted">No legal changes match this view.</p>
          ) : (
            <DataList columns={4}>
              {visibleAmendments.map((amendment) => (
                <DataRow
                  key={amendment.id}
                  cells={[
                    {
                      label: 'Title',
                      value: <a href={`/editor/amendments/${encodeURIComponent(amendment.id)}`}>{amendment.title}</a>,
                    },
                    { label: 'Comment', value: amendment.comment ?? amendment.summary },
                    {
                      label: 'Enacted',
                      value: <FormattedDate value={amendment.enactedOn} />,
                    },
                    {
                      label: 'Status',
                      value: <span className="chip-row"><Badge tone={statusTone(amendment.status)}>{amendment.status ?? 'draft'}</Badge>{amendment.reviewStatus === 'needs_review' ? <Badge tone="changed">Needs review</Badge> : null}</span>,
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
