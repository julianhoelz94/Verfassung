import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageMain } from '../../../components/PageMain';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import {
  ApiUnavailableError,
  getCountry,
  listAmendments,
  type Amendment,
  type CountryDetail,
} from '../../../../lib/api';
import { orderVersions } from '../../../../lib/compare';
import { sortAmendmentsByEnactment } from '../../../../lib/timeline';

type TimelinePageProps = {
  params: { code: string };
};

export default async function TimelinePage({ params }: TimelinePageProps) {
  let country: CountryDetail | null = null;
  let amendments: Amendment[] = [];
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    if (country) {
      const groups = await Promise.all(
        country.constitutions.flatMap((constitution) =>
          constitution.versions.map((version) => listAmendments(version.id)),
        ),
      );
      amendments = sortAmendmentsByEnactment(groups.flatMap((group) => group ?? []));
    }
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Services are unavailable';
  }

  if (error) {
    return (
      <PageMain>
        <ServiceUnavailable service="Amendment" retryHref={`/countries/${params.code}/timeline`} />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  const labelById = new Map(
    country.constitutions.flatMap((constitution) =>
      orderVersions(constitution.versions).map((version) => [version.id, version.versionLabel]),
    ),
  );

  return (
    <PageMain>
      <Breadcrumbs
        items={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: 'Timeline' },
        ]}
      />
      <h1>Amendment timeline</h1>
      <div className="actions">
        <a href={`/countries/${country.isoCode}`}>Versions</a>
      </div>
      {amendments.length === 0 ? <p>No recorded amendments for published versions.</p> : null}
      <ol>
        {amendments.map((amendment) => (
          <li key={amendment.id} style={{ marginBottom: 24 }}>
            <h2>{amendment.title}</h2>
            <p>
              {amendment.enactedOn ?? 'Date unknown'}
              {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
            </p>
            <p>{amendment.summary}</p>
            <p>
              <a
                href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(amendment.sourceVersionId)}&to=${encodeURIComponent(amendment.targetVersionId)}`}
              >
                Compare {labelById.get(amendment.sourceVersionId) ?? 'source'} →{' '}
                {labelById.get(amendment.targetVersionId) ?? 'target'}
              </a>
            </p>
            <ul>
              {amendment.changes.map((change) => (
                <li key={change.id}>
                  <span className={`tag tag-${change.changeType}`}>{change.changeType}</span>
                  {change.articleNumber ? ` Art. ${change.articleNumber}` : ''}
                  {change.nodeId && change.nodeId !== change.articleId ? ' (sub-article)' : ''}
                  {change.changedOn ? ` · ${change.changedOn}` : ''}
                  {change.effectiveOn ? ` effective ${change.effectiveOn}` : ''}
                  {change.note ? `: ${change.note}` : ''}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </PageMain>
  );
}
