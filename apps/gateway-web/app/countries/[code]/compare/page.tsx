import { notFound } from 'next/navigation';
import { CompareView } from '../../../components/CompareView';
import { ConstitutionText } from '../../../components/ConstitutionText';
import { CopyLink } from '../../../components/CopyLink';
import { DiffConstitutionText } from '../../../components/DiffConstitutionText';
import { PageMain } from '../../../components/PageMain';
import { PrintLink } from '../../../components/PrintLink';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { Badge, PageHeader } from '../../../components/ui';
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
  type CompareKind,
} from '../../../../lib/compare';
import { CompareForm } from '../CompareForm';

type ComparePageProps = {
  params: { code: string };
  searchParams: { from?: string; to?: string; all?: string };
};

type Hop = {
  source: VersionSummary;
  target: VersionSummary;
  amendments: Amendment[];
  articles: ArticleSummary[];
};

function columnBadge(kind: CompareKind, side: 'from' | 'to'): { tone: 'added' | 'removed' | 'changed' | 'neutral'; label: string } {
  if (kind === 'added') {
    return side === 'from' ? { tone: 'removed', label: 'not present' } : { tone: 'added', label: 'added' };
  }
  if (kind === 'removed') {
    return side === 'from' ? { tone: 'removed', label: 'removed' } : { tone: 'removed', label: 'not present' };
  }
  if (kind === 'changed') {
    return { tone: 'changed', label: 'changed' };
  }
  return { tone: 'neutral', label: 'unchanged' };
}

