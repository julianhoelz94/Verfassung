import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { PageMain } from '../../components/PageMain';
import { Alert, Badge, Button, DataList, DataRow, PageHeader, Select } from '../../components/ui';
import { FormattedDate } from '../../../lib/format-date';
import { getCountry, listConstitutionVersions, listCountries, type ConstitutionSummary, type VersionSummary } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';
import { canVisitEditor } from '../../../lib/nav';
import { SESSION_COOKIE, currentUser } from '../../../lib/session';

type HistoryPageProps = {
  searchParams: Promise<{ constitutionId?: string }>;
};

const HOP_KIND_LABELS: Record<string, string> = {
  initial: 'Initial',
  legal_amendment: 'Amending law',
  official_errata: 'Official errata',
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
              {orderedVersions.map((version) => (
                <DataRow
                  key={version.id}
                  cells={[
                    {
                      label: 'Label',
                      value: countryCode ? (
                        <a href={`/countries/${countryCode}/versions/${version.id}`}>{version.versionLabel}</a>
                      ) : (
                        version.versionLabel
                      ),
                    },
                    {
                      label: 'Hop kind',
                      value: (
                        <span className="chip-row">
                          <Badge tone="info">{hopKindLabel(version.hopKind)}</Badge>
                          {isStaffOnly(version) ? <Badge tone="changed">Staff only</Badge> : null}
                        </span>
                      ),
                    },
                    {
                      label: 'Listing',
                      value: version.listing ?? 'public',
                    },
                    {
                      label: 'Effective',
                      value: <FormattedDate value={version.effectiveDate} />,
                    },
                    {
                      label: 'Latest published',
                      value: version.latestPublished ? 'Yes' : 'No',
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
