import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageMain } from '../../../components/PageMain';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { Badge, PageHeader, type BadgeTone } from '../../../components/ui';
import {
  ApiUnavailableError,
  getCountry,
  listConstitutionAmendments,
  type Amendment,
  type CountryDetail,
} from '../../../../lib/api';
import { FormattedDate } from '../../../../lib/format-date';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../lib/page-meta';
import { chainTipId } from '../../../../lib/reading';
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

function isPublicLaw(amendment: Amendment): boolean {
  return amendment.kind === 'legal_amendment' || amendment.kind === 'official_errata' || !amendment.kind;
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
        groups.flatMap((group) => group ?? []).filter(isPublicLaw),
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
        <p>No amending laws are recorded for this constitution.</p>
      ) : null}
      <ol className="timeline">
        {amendments.map((amendment) => {
          const isErrata = amendment.kind === 'official_errata';
          const source = amendment.sourceVersionId
            ? versionsById.get(amendment.sourceVersionId)
            : undefined;
          const target = amendment.targetVersionId
            ? versionsById.get(amendment.targetVersionId)
            : undefined;
          return (
            <li key={amendment.id} className="timeline-item">
              <FormattedDate className="timeline-date" value={amendment.enactedOn} fallback="Date unknown" />
              <article className="card">
                {isErrata ? <Badge tone="info">Official errata</Badge> : null}
                <h2 className="card-title">{isErrata ? `Errata: ${amendment.title}` : amendment.title}</h2>
                <p className="muted">
                  {target ? `Version ${target.versionLabel}` : 'Version'}
                  {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
                </p>
                {amendment.summary ? <p>{amendment.summary}</p> : null}
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
                      href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(amendment.sourceVersionId)}&to=${encodeURIComponent(amendment.targetVersionId)}`}
                    >
                      Compare with previous
                      {source && target ? ` (${source.versionLabel} → ${target.versionLabel})` : ''}
                    </a>
                    {target ? (
                      <a className="btn btn-sm btn-ghost" href={`/countries/${country.isoCode}/versions/${target.id}`}>
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
