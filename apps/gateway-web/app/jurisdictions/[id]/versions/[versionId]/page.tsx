import { notFound } from 'next/navigation';
import { FullWidthPage } from '../../../../components/layout/PageChrome';
import { ReaderPage } from '../../../../components/layout/templates';
import { Pager } from '../../../../components/ui';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import { ReaderDetails } from '../../../../components/ReaderDetails';
import { T } from '../../../../components/TranslationProvider';
import { getJurisdiction } from '../../../../../lib/migration-api';
import { getReaderOutline, getVersion, listAllUnits, listAmendments, getWikiPage } from '../../../../../lib/api';
import { migrationUi } from '../../../../../lib/migration-messages';
import { ui } from '../../../../../lib/messages';
import { SnapshotNotice } from '../../../../components/SnapshotNotice';
import { VersionReader } from '../../../../components/VersionReader';
import { VersionDocuments } from '../../../../components/VersionDocuments';
import { WikiContent } from '../../../../components/WikiContent';
import { ContentTranslationRegion } from '../../../../components/ContentTranslationRegion';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { publicSnapshotContext, publicVersions, snapshotVersionId } from '../../../../../lib/reading';
import { orderVersions } from '../../../../../lib/compare';
import { currentLocale } from '../../../../../lib/server-locale';
import { currentUser } from '../../../../../lib/session';

export default async function JurisdictionVersionPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params, href = `/jurisdictions/${id}/versions/${versionId}`, locale = await currentLocale();
  const data = await Promise.all([getJurisdiction(id), getVersion(versionId), listAllUnits(versionId, true), getReaderOutline(versionId)]).catch(() => null);
  if (!data) return <ReaderPage width="content"><ServiceUnavailable service={ui.services.content} retryHref={href} /></ReaderPage>;
  const [detail, snapshot, articles, outline] = data;
  if (!detail || !snapshot || snapshot.jurisdictionId !== id) notFound();
  const context = publicSnapshotContext(detail, snapshot);
  if (!context) notFound();
  const { constitution, version } = context, line = orderVersions(publicVersions(constitution.versions));
  const index = line.findIndex(item => item.id === version.id), previous = index > 0 ? line[index - 1] : undefined, next = index >= 0 ? line[index + 1] : undefined;
  const user = await currentUser(), canEdit = Boolean(user?.roles.some(role => role === 'editor' || role === 'admin'));
  const [wikiResult, amendments] = await Promise.all([getWikiPage('constitution', constitution.id).then(wiki => ({ wiki, unavailable: false })).catch(() => ({ wiki: null, unavailable: true })), listAmendments(versionId).catch(() => [])]);
  const { wiki, unavailable: wikiUnavailable } = wikiResult;
  const changeByArticle: Record<string, string> = {};
  for (const amendment of amendments ?? []) for (const change of amendment.changes) if (change.articleNumber && !changeByArticle[change.articleNumber]) changeByArticle[change.articleNumber] = change.changeType;
  const publications = line.map(item => ({ id: item.id, snapshotId: snapshotVersionId(item), versionLabel: item.versionLabel, effectiveDate: item.effectiveDate }));
  if (!publications.some(item => item.snapshotId === versionId)) publications.splice(Math.max(0, index), 0, { id: version.id, snapshotId: versionId, versionLabel: version.versionLabel + ' · ' + versionId.slice(0, 8), effectiveDate: version.effectiveDate });
  return <FullWidthPage template="reader"><ContentTranslationRegion sourceLanguage={snapshot.languageCode}>
    <VersionReader jurisdictionId={id} versionId={versionId} articles={articles} outline={outline ?? constitution.contentOutline} language={snapshot.languageCode}
      changeByArticle={changeByArticle} unchangedSinceLabel={previous?.versionLabel}
      context={{ constitutionId: constitution.id, title: constitution.title, jurisdictionName: detail.jurisdiction.name, versionLabel: version.versionLabel, publications,
        overviewHref: `/jurisdictions/${id}`, wikiState: wiki ? 'published' : wikiUnavailable ? 'unavailable' : 'empty' }}
      breadcrumbs={<Breadcrumbs items={[{ href: '/jurisdictions', label: <T value={migrationUi.jurisdictions} /> }, ...detail.ancestors.map(item => ({ href: `/jurisdictions/${item.id}`, label: item.name })), { href: `/jurisdictions/${id}`, label: detail.jurisdiction.name }, { label: constitution.title }]} />}
      wiki={wiki ? <ContentTranslationRegion sourceLanguage="auto"><WikiContent page={wiki} /></ContentTranslationRegion> : undefined}
      details={<ReaderDetails constitution={constitution} jurisdictionName={detail.jurisdiction.name} version={version} snapshot={snapshot} locale={locale} sourceEvidence={snapshot.sourceEvidence} canEditSource={canEdit && snapshotVersionId(version) === versionId}>
        <p><a href={`/jurisdictions/${id}`}><T value={migrationUi.jurisdictions} /></a></p><p><a href={`/constitutions/${constitution.id}/amendments`}><T value={migrationUi.amendmentRegister} /></a></p><VersionDocuments compact constitutionId={constitution.id} versionId={versionId} legalVersionId={snapshot.legalVersionId ?? snapshot.id} />
      </ReaderDetails>}
      notices={<SnapshotNotice jurisdictionId={id} viewedId={versionId} currentId={snapshotVersionId(version)} />}
      footer={<Pager previous={previous ? { href: `/jurisdictions/${id}/versions/${snapshotVersionId(previous)}`, label: `← ${previous.versionLabel}` } : undefined} next={next ? { href: `/jurisdictions/${id}/versions/${snapshotVersionId(next)}`, label: `${next.versionLabel} →` } : undefined} />}
    />
  </ContentTranslationRegion></FullWidthPage>;
}
