import { notFound } from 'next/navigation';
import { ReaderPage } from '../../../../components/layout/templates';
import { Badge, PageHeader, Pager } from '../../../../components/ui';
import { T } from '../../../../components/TranslationProvider';
import { getJurisdiction } from '../../../../../lib/migration-api';
import { getReaderOutline, getVersion, listAllUnits, listAmendments } from '../../../../../lib/api';
import { migrationUi } from '../../../../../lib/migration-messages';
import { ui } from '../../../../../lib/messages';
import { SourceEvidenceNotice } from '../../../../components/SourceEvidenceNotice';
import { SnapshotNotice } from '../../../../components/SnapshotNotice';
import { VersionReader } from '../../../../components/VersionReader';
import { VersionDocuments } from '../../../../components/VersionDocuments';
import { SiteSearchForm } from '../../../../components/SiteSearchForm';
import { ContentTranslationRegion } from '../../../../components/ContentTranslationRegion';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { publicSnapshotContext, publicVersions, snapshotVersionId } from '../../../../../lib/reading';
import { orderVersions } from '../../../../../lib/compare';
import { currentLocale } from '../../../../../lib/server-locale';
import { httpUrl, provenanceLabel, verificationLabel } from '../../../../../lib/provenance';
import { FormattedDate } from '../../../../../lib/format-date';

export default async function JurisdictionVersionPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const href = `/jurisdictions/${id}/versions/${versionId}`;
  const locale = await currentLocale();
  const data = await Promise.all([getJurisdiction(id), getVersion(versionId), listAllUnits(versionId, true), getReaderOutline(versionId)])
    .catch(() => null);
  if (!data) return <ReaderPage width="content"><ServiceUnavailable service={ui.services.content} retryHref={href} /></ReaderPage>;
  const [detail, snapshot, articles, outline] = data;
  if (!detail || !snapshot || snapshot.jurisdictionId !== id) notFound();
  const context = publicSnapshotContext(detail, snapshot);
  if (!context) notFound();
  const { constitution, version } = context;
  const line = orderVersions(publicVersions(constitution.versions));
  const index = line.findIndex(item => item.id === version.id);
  const previous = index > 0 ? line[index - 1] : undefined;
  const next = index >= 0 ? line[index + 1] : undefined;
  const sourceHref = httpUrl(version.sourceUrl);
  const changeByArticle: Record<string, string> = {};
  for (const amendment of (await listAmendments(versionId).catch(() => [])) ?? []) {
    for (const change of amendment.changes) {
      if (change.articleNumber && !changeByArticle[change.articleNumber]) changeByArticle[change.articleNumber] = change.changeType;
    }
  }
  return <ReaderPage width="content" header={<PageHeader
    title={version.effectiveDate ? <><T value={ui.countries.code.versions.versionid.page.versionInForceSince} />{' '}<FormattedDate value={version.effectiveDate} /></> : `${constitution.title} · ${version.versionLabel}`}
    eyebrow={`${detail.jurisdiction.name} · ${constitution.title}`}
    breadcrumbs={[
      { href: '/jurisdictions', label: <T value={migrationUi.jurisdictions} /> },
      ...detail.ancestors.map(item => ({ href: `/jurisdictions/${item.id}`, label: item.name })),
      { href: `/jurisdictions/${id}`, label: detail.jurisdiction.name }, { label: version.versionLabel },
    ]}
    meta={<>
      <Badge tone="info">{verificationLabel(version, locale)}</Badge>
      <span>{snapshot.languageCode}</span>
      <span>{provenanceLabel(version.provenance, locale)}</span>
      {version.gazetteReference ? <span>{version.gazetteReference}</span> : null}
      {sourceHref ? <a href={sourceHref} rel="noreferrer"><T value={ui.countries.code.versions.versionid.page.source} /></a> : null}
    </>}
  />}>
    {detail.jurisdiction.historical ? <p><T value={migrationUi.historical} /></p> : null}
    <SourceEvidenceNotice evidence={snapshot.sourceEvidence} versionId={versionId} />
    <p><a href={`/constitutions/${constitution.id}/amendments`}><T value={migrationUi.amendmentRegister} /></a></p>
    <SnapshotNotice jurisdictionId={id} viewedId={versionId} currentId={version.currentVersionId ?? version.id} />
    <VersionDocuments constitutionId={constitution.id} versionId={versionId} legalVersionId={snapshot.legalVersionId ?? snapshot.id} />
    <SiteSearchForm id="version-search" className="version-search" jurisdictionId={id} versionId={versionId} visibleLabel submitClassName="btn" />
    {articles.length ? <ContentTranslationRegion sourceLanguage={snapshot.languageCode}>
      <VersionReader initialDepth="full" jurisdictionId={id} versionId={versionId} articles={articles} outline={outline ?? constitution.contentOutline}
        language={snapshot.languageCode} changeByArticle={changeByArticle} unchangedSinceLabel={previous?.versionLabel} />
    </ContentTranslationRegion> : <p><T value={ui.countries.code.versions.versionid.page.noArticlesArePublishedInThisVersion} /></p>}
    <Pager previous={previous ? { href: `/jurisdictions/${id}/versions/${snapshotVersionId(previous)}`, label: `← ${previous.versionLabel}` } : undefined}
      next={next ? { href: `/jurisdictions/${id}/versions/${snapshotVersionId(next)}`, label: `${next.versionLabel} →` } : undefined} />
  </ReaderPage>;
}