function hopChangeTone(changeType: string): 'added' | 'removed' | 'changed' | 'neutral' {
  if (changeType === 'added' || changeType === 'removed' || changeType === 'changed') {
    return changeType;
  }
  return 'neutral';
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
  const showAll = searchParams.all === '1';
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
  const rows = numbers.map((number) => {
    const left = fromMap.get(number);
    const right = toMap.get(number);
    const kind = netArticleKind(left, right, recorded.get(number) ?? []);
    return { number, left, right, kind, rowId: compareRowId(number) };
  });
  const visible = showAll ? rows : rows.filter((row) => row.kind !== 'same');
  const changedCount = rows.filter((row) => row.kind === 'changed').length;
  const addedCount = rows.filter((row) => row.kind === 'added').length;
  const removedCount = rows.filter((row) => row.kind === 'removed').length;
  const compareQuery =
    fromId && toId
      ? `from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`
      : '';
  const showAllHref = `/countries/${country.isoCode}/compare?${compareQuery}&all=1`;
  const hideUnchangedHref = `/countries/${country.isoCode}/compare?${compareQuery}`;

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: 'Compare' },
        ]}
        eyebrow={`${country.name}${constitution?.title ? ` · ${constitution.title}` : ''}`}
        title="Compare versions"
        actions={
          <>
            <CopyLink />
            <PrintLink />
          </>
        }
      />
      <CompareForm
        code={country.isoCode}
        versions={versions}
        fromId={fromId}
        toId={toId}
        showAll={showAll}
      />
      {loadError ? <p role="alert">{loadError.endsWith('.') ? loadError : `${loadError}.`}</p> : null}
      {path && fromVersion && toVersion && !loadError ? (
        <>
          <div className="compare-summary">
            <Badge tone="changed">{changedCount} changed</Badge>
            <Badge tone="added">{addedCount} added</Badge>
            <Badge tone="removed">{removedCount} removed</Badge>
            <Badge>
              {hops.length} amendment hop{hops.length === 1 ? '' : 's'}
            </Badge>
            <span className="muted">
              {showAll ? (
                <>
                  All articles are shown. <a href={hideUnchangedHref}>Only changed</a>
                </>
              ) : (
                <>
                  Only changed articles are shown.{' '}
                  <a href={showAllHref}>Show all {rows.length}</a>
                </>
              )}
            </span>
          </div>

          <CompareView fromLabel={fromVersion.versionLabel} toLabel={toVersion.versionLabel}>
            {hops.every((hop) => hop.amendments.length === 0) ? (
              <p>
                No amendment records are stored for these hops. The side-by-side text below still compares the snapshots.
              </p>
            ) : null}
            {hops.map((hop, hopIndex) => {
              const intermediate = hop.target.id !== toVersion.id;
              const lawCount = hop.amendments.length;
              const lastLaw = hop.amendments[hop.amendments.length - 1];
              return (
                <details key={`${hop.source.id}-${hop.target.id}`} className="hop">
                  <summary>
                    <Badge tone="accent">Hop {hopIndex + 1}</Badge>
                    <span>
                      {hop.source.versionLabel} → {hop.target.versionLabel}
                    </span>
                    <span className="muted">
                      · {lawCount} amending law{lawCount === 1 ? '' : 's'}
                      {lastLaw?.sourceReference
                        ? ` · last: ${lastLaw.sourceReference}${lastLaw.enactedOn ? ` (${lastLaw.enactedOn})` : ''}`
                        : ''}
                    </span>
                  </summary>
                  <div className="stack">
                    {hop.amendments.map((amendment) =>
                      amendment.changes.map((change) => (
                          <div key={change.id} className="change-row">
                            <Badge tone={hopChangeTone(change.changeType)}>{change.changeType}</Badge>
                            {change.articleNumber ? (
                              <a href={`/countries/${country.isoCode}/articles/${encodeURIComponent(change.articleNumber)}`}>
                                Art. {change.articleNumber}
                              </a>
                            ) : null}
                            <span className="muted">
                              {amendment.title}
                              {change.note ? ` · ${change.note}` : ''}
                              {change.changedOn ? ` · ${change.changedOn}` : ''}
                            </span>
                          </div>
                      )),
                    )}
                    {intermediate && hop.articles.length > 0 ? (
                      <details>
                        <summary>
                          Intermediate snapshot {hop.target.versionLabel} ({hop.articles.length} articles)
                        </summary>
                        <ol>
                          {hop.articles.map((article) => (
                            <li key={article.id}>
                              Article {article.articleNumber} — {article.title}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                </details>
              );
            })}

            <h2>
              {fromVersion.versionLabel} and {toVersion.versionLabel} side by side
            </h2>
            {visible.map((row) => {
              const title = row.right?.title ?? row.left?.title ?? '';
              const fromBadge = columnBadge(row.kind, 'from');
              const toBadge = columnBadge(row.kind, 'to');
              return (
                <section key={row.number} className={`compare-article kind-${row.kind}`}>
                  <h2 className="section-title" id={row.rowId}>
                    Art. {row.number}
                    {title ? ` · ${title}` : ''}{' '}
                    <a href={`#${row.rowId}`}>{COMPARE_KIND_LABEL[row.kind]}</a>
                  </h2>
                  <div className="compare-grid">
                    <section className="compare-col compare-col-from" aria-label={fromVersion.versionLabel}>
                      <div className="compare-col-head">
                        {fromVersion.versionLabel}{' '}
                        <Badge tone={fromBadge.tone}>{fromBadge.label}</Badge>
                      </div>
                      {row.kind === 'changed' && (row.left || row.right) ? (
                        <DiffConstitutionText
                          left={row.left}
                          right={row.right}
                          side="from"
                          showHeading={false}
                          outline={constitution?.contentOutline}
                        />
                      ) : row.left ? (
                        <ConstitutionText
                          article={row.left}
                          headingLevel="h3"
                          showHeading={false}
                          headingIdPrefix="article-from"
                          outline={constitution?.contentOutline}
                        />
                      ) : (
                        <p className="muted">This article did not exist in the {fromVersion.versionLabel} text.</p>
                      )}
                    </section>
                    <section className="compare-col compare-col-to" aria-label={toVersion.versionLabel}>
                      <div className="compare-col-head">
                        {toVersion.versionLabel}{' '}
                        <Badge tone={toBadge.tone}>{toBadge.label}</Badge>
                      </div>
                      {row.kind === 'changed' && (row.left || row.right) ? (
                        <DiffConstitutionText
                          left={row.left}
                          right={row.right}
                          side="to"
                          showHeading={false}
                          outline={constitution?.contentOutline}
                        />
                      ) : row.right ? (
                        <ConstitutionText
                          article={row.right}
                          headingLevel="h3"
                          showHeading={false}
                          headingIdPrefix="article-to"
                          outline={constitution?.contentOutline}
                        />
                      ) : (
                        <p className="muted">This article did not exist in the {toVersion.versionLabel} text.</p>
                      )}
                    </section>
                  </div>
                </section>
              );
            })}
          </CompareView>
        </>
      ) : null}
    </PageMain>
  );
}
