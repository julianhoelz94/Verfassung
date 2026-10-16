import { T, ui } from '../../components/TranslationProvider';
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
        <PageHeader title={<T value={ui.attrs.editorAmendmentsPagePageHeaderTitleLegal} />} meta={`Signed in as ${user.email}, but this account has no editorial role.`} />
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
        title={<T value={ui.attrs.editorAmendmentsPagePageHeaderTitleLegal} />}
        eyebrow={<T value={ui.attrs.editorAmendmentsPagePageHeaderEyebrowEditorial} />}
        meta={`Signed in as ${user.email}. Roles: ${user.roles.join(', ')}.`}
        actions={
          canEdit && selectedConstitution ? (
            <a className="btn btn-primary" href={newHref}>
              <T value={ui.editor.amendments.page.addLegalChange} />{" "}</a>
          ) : null
        }
      />
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      {searchParams.saved ? <Alert tone="success"><T value={ui.editor.amendments.page.draftSaved} /></Alert> : null}
      {searchParams.published ? <Alert tone="success"><T value={ui.editor.amendments.page.amendingLawPublished} /></Alert> : null}
      {searchParams.withdrawn ? <Alert tone="success"><T value={ui.editor.amendments.page.amendingLawWithdrawn} /></Alert> : null}
      {constitutions.length > 0 && selectedConstitution ? (
        <form method="get" className="toolbar">
          <Select id="constitutionId" name="constitutionId" label={<T value={ui.attrs.editorAmendmentsPageSelectLabelConstitution} />} defaultValue={selectedConstitution.id}>
            {constitutions.map((constitution) => (
              <option key={constitution.id} value={constitution.id}>
                {constitution.title}
              </option>
            ))}
          </Select>
          <Select id="review" name="review" label={<T value={ui.attrs.editorAmendmentsPageSelectLabelReview} />} defaultValue={searchParams.review ?? ''}>
            <option value=""><T value={ui.editor.amendments.page.allLegalChanges} /></option>
            <option value="needs_review"><T value={ui.editor.amendments.page.needsReview} /></option>
          </Select>
          <Button type="submit"><T value={ui.editor.amendments.page.showLaws} /></Button>
        </form>
      ) : (
        <p className="muted"><T value={ui.editor.amendments.page.noConstitutionsAreAvailableYet} /></p>
      )}
      {selectedConstitution ? (
        <section>
          <h2 className="section-title">{selectedConstitution.title}</h2>
          {visibleAmendments.length === 0 ? (
            <p className="muted"><T value={ui.editor.amendments.page.noLegalChangesMatchThisView} /></p>
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
                      value: <span className="chip-row"><Badge tone={statusTone(amendment.status)}>{amendment.status ?? 'draft'}</Badge>{amendment.reviewStatus === 'needs_review' ? <Badge tone="changed"><T value={ui.editor.amendments.page.needsReview} /></Badge> : null}</span>,
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
