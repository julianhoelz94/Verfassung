import { loadConstitutionCollection } from '../../../../lib/country-directory';
import { orderedTargets } from "../../../../lib/ordered-content";
import { footnoteItems } from '../../../../lib/footnotes';
import { changeTypeMessage, changeTypeTone } from '../../../../lib/ui-labels';
import { T } from '../../../components/TranslationProvider';
import { ui, message, type UiMessage } from '../../../../lib/messages';
import { currentLocale } from '../../../../lib/server-locale';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CompareView } from '../../../components/CompareView';
import { ConstitutionText } from '../../../components/ConstitutionText';
import { CopyLink } from '../../../components/CopyLink';
import { DiffConstitutionText } from '../../../components/DiffConstitutionText';
import { ReaderPage } from '../../../components/layout/templates';
import { AmendmentUnitLinks } from '../../../components/AmendmentUnitLinks';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { Badge, PageHeader } from '../../../components/ui';
import {
  ApiUnavailableError,
  getVersion,
  getReaderOutline,
  type ContentOutline,
  listAllUnits,
  listConstitutionAmendments,
  type Amendment,
  type ArticleSummary,
  type CountryDetail,
  type VersionSummary,
} from '../../../../lib/api';
import {
  COMPARE_KIND_LABEL,
  amendmentsBetween,
  canonicalCompareQuery,
  alignArticles,
  compareRequestError,
  compareRowId,
  netArticleKind,
  orderVersions,
  versionPath,
  type CompareKind,
} from '../../../../lib/compare';
import { articleHeading } from '../../../../lib/outline';
import { FormattedDate } from '../../../../lib/format-date';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../lib/page-meta';
import { publicVersions, publicVersionForSnapshot, snapshotVersionId } from '../../../../lib/reading';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { canVisitEditor } from '../../../../lib/nav';
import { CompareForm } from '../CompareForm';
import { Stack } from '../../../components/layout/Layout';

export type ComparePageProps = {
  params: Promise<{ code?: string; id?: string }>;
  searchParams: Promise<{ from?: string; to?: string; all?: string }>;
};

