import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { PageMain } from '../../components/PageMain';
import { Alert, Badge, Button, DataList, DataRow, PageHeader, Select } from '../../components/ui';
import { FormattedDate } from '../../../lib/format-date';
import { getCountry, listConstitutionAmendments, listConstitutionVersions, listCountries, type Amendment, type ConstitutionSummary, type VersionSummary } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';
import { canVisitEditor } from '../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';

type HistoryPageProps = {
  searchParams: Promise<{ constitutionId?: string }>;
};

const HOP_KIND_LABELS: Record<string, string> = {
  initial: 'Initial',
  legal: 'Legal change',
  editorial_correction: 'Editorial correction',
};

function hopKindLabel(hopKind: string | undefined): string {
  if (!hopKind) {
    return 'Unknown';
  }
  return HOP_KIND_LABELS[hopKind] ?? hopKind;
}

function isStaffOnly(version: VersionSummary): boolean {
  return version.hopKind === 'editorial_correction' || version.listing === 'staff';
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
      <PageMain className="wide">
        <PageHeader title="Snapshot history" meta={`Signed in as ${user.email}, but this account has no editorial role.`} />
      </PageMain>
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
      legalIdBySnapshotId.get(amendment.sourceVersionId ?? '') === legalId ||
      legalIdBySnapshotId.get(amendment.targetVersionId ?? '') === legalId,
    );
  const countryCode = selectedConstitution ? isoByConstitutionId[selectedConstitution.id] : undefined;

  return (
    <PageMain className="wide">
      <PageHeader
        title="Snapshot history"
        eyebrow="Editorial workspace"
        meta={`Signed in as ${user.email}. Roles: ${user.roles.join(', ')}.`}
      />
      {constitutions.length > 0 && selectedConstitution ? (
        <form method="get" className="toolbar">
          <Select id="constitutionId" name="constitutionId" label="Constitution" defaultValue={selectedConstitution.id}>
            {constitutions.map((constitution) => (
              <option key={constitution.id} value={constitution.id}>
                {constitution.title}
              </option>
            ))}
          </Select>
          <Button type="submit">Show history</Button>
        </form>
      ) : (
        <Alert tone="error">No constitutions are available yet.</Alert>
      )}
      {selectedConstitution ? (
        <section>
          <h2 className="section-title">{selectedConstitution.title}</h2>
          {orderedVersions.length === 0 ? (
            <p className="muted">No version snapshots recorded for this constitution yet.</p>
          ) : (
            <DataList columns={5}>
              {legalGroups.map(({ legalId, legal, editorial }) => (
                <DataRow
                  key={legalId}
                  cells={[
                    {
                      label: 'Label',
                      value: countryCode ? (
                        <a href={`/countries/${countryCode}/versions/${legal.currentVersionId ?? legal.id}`}>{legal.versionLabel}</a>
                      ) : (
                        legal.versionLabel
                      ),
                    },
                    {
                      label: 'Hop kind',
                      value: (
                        <span className="chip-row">
                          <Badge tone="info">{hopKindLabel(legal.hopKind)}</Badge>
                          {editorial.length ? <Badge tone="changed">{editorial.length} editorial revision{editorial.length === 1 ? '' : 's'}</Badge> : null}
                        </span>
                      ),
                    },
                    {
                      label: 'Editorial revisions',
                      value: editorial.length ? (
                        <ol>
                          {editorial.map((version) => (
                            <li key={version.id}>
                              {version.versionLabel} · editorial correction · {version.listing ?? 'staff'}
                            </li>
                          ))}
                        </ol>
                      ) : 'No editorial revisions',
                    },
                    {
                      label: 'Effective',
                      value: <FormattedDate value={legal.effectiveDate} />,
                    },
                    {
                      label: 'Change-record edges',
                      value: recordsForLegal(legalId).length ? (
                        <ul>
                          {recordsForLegal(legalId).map((amendment) => (
                            <li key={amendment.id}>
                              <a href={`/editor/amendments/${amendment.id}`}>{amendment.title}</a>
                              {amendment.comment ? ` — ${amendment.comment}` : ''}
                              {amendment.reviewStatus === 'needs_review' ? <Badge tone="changed">Needs review</Badge> : null}
                            </li>
                          ))}
                        </ul>
                      ) : <span className="chip-row">No change record <Badge tone={legal.latestPublished ? 'added' : 'changed'}>{legal.latestPublished ? 'Latest published' : 'Historical'}</Badge></span>,
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
