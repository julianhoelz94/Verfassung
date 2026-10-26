import { Disclosure } from '../../components/Disclosure';
import { reviewUi } from '../../../lib/ui-review-messages';
import { SignedInSummary } from '../../components/SignedInSummary';
import { T } from '../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../lib/messages';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { CollectionPage } from '../../components/layout/templates';
import { Alert, Badge, Button, DataList, DataRow, PageHeader, Select } from '../../components/ui';
import { FormattedDate } from '../../../lib/format-date';
import { getCountry, listConstitutionAmendments, listConstitutionVersions, listCountries, type Amendment, type ConstitutionSummary, type VersionSummary } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';
import { canVisitEditor } from '../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';

type HistoryPageProps = {
  searchParams: Promise<{ constitutionId?: string }>;
};

const HOP_KIND_LABELS: Record<string, UiMessage> = {
  initial: ui.remainingStatus.initial,
  legal: ui.remainingStatus.legalChange,
  editorial_correction: ui.remainingStatus.editorialCorrection,
};

function hopKindLabel(hopKind: string | undefined): UiMessage {
  if (!hopKind) {
    return ui.remainingStatus.unknown;
  }
  return HOP_KIND_LABELS[hopKind] ?? ui.remainingStatus.unknown;
}

function legalIdentity(version: VersionSummary): string {
  return version.legalVersionId ?? version.id;
}

async function loadConstitutions(): Promise<{ constitutions: ConstitutionSummary[]; isoByConstitutionId: Record<string, string> }> {
  try {
    const countries = (await listCountries()) ?? [];
    const details = await Promise.all(countries.map((country) => getCountry(country.isoCode).catch(() => null)));
    const constitutions = details.flatMap((country) => country?.constitutions ?? []);
    const isoByConstitutionId = Object.fromEntries(
      details.flatMap((country) =>
        country ? country.constitutions.map((constitution) => [constitution.id, country.isoCode] as const) : [],
      ),
    );
    return { constitutions, isoByConstitutionId };
  } catch {
    return { constitutions: [], isoByConstitutionId: {} };
  }
}