export async function generateMetadata(props: ComparePageProps): Promise<Metadata> {
  const params = await props.params;
  const query = await props.searchParams;
  try {
    const context = await loadConstitutionCollection(params);
    if (!context) return { title: atlasTitle('Compare') };
    const { collection, owner } = context;
    const requested = [query.from, query.to];
    const snapshots = await Promise.all(requested.map(id => id && !collection.constitutions.some(item => item.versions.some(version => version.id === id || snapshotVersionId(version) === id)) ? getVersion(id) : undefined));
    const constitution = collection.constitutions.find(item => item.versions.some(version => requested.some(id => id === version.id || id === snapshotVersionId(version))) || snapshots.some(snapshot => snapshot?.constitutionId === item.id)) ?? collection.constitutions[0];
    const versions = orderVersions(publicVersions(constitution?.versions ?? []));
    const selected = requested.map((id, index) => id ? versions.find(version => version.id === id || snapshotVersionId(version) === id || (snapshots[index]?.constitutionId === constitution?.id && (snapshots[index]?.legalVersionId ?? snapshots[index]?.id) === (version.legalVersionId ?? version.id))) : index === 0 ? versions[0] : versions[versions.length - 1]);
    const canonical = canonicalCompareQuery(selected[0]?.id, selected[1]?.id, versions);
    const fromId = query.from ?? (selected[0] ? snapshotVersionId(selected[0]) : undefined);
    const toId = query.to ?? (selected[1] ? snapshotVersionId(selected[1]) : undefined);
    return pageMetadata({
      title: atlasTitle(`Compare ${selected[0]?.versionLabel ?? '…'} → ${selected[1]?.versionLabel ?? '…'}`, collection.name),
      description: metaDescription(`Compare constitutional versions for ${collection.name}.`),
      path: canonical && fromId && toId ? `${owner.href}/compare?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}` : `${owner.href}/compare`,
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

function columnBadge(kind: CompareKind, side: 'from' | 'to'): { tone: 'added' | 'removed' | 'changed' | 'neutral'; label: UiMessage } {
  if (kind === 'added') {
    return side === 'from' ? { tone: 'removed', label: ui.countries.code.compare.page.notPresent } : { tone: 'added', label: COMPARE_KIND_LABEL.added };
  }
  if (kind === 'removed') {
    return side === 'from' ? { tone: 'removed', label: COMPARE_KIND_LABEL.removed } : { tone: 'removed', label: ui.countries.code.compare.page.notPresent };
  }
  if (kind === 'changed') {
    return { tone: 'changed', label: COMPARE_KIND_LABEL.changed };
  }
  return { tone: 'neutral', label: COMPARE_KIND_LABEL.same };
}

export default async function ComparePage(props: ComparePageProps) {
  const locale = await currentLocale();
  const params = await props.params;
  const searchParams = await props.searchParams;
  let context;
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    context = await loadConstitutionCollection(params);
    country = context?.collection ?? null;
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
  }

  if (error) {
    return (
      <ReaderPage width="content">
        <ServiceUnavailable service={ui.services.catalog} retryHref={`${params.id ? `/jurisdictions/${encodeURIComponent(params.id)}` : `/countries/${encodeURIComponent(params.code ?? "")}`}/compare`} />
      </ReaderPage>
    );
  }

  if (!country || !context) {
    notFound();
  }
  const routeBase = context.owner.href;

  const explicitSnapshots = await Promise.all(
    [searchParams.from, searchParams.to]
      .filter((id): id is string => Boolean(id))
      .map((id) => getVersion(id)),
  );
  const explicitConstitutionId = explicitSnapshots.find((version) => version)?.constitutionId;
  const constitution =
    country.constitutions.find((item) => item.id === explicitConstitutionId) ??
    country.constitutions.find((item) =>
      item.versions.some((version) => version.id === searchParams.from || version.id === searchParams.to),
    ) ?? country.constitutions[0];
  const versions = orderVersions(publicVersions(constitution?.versions ?? []));
  const fromDetail = explicitSnapshots.find((version) => version?.id === searchParams.from);
  const toDetail = explicitSnapshots.find((version) => version?.id === searchParams.to);
  const fromPublic = searchParams.from ? publicVersionForSnapshot(constitution?.versions ?? [], fromDetail?.legalVersionId ?? searchParams.from) : undefined;
  const toPublic = searchParams.to ? publicVersionForSnapshot(constitution?.versions ?? [], toDetail?.legalVersionId ?? searchParams.to) : undefined;
  const fromId = fromPublic?.id ?? searchParams.from ?? versions[0]?.id;
  const toId = toPublic?.id ?? searchParams.to ?? versions[versions.length - 1]?.id;
  const showAll = searchParams.all === '1';
  const user = await currentUser();
  const showReviewWarnings = Boolean(user && canVisitEditor(user.roles));
  const selectedError = compareRequestError(country.constitutions, fromId, toId, locale);
  const path = fromId && toId && constitution && !selectedError ? versionPath(versions, fromId, toId) : null;

  let fromArticles: ArticleSummary[] = [];
  let toArticles: ArticleSummary[] = [];
  let lawHops: LawHop[] = [];
  let fromOutline: ContentOutline | undefined;
  let toOutline: ContentOutline | undefined;
  let loadError: string | null = selectedError;

  if (path && path.length >= 2 && !selectedError && constitution) {
    try {
      const fromSnapshot = fromDetail?.constitutionId === constitution.id ? fromDetail.id : snapshotVersionId(path[0]);
      const toSnapshot = toDetail?.constitutionId === constitution.id ? toDetail.id : snapshotVersionId(path[path.length - 1]);
      [fromOutline, toOutline] = await Promise.all([getReaderOutline(fromSnapshot), getReaderOutline(toSnapshot)]).then((outlines) => outlines.map((outline) => outline ?? undefined));
      const [fromList, toList, constitutionAmendments] = await Promise.all([
        listAllUnits(
          fromDetail?.constitutionId === constitution.id
            ? fromDetail.id
            : snapshotVersionId(path[0]),
          true,
        ),
        listAllUnits(
          toDetail?.constitutionId === constitution.id
            ? toDetail.id
            : snapshotVersionId(path[path.length - 1]),
          true,
        ),
        listConstitutionAmendments(
          constitution.id,
          showReviewWarnings ? { status: 'all', authorization: await requireSessionBearer() } : undefined,
        ),
      ]);
      const pins = [...new Set((constitutionAmendments ?? []).flatMap((amendment) => [amendment.sourceVersionId, amendment.targetVersionId]).filter((id): id is string => Boolean(id)))];
      const pinDetails = await Promise.all(pins.map((id) => getVersion(id)));
      const legalPinIds = new Map(
        pinDetails
          .filter((version): version is NonNullable<typeof version> => version != null)
          .map((version) => [
            version.id,
            versions.find((publicVersion) => publicVersion.legalVersionId === (version.legalVersionId ?? version.id))?.id ?? version.id,
          ]),
      );
      const between = amendmentsBetween(
        (constitutionAmendments ?? []).map((amendment) => ({
          ...amendment,
          sourceVersionId: amendment.sourceVersionId ? legalPinIds.get(amendment.sourceVersionId) ?? amendment.sourceVersionId : null,
          targetVersionId: amendment.targetVersionId ? legalPinIds.get(amendment.targetVersionId) ?? amendment.targetVersionId : null,
        })),
        fromId!, toId!, versions,
      );
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
      loadError = message(locale, ui.errors.servicesUnavailable);
    }
  }

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
  const fromReaderId = fromDetail?.id ?? (fromVersion ? snapshotVersionId(fromVersion) : fromId ?? '');
  const toReaderId = toDetail?.id ?? (toVersion ? snapshotVersionId(toVersion) : toId ?? '');
  const formVersions = versions.map(version => {
    const pinned = [fromDetail, toDetail].find(snapshot => snapshot && (snapshot.legalVersionId ?? snapshot.id) === (version.legalVersionId ?? version.id));
    return { ...version, id: pinned?.id ?? snapshotVersionId(version) };
  });
  const fromCrossRefs = { ...(params.id ? { jurisdictionId: params.id } : { code: params.code }), versionId: fromReaderId, articlesByNumber: Object.fromEntries(fromArticles.map(item => [item.articleNumber, item.id])), unitsByLogicalId: orderedTargets(fromArticles), footnotes: footnoteItems(fromArticles.flatMap(item => item.content ?? []), routeBase + '/versions/' + fromReaderId) };
  const toCrossRefs = { ...(params.id ? { jurisdictionId: params.id } : { code: params.code }), versionId: toReaderId, articlesByNumber: Object.fromEntries(toArticles.map(item => [item.articleNumber, item.id])), unitsByLogicalId: orderedTargets(toArticles), footnotes: footnoteItems(toArticles.flatMap(item => item.content ?? []), routeBase + '/versions/' + toReaderId) };
  const rows = alignArticles(fromArticles, toArticles).map(({ key, left, right }) => {
    const number = right?.articleNumber ?? left?.articleNumber ?? '';
    const kind = netArticleKind(left, right, recorded.get(number) ?? []);
    return { key, number, left, right, kind, rowId: compareRowId(right?.logicalId ?? left?.logicalId ?? number) };
  });
  const visible = showAll ? rows : rows.filter((row) => row.kind !== 'same');
  const changedCount = rows.filter((row) => row.kind === 'changed').length;
  const addedCount = rows.filter((row) => row.kind === 'added').length;
  const removedCount = rows.filter((row) => row.kind === 'removed').length;
  const compareQuery =
    fromReaderId && toReaderId
      ? `from=${encodeURIComponent(fromReaderId)}&to=${encodeURIComponent(toReaderId)}`
      : '';
  const showAllHref = `${routeBase}/compare?${compareQuery}&all=1`;
  const hideUnchangedHref = `${routeBase}/compare?${compareQuery}`;

  return (
    <ReaderPage width="content" header={<PageHeader
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: routeBase, label: country.name },
          { label: <T value={ui.remainingStatus.compare} /> },
        ]}
        eyebrow={`${country.name}${constitution?.title ? ` · ${constitution.title}` : ''}`}
        title={<T value={ui.attrs.countriesCodeComparePagePageHeaderTitle} />}
        actions={<CopyLink />}
      />}>

      <CompareForm
        code={country.isoCode}
        actionHref={`${routeBase}/compare`}
        versions={formVersions}
        fromId={fromReaderId}
        toId={toReaderId}
        showAll={showAll}
      />
      {loadError ? <p role="alert">{loadError.endsWith('.') ? loadError : `${loadError}.`}</p> : null}
      {path && fromVersion && toVersion && !loadError ? (
        <>
          <div className="compare-summary">
            <Badge tone="changed">{changedCount} <T value={ui.countries.code.compare.page.changed} /></Badge>
            <Badge tone="added">{addedCount} <T value={ui.countries.code.compare.page.added} /></Badge>
            <Badge tone="removed">{removedCount} <T value={ui.countries.code.compare.page.removed} /></Badge>
            <Badge>
              {lawHops.length} <T value={lawHops.length === 1 ? ui.countries.code.compare.page.amendingLaw : ui.countries.code.compare.page.amendingLaws} />
            </Badge>
            <span className="muted">
              {showAll ? (
                <>
                  <T value={ui.countries.code.compare.page.allPassagesAreShown} />{" "}<a href={hideUnchangedHref}><T value={ui.countries.code.compare.page.onlyChanged} /></a>
                </>
              ) : (
                <>
                  <T value={ui.countries.code.compare.page.onlyChangedPassagesAreShown} />{' '}
                  <a href={showAllHref}><T value={ui.countries.code.compare.page.showAll} />{" "}{rows.length}</a>
                </>
              )}
            </span>
          </div>

          <CompareView fromLabel={fromVersion.versionLabel} toLabel={toVersion.versionLabel}>
            {lawHops.length === 0 ? (
              <p>
                <T value={ui.countries.code.compare.page.noLegalChangesAreRecordedBetweenThese} />{" "}</p>
            ) : null}
            {lawHops.map((hop, hopIndex) => {
              const amendment = hop.amendment;
              const needsReview = amendment.reviewStatus === 'needs_review';
              return (
                <details key={amendment.id} className="hop">
                  <summary>
                    <Badge tone="accent"><T value={ui.countries.code.compare.page.legalChange} />{" "}{hopIndex + 1}</Badge>
                    {showReviewWarnings && needsReview ? <Badge tone="changed"><T value={ui.countries.code.compare.page.needsReview} /></Badge> : null}
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
                  <Stack>
                    {amendment.changes.map((change) => (
                      <div key={change.id} className="change-row">
                        <Badge tone={changeTypeTone(change.changeType)}>{<T value={changeTypeMessage(change.changeType)} />}</Badge>
                        {change.articleNumber ? (
                          <a href={params.id ? `/constitutions/${constitution?.id}/amendments` : `/countries/${country.isoCode}/articles/${encodeURIComponent(change.articleNumber)}`}>
                            <T value={ui.countries.code.compare.page.art} />{" "}{change.articleNumber}
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
                        <AmendmentUnitLinks change={change} />
                      </div>
                    ))}
                  </Stack>
                </details>
              );
            })}

            <h2>
              {fromVersion.versionLabel} <T value={ui.countries.code.compare.page.and} />{" "}{toVersion.versionLabel} <T value={ui.countries.code.compare.page.sideBySide} />{" "}</h2>
            {visible.map((row) => {
              const heading = articleHeading(row.right ? toOutline : fromOutline, (row.right ?? row.left)!);
              const fromBadge = columnBadge(row.kind, 'from');
              const toBadge = columnBadge(row.kind, 'to');
              return (
                <section key={row.key} className={`compare-article kind-${row.kind}`}>
                  <h2 className="section-title" id={row.rowId}>
                    {heading}{' '}
                    <Badge tone={row.kind === 'same' ? 'neutral' : row.kind}><T value={COMPARE_KIND_LABEL[row.kind]} /></Badge>
                  </h2>
                  <div className="compare-grid">
                    <section className="compare-col compare-col-from" aria-label={fromVersion.versionLabel}>
                      <div className="compare-col-head">
                        {fromVersion.versionLabel}{' '}
                        <Badge tone={fromBadge.tone}><T value={fromBadge.label} /></Badge>
                      </div>
                      {row.kind === 'changed' && (row.left || row.right) ? (
                        <DiffConstitutionText
                          left={row.left}
                          right={row.right}
                          side="from"
                          footnotes={fromCrossRefs.footnotes} crossRefs={fromCrossRefs}
                          oppositeOutline={toOutline}
                          showHeading={true}
                          outline={fromOutline}
                          lang={fromVersion.languageCode}
                        />
                      ) : row.left ? (
                        <ConstitutionText
                          article={row.left}
                          crossRefs={fromCrossRefs}
                          headingLevel="h3"
                          showHeading={false}
                          headingIdPrefix="article-from"
                          outline={fromOutline}
                          lang={fromVersion.languageCode}
                        />
                      ) : (
                        <p className="muted">{message(locale, ui.countries.code.compare.page.passageNotPresentInVersion).replace('{version}', () => fromVersion.versionLabel)}</p>
                      )}
                    </section>
                    <section className="compare-col compare-col-to" aria-label={toVersion.versionLabel}>
                      <div className="compare-col-head">
                        {toVersion.versionLabel}{' '}
                        <Badge tone={toBadge.tone}><T value={toBadge.label} /></Badge>
                      </div>
                      {row.kind === 'changed' && (row.left || row.right) ? (
                        <DiffConstitutionText
                          left={row.left}
                          right={row.right}
                          side="to"
                          footnotes={toCrossRefs.footnotes} crossRefs={toCrossRefs}
                          oppositeOutline={fromOutline}
                          showHeading={true}
                          outline={toOutline}
                          lang={toVersion.languageCode}
                        />
                      ) : row.right ? (
                        <ConstitutionText
                          article={row.right}
                          crossRefs={toCrossRefs}
                          headingLevel="h3"
                          showHeading={false}
                          headingIdPrefix="article-to"
                          outline={toOutline}
                          lang={toVersion.languageCode}
                        />
                      ) : (
                        <p className="muted">{message(locale, ui.countries.code.compare.page.passageNotPresentInVersion).replace('{version}', () => toVersion.versionLabel)}</p>
                      )}
                    </section>
                  </div>
                </section>
              );
            })}
          </CompareView>
        </>
      ) : null}
    </ReaderPage>
  );
}
