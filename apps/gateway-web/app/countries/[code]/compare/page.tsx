import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { ConstitutionText } from '../../../components/ConstitutionText';
import { PageMain } from '../../../components/PageMain';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import {
  ApiUnavailableError,
  listAllArticles,
  listAmendments,
  getCountry,
  type Amendment,
  type ArticleSummary,
  type CountryDetail,
  type VersionSummary,
} from '../../../../lib/api';
import {
  COMPARE_KIND_LABEL,
  compareArticleNumbers,
  compareRequestError,
  compareRowId,
  netArticleKind,
  orderVersions,
  versionPath,
} from '../../../../lib/compare';
import { CompareForm } from '../CompareForm';

type ComparePageProps = {
  params: { code: string };
  searchParams: { from?: string; to?: string };
};

type Hop = {
  source: VersionSummary;
  target: VersionSummary;
  amendments: Amendment[];
  articles: ArticleSummary[];
};

function affectedNumbers(amendments: Amendment[]): string[] {
  const numbers = new Set<string>();
  for (const amendment of amendments) {
    for (const change of amendment.changes) {
      if (change.articleNumber) {
        numbers.add(change.articleNumber);
      }
    }
  }
  return [...numbers].sort(compareArticleNumbers);
}

export default async function ComparePage({ params, searchParams }: ComparePageProps) {
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
  }

  if (error) {
    return (
      <PageMain className="wide">
        <ServiceUnavailable service="Catalog" retryHref={`/countries/${params.code}/compare`} />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  const constitution =
    country.constitutions.find((item) =>
      item.versions.some((version) => version.id === searchParams.from || version.id === searchParams.to),
    ) ?? country.constitutions[0];
  const versions = orderVersions(constitution?.versions ?? []);
  const fromId = searchParams.from ?? versions[0]?.id;
  const toId = searchParams.to ?? versions[versions.length - 1]?.id;
  const selectedError = compareRequestError(country.constitutions, fromId, toId);
  const path = fromId && toId && constitution && !selectedError ? versionPath(versions, fromId, toId) : null;

  let fromArticles: ArticleSummary[] = [];
  let toArticles: ArticleSummary[] = [];
  let hops: Hop[] = [];
  let loadError: string | null = selectedError;

  if (path && path.length >= 2 && !selectedError) {
    try {
      const hopPairs = path.slice(0, -1).map((source, index) => ({
        source,
        target: path[index + 1],
      }));
      const [fromList, toList] = await Promise.all([
        listAllArticles(path[0].id, true),
        listAllArticles(path[path.length - 1].id, true),
      ]);
      hops = await Promise.all(
        hopPairs.map(async (pair) => {
          const [amendments, articles] = await Promise.all([
            listAmendments(pair.target.id, pair.source.id),
            listAllArticles(pair.target.id, true),
          ]);
          return {
            source: pair.source,
            target: pair.target,
            amendments: amendments ?? [],
            articles,
          };
        }),
      );
      fromArticles = fromList;
      toArticles = toList;
      loadError = null;
    } catch (e) {
      loadError = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    }
  }

  const fromMap = new Map(fromArticles.map((article) => [article.articleNumber, article]));
  const toMap = new Map(toArticles.map((article) => [article.articleNumber, article]));
  const numbers = [...new Set([...fromMap.keys(), ...toMap.keys()])].sort(compareArticleNumbers);
  const recorded = new Map<string, string[]>();
  for (const hop of hops) {
    for (const amendment of hop.amendments) {
      for (const change of amendment.changes) {
        if (change.articleNumber) {
          const types = recorded.get(change.articleNumber) ?? [];
          types.push(change.changeType);
          recorded.set(change.articleNumber, types);
        }
      }
    }
  }

  const fromVersion = path?.[0];
  const toVersion = path?.[path.length - 1];

  return (
    <PageMain className="wide">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: 'Compare' },
        ]}
      />
      <h1>Compare versions</h1>
      <p className="lede">
        {constitution?.title}. Published versions form a single line; this page traces every recorded hop
        from one snapshot to a later one.
      </p>
      <CompareForm code={country.isoCode} versions={versions} fromId={fromId} toId={toId} />
      {loadError ? <p role="alert">{loadError.endsWith('.') ? loadError : `${loadError}.`}</p> : null}
      {path && fromVersion && toVersion && !loadError ? (
        <>
          <p className="muted">Path: {path.map((version) => version.versionLabel).join(' → ')}</p>
          <h2>Recorded changes along the path</h2>
          {hops.every((hop) => hop.amendments.length === 0) ? (
            <p>
              No amendment records are stored for these hops. The side-by-side text below still compares the snapshots.
            </p>
          ) : null}
          {hops.map((hop) => {
            const touched = affectedNumbers(hop.amendments);
            const intermediate = hop.target.id !== toVersion.id;
            return (
              <details key={`${hop.source.id}-${hop.target.id}`} className="hop">
                <summary>
                  {hop.source.versionLabel} → {hop.target.versionLabel}
                </summary>
                {hop.amendments.map((amendment) => (
                  <article key={amendment.id}>
                    <p>
                      <strong>{amendment.title}</strong>
                      {amendment.enactedOn ? ` · ${amendment.enactedOn}` : ''}
                      {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
                    </p>
                    <p>{amendment.summary}</p>
                    <ul>
                      {amendment.changes.map((change) => (
                        <li key={change.id}>
                          <span className={`tag tag-${change.changeType}`}>{change.changeType}</span>
                          {change.articleNumber ? ` Article ${change.articleNumber}` : ''}
                          {change.nodeId && change.nodeId !== change.articleId ? ' (sub-article)' : ''}
                          {change.changedOn ? ` · changed ${change.changedOn}` : ''}
                          {change.effectiveOn ? ` · effective ${change.effectiveOn}` : ''}
                          {change.note ? ` — ${change.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
                {touched.length > 0 ? (
                  <details>
                    <summary>Articles touched in this hop ({touched.length})</summary>
                    <ul>
                      {touched.map((number) => {
                        const after = hop.articles.find((article) => article.articleNumber === number);
                        return (
                          <li key={number}>
                            <details>
                              <summary>
                                Article {number}
                                {after ? ` — ${after.title}` : ''}
                              </summary>
                              {after ? (
                                <ConstitutionText
                                  article={after}
                                  headingLevel="h3"
                                  showHeading={false}
                                  outline={constitution?.contentOutline}
                                />
                              ) : (
                                <p className="muted">No text in the later snapshot.</p>
                              )}
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ) : null}
                {intermediate && hop.articles.length > 0 ? (
                  <details>
                    <summary>
                      Intermediate snapshot {hop.target.versionLabel} ({hop.articles.length} articles)
                    </summary>
                    <ol>
                      {hop.articles.map((article) => (
                        <li key={article.id}>
                          <details>
                            <summary>
                              Article {article.articleNumber} — {article.title}
                            </summary>
                            <ConstitutionText
                              article={article}
                              headingLevel="h3"
                              showHeading={false}
                              outline={constitution?.contentOutline}
                            />
                          </details>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </details>
            );
          })}

          <h2>
            {fromVersion.versionLabel} and {toVersion.versionLabel} side by side
          </h2>
          <div className="compare-grid">
            <div className="compare-head">{fromVersion.versionLabel}</div>
            <div className="compare-head">{toVersion.versionLabel}</div>
            {numbers.map((number) => {
              const left = fromMap.get(number);
              const right = toMap.get(number);
              const kind = netArticleKind(left, right, recorded.get(number) ?? []);
              const rowId = compareRowId(number);
              return (
                <article key={number} id={rowId} className={`compare-row kind-${kind}`}>
                  <div>
                    <p className="compare-cell-label">{fromVersion.versionLabel}</p>
                    <p className="compare-kind">
                      <a href={`#${rowId}`}>{COMPARE_KIND_LABEL[kind]}</a>
                    </p>
                    {left ? (
                      <ConstitutionText article={left} headingLevel="h3" outline={constitution?.contentOutline} />
                    ) : (
                      <p className="muted">Not in {fromVersion.versionLabel}</p>
                    )}
                  </div>
                  <div>
                    <p className="compare-cell-label">{toVersion.versionLabel}</p>
                    {right ? (
                      <ConstitutionText article={right} headingLevel="h3" outline={constitution?.contentOutline} />
                    ) : (
                      <p className="muted">Not in {toVersion.versionLabel}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </PageMain>
  );
}
