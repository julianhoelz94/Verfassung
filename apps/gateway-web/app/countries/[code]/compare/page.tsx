import { Breadcrumbs } from '../../../components/Breadcrumbs';
import {
  ApiUnavailableError,
  listAmendments,
  listArticlePage,
  getCountry,
  type Amendment,
  type ArticleSummary,
  type CountryDetail,
  type VersionSummary,
} from '../../../../lib/api';
import { compareArticleNumbers, versionPath } from '../../../../lib/compare';
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
      <main>
        <p>{error}.</p>
      </main>
    );
  }

  if (!country) {
    return (
      <main>
        <p>Unknown country.</p>
      </main>
    );
  }

  const constitution =
    country.constitutions.find((item) =>
      item.versions.some((version) => version.id === searchParams.from || version.id === searchParams.to),
    ) ?? country.constitutions[0];
  const versions = constitution?.versions ?? [];
  const fromId = searchParams.from ?? versions[0]?.id;
  const toId = searchParams.to ?? versions[versions.length - 1]?.id;
  const path = fromId && toId ? versionPath(versions, fromId, toId) : null;

  let fromArticles: ArticleSummary[] = [];
  let toArticles: ArticleSummary[] = [];
  let hops: Hop[] = [];
  let pathError: string | null = null;

  if (!path || path.length < 2) {
    pathError =
      fromId && toId && fromId === toId
        ? 'Choose two different versions along the published line.'
        : 'Those versions are not a forward path on this constitution’s published line.';
  } else {
    try {
      const hopPairs = path.slice(0, -1).map((source, index) => ({
        source,
        target: path[index + 1],
      }));
      const [fromPage, toPage] = await Promise.all([
        listArticlePage(path[0].id, 0, 200, true),
        listArticlePage(path[path.length - 1].id, 0, 200, true),
      ]);
      hops = await Promise.all(
        hopPairs.map(async (pair) => {
          const [amendments, articles] = await Promise.all([
            listAmendments(pair.target.id, pair.source.id),
            listArticlePage(pair.target.id, 0, 200, true),
          ]);
          return {
            source: pair.source,
            target: pair.target,
            amendments: amendments ?? [],
            articles: articles?.items ?? [],
          };
        }),
      );
      fromArticles = fromPage?.items ?? [];
      toArticles = toPage?.items ?? [];
    } catch (e) {
      pathError = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    }
  }

  const fromMap = new Map(fromArticles.map((article) => [article.articleNumber, article]));
  const toMap = new Map(toArticles.map((article) => [article.articleNumber, article]));
  const numbers = [...new Set([...fromMap.keys(), ...toMap.keys()])].sort(compareArticleNumbers);
  const recorded = new Map<string, string>();
  for (const hop of hops) {
    for (const amendment of hop.amendments) {
      for (const change of amendment.changes) {
        if (change.articleNumber) {
          recorded.set(change.articleNumber, change.changeType);
        }
      }
    }
  }

  const fromVersion = path?.[0];
  const toVersion = path?.[path.length - 1];

  return (
    <main className="wide">
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
      {pathError ? <p>{pathError}.</p> : null}
      {path && fromVersion && toVersion && !pathError ? (
        <>
          <p className="muted">
            Path:{' '}
            {path.map((version) => version.versionLabel).join(' → ')}
          </p>
          <h2>Recorded changes along the path</h2>
          {hops.every((hop) => hop.amendments.length === 0) ? (
            <p>No amendment records are stored for these hops. The side-by-side text below still compares the snapshots.</p>
          ) : null}
          {hops.map((hop) => {
            const touched = affectedNumbers(hop.amendments);
            const intermediate = hop.target.id !== toVersion.id;
            return (
              <section key={`${hop.source.id}-${hop.target.id}`} className="hop">
                <h3>
                  {hop.source.versionLabel} → {hop.target.versionLabel}
                </h3>
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
                    <summary>
                      Articles touched in this hop ({touched.length})
                    </summary>
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
                              {after?.body ? <p>{after.body}</p> : <p className="muted">No text in the later snapshot.</p>}
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
                            <p>{article.body}</p>
                          </details>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </section>
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
              const recordedType = recorded.get(number);
              let kind = 'same';
              if (!left && right) {
                kind = 'added';
              } else if (left && !right) {
                kind = 'removed';
              } else if (recordedType) {
                kind = recordedType;
              } else if ((left?.body ?? '') !== (right?.body ?? '')) {
                kind = 'changed';
              }
              return (
                <article key={number} className={`compare-row kind-${kind}`}>
                  <div>
                    {left ? (
                      <>
                        <h3>
                          Article {left.articleNumber} — {left.title}
                        </h3>
                        <p>{left.body}</p>
                      </>
                    ) : (
                      <p className="muted">Not in {fromVersion.versionLabel}</p>
                    )}
                  </div>
                  <div>
                    {right ? (
                      <>
                        <h3>
                          Article {right.articleNumber} — {right.title}
                        </h3>
                        <p>{right.body}</p>
                      </>
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
    </main>
  );
}
