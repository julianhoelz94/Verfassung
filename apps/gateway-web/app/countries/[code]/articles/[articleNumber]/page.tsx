import { notFound } from 'next/navigation';
import { ConstitutionText } from '../../../../components/ConstitutionText';
import { PageMain } from '../../../../components/PageMain';
import { Provenance } from '../../../../components/Provenance';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { Badge, PageHeader } from '../../../../components/ui';
import {
  ApiUnavailableError,
  getCountry,
  listAllArticles,
  listAmendmentsByArticle,
  type Amendment,
  type ArticleSummary,
  type CountryDetail,
  type VersionSummary,
} from '../../../../../lib/api';
import { orderVersions } from '../../../../../lib/compare';
import { FormattedDate } from '../../../../../lib/format-date';

type HistoryPageProps = {
  params: Promise<{ code: string; articleNumber: string }>;
};

type ArticleSnapshot = {
  version: VersionSummary;
  article: ArticleSummary;
  articles: ArticleSummary[];
};

function changeTone(changeType: string): 'added' | 'removed' | 'changed' | 'neutral' {
  if (changeType === 'added' || changeType === 'removed' || changeType === 'changed') {
    return changeType;
  }
  return 'neutral';
}

export default async function ArticleHistoryPage(props: HistoryPageProps) {
  const params = await props.params;
  const articleNumber = decodeURIComponent(params.articleNumber);
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
  }

  if (error) {
    return (
      <PageMain>
        <ServiceUnavailable
          service="Catalog"
          retryHref={`/countries/${params.code}/articles/${encodeURIComponent(articleNumber)}`}
        />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  const constitution =
    country.constitutions.find((item) =>
      item.versions.some((version) => version.latestPublished),
    ) ?? country.constitutions[0];
  if (!constitution) {
    notFound();
  }

  const versions = orderVersions(constitution.versions);
  let snapshots: ArticleSnapshot[] = [];
  let amendments: Amendment[] = [];
  let loadError: string | null = null;
  try {
    const versionArticles = await Promise.all(versions.map((version) => listAllArticles(version.id, true)));
    snapshots = versions.flatMap((version, index) => {
      const articles = versionArticles[index] ?? [];
      const article = articles.find((item) => item.articleNumber === articleNumber);
      return article ? [{ version, article, articles }] : [];
    });
  } catch (e) {
    loadError = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
  }
  try {
    amendments = (await listAmendmentsByArticle(constitution.id, articleNumber)) ?? [];
  } catch {
    /* amendment history is optional on this page */
  }

  if (!loadError && snapshots.length === 0) {
    notFound();
  }

  return (
    <PageMain>
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: `History of Article ${articleNumber}` },
        ]}
        eyebrow={`${country.name} · ${constitution.title}`}
        title={`History of Article ${articleNumber}`}
      />
      {loadError ? <p role="alert">{loadError.endsWith('.') ? loadError : `${loadError}.`}</p> : null}
      <div className="stack">
        {snapshots.map((snapshot, index) => {
          const previous = snapshots[index - 1];
          const incoming = amendments.filter(
            (item) => item.targetVersionId != null && item.targetVersionId === snapshot.version.id,
          );
          const articlesByNumber = Object.fromEntries(
            snapshot.articles.map((item) => [item.articleNumber, item.id]),
          );
          return (
            <section key={snapshot.version.id} className="history-version">
              {previous ? (
                <div className="stack">
                  {incoming.map((amendment) =>
                    amendment.changes.map((change) => (
                      <div key={change.id} className="change-row">
                        <Badge tone={changeTone(change.changeType)}>{change.changeType}</Badge>
                        <span className="muted">
                          {change.changedOn ? (
                            <>
                              changed <FormattedDate value={change.changedOn} />
                            </>
                          ) : null}
                          {change.effectiveOn ? (
                            <>
                              {change.changedOn ? ' · ' : ''}
                              effective <FormattedDate value={change.effectiveOn} />
                            </>
                          ) : null}
                          {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
                          {change.amendingLawTitle ? ` · ${change.amendingLawTitle}` : ''}
                          {change.amendingLawCitation ? ` · ${change.amendingLawCitation}` : ''}
                          {change.amendingLawCitationId &&
                          !change.amendingLawCitation &&
                          !amendment.sourceReference
                            ? ` · ${change.amendingLawCitationId}`
                            : ''}
                          {change.note ? ` · ${change.note}` : ''}
                        </span>
                      </div>
                    )),
                  )}
                  <a
                    className="btn"
                    href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(previous.version.id)}&to=${encodeURIComponent(snapshot.version.id)}`}
                  >
                    Compare with previous
                  </a>
                </div>
              ) : null}
              <h2>
                {snapshot.version.versionLabel}
                {snapshot.version.effectiveDate ? (
                  <>
                    {' · '}
                    <FormattedDate value={snapshot.version.effectiveDate} />
                  </>
                ) : null}
              </h2>
              <Provenance
                version={snapshot.version}
                label={`Source and trust · ${snapshot.version.versionLabel}`}
              />
              <ConstitutionText
                article={snapshot.article}
                outline={constitution.contentOutline}
                lang={snapshot.version.languageCode}
                crossRefs={{
                  code: country.isoCode,
                  versionId: snapshot.version.id,
                  articlesByNumber,
                }}
              />
            </section>
          );
        })}
      </div>
    </PageMain>
  );
}