export default async function SnapshotHistoryPage(props: HistoryPageProps) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canVisitEditor(user.roles)) {
    return (
      <CollectionPage width="content" header={<PageHeader title={<T value={ui.attrs.editorHistoryPagePageHeaderTitleSnapshot} />} meta={<SignedInSummary email={user.email} noEditorialRole />} />}>

      </CollectionPage>
    );
  }

  const { constitutions, isoByConstitutionId } = await loadConstitutions();
  const selectedConstitution =
    constitutions.find((constitution) => constitution.id === searchParams.constitutionId) ?? constitutions[0];
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  let versions: VersionSummary[] = [];
  if (selectedConstitution && sessionToken) {
    try {
      versions = (await listConstitutionVersions(selectedConstitution.id, {
        listing: 'all',
        authorization: `Bearer ${sessionToken}`,
      })) ?? [];
    } catch {
      versions = [];
    }
  }
  const orderedVersions = orderVersions(versions);
  const snapshotGroups = new Map<string, VersionSummary[]>();
  for (const version of orderedVersions) {
    const key = legalIdentity(version);
    snapshotGroups.set(key, [...(snapshotGroups.get(key) ?? []), version]);
  }
  const legalGroups = [...snapshotGroups.entries()].map(([legalId, snapshots]) => ({
    legalId,
    legal: snapshots.find((version) => version.hopKind !== 'editorial_correction') ?? snapshots[0]!,
    editorial: snapshots.filter((version) => version.hopKind === 'editorial_correction').reverse(),
  }));
  let amendments: Amendment[] = [];
  if (selectedConstitution && sessionToken) {
    amendments = (await listConstitutionAmendments(selectedConstitution.id, { status: 'all', authorization: `Bearer ${sessionToken}` }).catch(() => null)) ?? [];
  }
  const legalIdBySnapshotId = new Map(versions.map((version) => [version.id, legalIdentity(version)]));
  const recordsForLegal = (legalId: string) =>
    amendments.filter((amendment) =>
      legalIdBySnapshotId.get(amendment.sourceVersionId ?? '') === legalId,
    );
  const countryCode = selectedConstitution ? isoByConstitutionId[selectedConstitution.id] : undefined;

  return (
    <CollectionPage width="content" header={<PageHeader
        title={<T value={ui.attrs.editorHistoryPagePageHeaderTitleSnapshot} />}
        eyebrow={<T value={ui.attrs.editorHistoryPagePageHeaderEyebrowEditorial} />}
        meta={<SignedInSummary email={user.email} roles={user.roles} />}
      />}>

      {constitutions.length > 0 && selectedConstitution ? (
        <form method="get" className="toolbar">
          <Select id="constitutionId" name="constitutionId" label={<T value={ui.attrs.editorHistoryPageSelectLabelConstitution} />} defaultValue={selectedConstitution.id}>
            {constitutions.map((constitution) => (
              <option key={constitution.id} value={constitution.id}>
                {constitution.title}
              </option>
            ))}
          </Select>
          <Button type="submit"><T value={ui.editor.history.page.showHistory} /></Button>
        </form>
      ) : (
        <Alert tone="error"><T value={ui.editor.history.page.noConstitutionsAreAvailableYet} /></Alert>
      )}
      {selectedConstitution ? (
        <section>
          <h2 className="section-title">{selectedConstitution.title}</h2>
          {orderedVersions.length === 0 ? (
            <p className="muted"><T value={ui.editor.history.page.noVersionSnapshotsRecordedForThisConstitution} /></p>
          ) : (
            <DataList columns={5}>
              {legalGroups.map(({ legalId, legal, editorial }) => (
                <DataRow
                  key={legalId}
                  cells={[
                    {
                      label: <T value={ui.remainingStatus.label} />,
                      value: countryCode ? (
                        <a href={`/countries/${countryCode}/versions/${legal.currentVersionId ?? legal.id}`}>{legal.versionLabel}</a>
                      ) : (
                        legal.versionLabel
                      ),
                    },
                    {
                      label: <T value={ui.remainingStatus.hopKind} />,
                      value: (
                        <span className="chip-row">
                          <Badge tone="info"><T value={hopKindLabel(legal.hopKind)} /></Badge>
                          {editorial.length ? <Badge tone="changed">{editorial.length} <T value={ui.editor.history.page.editorialRevision} />{editorial.length === 1 ? '' : 's'}</Badge> : null}
                        </span>
                      ),
                    },
                    {
                      label: <T value={ui.remainingStatus.editorialRevisions} />,
                      value: editorial.length ? (
                        <Disclosure summary={<T value={reviewUi.textCorrections} />}>
                        <p className="muted"><T value={reviewUi.correctionHint} /></p>
                        <ol>
                          {editorial.map((version) => (
                            <li key={version.id}>
                              {countryCode ? <a href={`/countries/${countryCode}/versions/${version.id}`}>{version.versionLabel}</a> : version.versionLabel} <T value={ui.editor.history.page.editorialCorrection} />{" "}{version.publicationComment ?? <T value={ui.remainingStatus.noPublicationComment} />}
                            </li>
                          ))}
                        </ol>
                        </Disclosure>
                      ) : <T value={ui.editorDefaults.noEditorialRevisions} />,
                    },
                    {
                      label: <T value={ui.remainingStatus.effective} />,
                      value: <FormattedDate value={legal.effectiveDate} />,
                    },
                    {
                      label: <T value={ui.remainingStatus.outgoingChangeRecordEdges} />,
                      value: recordsForLegal(legalId).length ? (
                        <ul>
                          {recordsForLegal(legalId).map((amendment) => (
                            <li key={amendment.id}>
                              <a href={`/editor/amendments/${amendment.id}`}>{amendment.title}</a>
                              {amendment.comment ? ` — ${amendment.comment}` : ''}
                              {amendment.reviewStatus === 'needs_review' ? <Badge tone="changed"><T value={ui.editor.history.page.needsReview} /></Badge> : null}
                            </li>
                          ))}
                        </ul>
                      ) : <span className="chip-row"><T value={ui.editor.history.page.noChangeRecord} />{" "}<Badge tone={legal.latestPublished ? 'added' : 'changed'}><T value={legal.latestPublished ? ui.remainingStatus.latestPublished : ui.remainingStatus.historical} /></Badge></span>,
                    },
                  ]}
                />
              ))}
            </DataList>
          )}
        </section>
      ) : null}
    </CollectionPage>
  );
}
