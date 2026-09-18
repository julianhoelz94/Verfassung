import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageMain } from '../../../components/PageMain';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { Badge, PageHeader, type BadgeTone } from '../../../components/ui';
import {
  ApiUnavailableError,
  getVersion,
  getCountry,
  listConstitutionAmendments,
  type Amendment,
  type CountryDetail,
} from '../../../../lib/api';
import { FormattedDate } from '../../../../lib/format-date';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../lib/page-meta';
import { chainTipId, publicVersions, snapshotVersionId } from '../../../../lib/reading';
import { sortAmendmentsByEnactment } from '../../../../lib/timeline';

type TimelinePageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata(props: TimelinePageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const country = await getCountry(params.code);
    if (!country) {
      return { title: atlasTitle('Timeline') };
    }
    return pageMetadata({
      title: atlasTitle('Timeline', country.name),
      description: metaDescription(`Amendment timeline for ${country.name}.`),
      path: `/countries/${country.isoCode}/timeline`,
    });
  } catch {
    return { title: atlasTitle('Timeline') };
  }
}

function changeTone(changeType: string): BadgeTone {
  if (changeType === 'added') {
    return 'added';
  }
  if (changeType === 'removed') {
    return 'removed';
  }
  if (changeType === 'changed') {
    return 'changed';
  }
  return 'neutral';
}

export default async function TimelinePage(props: TimelinePageProps) {
  const params = await props.params;
  let country: CountryDetail | null = null;
  let amendments: Amendment[] = [];
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    if (country) {
      const groups = await Promise.all(
        country.constitutions.map((constitution) => listConstitutionAmendments(constitution.id)),
      );
      amendments = sortAmendmentsByEnactment(
        groups.flatMap((group) => group ?? []),
      );
    }
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Services are unavailable';
  }

  if (error) {
    return (
      <PageMain className="wide">
        <ServiceUnavailable service="Amendment" retryHref={`/countries/${params.code}/timeline`} />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  const versionsById = new Map(
    country.constitutions.flatMap((constitution) =>
      constitution.versions.map((version) => [version.id, version]),
    ),
  );
  const pinnedIds = [...new Set(amendments.flatMap((amendment) => [amendment.sourceVersionId, amendment.targetVersionId]).filter((id): id is string => Boolean(id)))];
  const pinnedVersions = await Promise.all(pinnedIds.map((id) => getVersion(id)));
  const pinnedById = new Map(pinnedVersions.filter((version) => version != null).map((version) => [version!.id, version!]));
  const publicByLegalId = new Map(
    country.constitutions.flatMap((constitution) =>
      publicVersions(constitution.versions).map((version) => [version.legalVersionId ?? version.id, version]),
    ),
  );
  const versionForPin = (id: string | null | undefined) =>
    id ? (
      versionsById.get(id) ??
      publicByLegalId.get(pinnedById.get(id)?.legalVersionId ?? '') ??
      publicByLegalId.get(id) ??
      [...versionsById.values()].find((version) => version.currentVersionId === id)
    ) : undefined;
  const primary = country.constitutions[0];
  const tipId = primary ? chainTipId(primary) : undefined;

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: 'Timeline' },
        ]}
        title="Amendment timeline"
        actions={
          tipId ? (
            <a className="btn" href={`/countries/${country.isoCode}/versions/${tipId}`}>
              Read latest
            </a>
          ) : (
            <a className="btn" href={`/countries/${country.isoCode}`}>
              Versions
            </a>
          )
        }
      />
      {amendments.length === 0 ? (
        <p>No legal changes are recorded for this constitution.</p>
      ) : null}
      <ol className="timeline">
        {amendments.map((amendment) => {
          const source = versionForPin(amendment.sourceVersionId);
          const target = versionForPin(amendment.targetVersionId);
          return (
            <li key={amendment.id} className="timeline-item">
              <FormattedDate className="timeline-date" value={amendment.enactedOn} fallback="Date unknown" />
              <article className="card">
                <h2 className="card-title">{amendment.title}</h2>
                <p className="muted">
                  {target ? `Version ${target.versionLabel}` : 'Version'}
                  {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
                </p>
                {amendment.comment || amendment.summary ? <p>{amendment.comment ?? amendment.summary}</p> : null}
                {amendment.documents?.length ? (
                  <ul className="link-list">
                    {amendment.documents.map((document, index) => (
                      <li key={`${document.url ?? document.fileId ?? document.label ?? 'document'}-${index}`}>
                        {document.url ? <a href={document.url} rel="noreferrer">{document.label ?? document.url}</a> : document.label ?? 'Archived document'}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="chip-row">
                  {amendment.changes.map((change) => (
                    <Badge key={change.id} tone={changeTone(change.changeType)}>
                      {change.changeType}
                      {change.articleNumber ? ` Art. ${change.articleNumber}` : ''}
                    </Badge>
                  ))}
                </div>
                {amendment.sourceVersionId && amendment.targetVersionId ? (
                  <div className="card-actions">
                    <a
                      className="btn btn-sm"
                      href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(source?.id ?? amendment.sourceVersionId)}&to=${encodeURIComponent(target?.id ?? amendment.targetVersionId)}`}
                    >
                      Compare with previous
                      {source && target ? ` (${source.versionLabel} → ${target.versionLabel})` : ''}
                    </a>
                    {target ? (
                      <a className="btn btn-sm btn-ghost" href={`/countries/${country.isoCode}/versions/${snapshotVersionId(target)}`}>
                        Read
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </PageMain>
  );
}
