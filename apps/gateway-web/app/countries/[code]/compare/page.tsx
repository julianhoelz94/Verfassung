import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
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
  listConstitutionAmendments,
  getCountry,
  type Amendment,
  type ArticleSummary,
  type CountryDetail,
  type VersionSummary,
} from '../../../../lib/api';
import {
  COMPARE_KIND_LABEL,
  amendmentsBetween,
  canonicalCompareQuery,
  compareArticleNumbers,
  compareRequestError,
  compareRowId,
  netArticleKind,
  orderVersions,
  versionPath,
  type CompareKind,
} from '../../../../lib/compare';
import { FormattedDate } from '../../../../lib/format-date';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../lib/page-meta';
import { publicVersions } from '../../../../lib/reading';
import { CompareForm } from '../CompareForm';

type ComparePageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string; to?: string; all?: string }>;
};

export async function generateMetadata(props: ComparePageProps): Promise<Metadata> {
  const params = await props.params;
  const searchParams = await props.searchParams;
  try {
    const country = await getCountry(params.code);
    if (!country) {
      return { title: atlasTitle('Compare') };
    }
    const constitution =
      country.constitutions.find((item) =>
        item.versions.some(
          (version) => version.id === searchParams.from || version.id === searchParams.to,
        ),
      ) ?? country.constitutions[0];
    const versions = orderVersions(publicVersions(constitution?.versions ?? []));
    const fromId = searchParams.from ?? versions[0]?.id;
    const toId = searchParams.to ?? versions[versions.length - 1]?.id;
    const canonical = canonicalCompareQuery(fromId, toId, versions);
    const fromVersion = versions.find((version) => version.id === (canonical?.from ?? fromId));
    const toVersion = versions.find((version) => version.id === (canonical?.to ?? toId));
    const fromLabel = fromVersion?.versionLabel ?? '…';
    const toLabel = toVersion?.versionLabel ?? '…';
    const path = canonical
      ? `/countries/${country.isoCode}/compare?from=${encodeURIComponent(canonical.from)}&to=${encodeURIComponent(canonical.to)}`
      : `/countries/${country.isoCode}/compare`;
    return pageMetadata({
      title: atlasTitle(`Compare ${fromLabel} → ${toLabel}`, country.name),
      description: metaDescription(`Compare constitutional versions for ${country.name}.`),
      path,
    });
  } catch {
    return { title: atlasTitle('Compare') };
  }
}

type LawHop = {
  amendment: Amendment;
  source?: VersionSummary;
  target?: VersionSummary;
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

export default async function ComparePage(props: ComparePageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
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
  const versions = orderVersions(publicVersions(constitution?.versions ?? []));
  const fromId = searchParams.from ?? versions[0]?.id;
  const toId = searchParams.to ?? versions[versions.length - 1]?.id;
  const showAll = searchParams.all === '1';
  const selectedError = compareRequestError(country.constitutions, fromId, toId);
  const path = fromId && toId && constitution && !selectedError ? versionPath(versions, fromId, toId) : null;

  let fromArticles: ArticleSummary[] = [];
  let toArticles: ArticleSummary[] = [];
  let lawHops: LawHop[] = [];
  let loadError: string | null = selectedError;

  if (path && path.length >= 2 && !selectedError && constitution) {
    try {
      const [fromList, toList, constitutionAmendments] = await Promise.all([
        listAllArticles(path[0].id, true),
        listAllArticles(path[path.length - 1].id, true),
        listConstitutionAmendments(constitution.id),
      ]);
      const between = amendmentsBetween(constitutionAmendments ?? [], fromId!, toId!, versions);
      lawHops = between.map((amendment) => ({
        amendment,
        source: amendment.sourceVersionId
          ? versions.find((version) => version.id === amendment.sourceVersionId)
          : undefined,
        target: amendment.targetVersionId
          ? versions.find((version) => version.id === amendment.targetVersionId)
          : undefined,
      }));
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
  for (const hop of lawHops) {
    for (const change of hop.amendment.changes) {
      if (change.articleNumber) {
        const types = recorded.get(change.articleNumber) ?? [];
        types.push(change.changeType);
        recorded.set(change.articleNumber, types);
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
              {lawHops.length} amending law{lawHops.length === 1 ? '' : 's'}
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
            {lawHops.length === 0 ? (
              <p>
                No amending laws are recorded between these versions. The side-by-side text below still compares the snapshots.
              </p>
            ) : null}
            {lawHops.map((hop, hopIndex) => {
              const amendment = hop.amendment;
              const isErrata = amendment.kind === 'official_errata';
              return (
                <details key={amendment.id} className="hop">
                  <summary>
                    <Badge tone="accent">Law {hopIndex + 1}</Badge>
                    {isErrata ? <Badge tone="info">Official errata</Badge> : null}
                    <span>{amendment.title}</span>
                    <span className="muted">
                      {hop.source && hop.target ? (
                        <>
                          {' · '}
                          {hop.source.versionLabel} → {hop.target.versionLabel}
                        </>
                      ) : null}
                      {amendment.sourceReference ? (
                        <>
                          {' · '}
                          {amendment.sourceReference}
                        </>
                      ) : null}
                      {amendment.enactedOn ? (
                        <>
                          {' ('}
                          <FormattedDate value={amendment.enactedOn} />
                          {')'}
                        </>
                      ) : null}
                    </span>
                  </summary>
                  <div className="stack">
                    {amendment.changes.map((change) => (
                      <div key={change.id} className="change-row">
                        <Badge tone={hopChangeTone(change.changeType)}>{change.changeType}</Badge>
                        {change.articleNumber ? (
                          <a href={`/countries/${country.isoCode}/articles/${encodeURIComponent(change.articleNumber)}`}>
                            Art. {change.articleNumber}
                          </a>
                        ) : null}
                        <span className="muted">
                          {change.note ? change.note : null}
                          {change.changedOn ? (
                            <>
                              {change.note ? ' · ' : ''}
                              <FormattedDate value={change.changedOn} />
                            </>
                          ) : null}
                        </span>
                      </div>
                    ))}
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
                          lang={fromVersion.languageCode}
                        />
                      ) : row.left ? (
                        <ConstitutionText
                          article={row.left}
                          headingLevel="h3"
                          showHeading={false}
                          headingIdPrefix="article-from"
                          outline={constitution?.contentOutline}
                          lang={fromVersion.languageCode}
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
                          lang={toVersion.languageCode}
                        />
                      ) : row.right ? (
                        <ConstitutionText
                          article={row.right}
                          headingLevel="h3"
                          showHeading={false}
                          headingIdPrefix="article-to"
                          outline={constitution?.contentOutline}
                          lang={toVersion.languageCode}
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
