import { notFound } from 'next/navigation';
import { CountryNavigation } from '../../../../components/CountryNavigation';
import { SnapshotNotice } from '../../../../components/SnapshotNotice';
import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { currentLocale } from '../../../../../lib/server-locale';
import { FullWidthPage } from '../../../../components/layout/PageChrome';
import { ReaderPage } from '../../../../components/layout/templates';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { Alert, Pager } from '../../../../components/ui';
import { VersionReader } from '../../../../components/VersionReader';
import { ReaderDetails } from '../../../../components/ReaderDetails';
import { ContentTranslationRegion } from '../../../../components/ContentTranslationRegion';
import { WikiContent } from '../../../../components/WikiContent';
import { listAllUnits, listAmendments, getCountry, getReaderOutline, getVersion, getWikiPage } from '../../../../../lib/api';
import { orderVersions } from '../../../../../lib/compare';
import { publicSnapshotContext, snapshotVersionId, publicVersions } from '../../../../../lib/reading';
import { VersionDocuments } from '../../../../components/VersionDocuments';
import { currentUser } from '../../../../../lib/session';
import { EditorEntry } from './EditorEntry';
import { migrationUi } from '../../../../../lib/migration-messages';

export async function CountryConstitutionReader({ code, versionId, error, initialPassage }: {
  code: string; versionId: string; error?: string; initialPassage?: { id: string; legacyId?: string };
}) {
  const locale = await currentLocale(), params = { code, versionId };
  const href = `/countries/${params.code}/versions/${params.versionId}`;
  const data = await Promise.all([getCountry(params.code), getVersion(params.versionId), listAllUnits(params.versionId, true), getReaderOutline(params.versionId)]).catch(() => null);
  if (!data) return <ReaderPage width="content"><ServiceUnavailable service={ui.services.content} retryHref={href} /></ReaderPage>;
  const [country, snapshot, articles, outline] = data;
  const context = publicSnapshotContext(country, snapshot);
  if (!country || !snapshot || !context) notFound();
  const { constitution, version } = context, line = orderVersions(publicVersions(constitution.versions));
  const index = line.findIndex(item => item.id === version.id), previous = index > 0 ? line[index - 1] : undefined, next = index >= 0 ? line[index + 1] : undefined;
  const user = await currentUser();
  const canEdit = Boolean(user?.roles.some(role => role === 'editor' || role === 'admin'));
  const canReview = Boolean(user?.roles.some(role => role === 'reviewer' || role === 'admin'));
  const canPublish = Boolean(user?.roles.some(role => role === 'publisher' || role === 'admin'));
  const changeByArticle: Record<string, string> = {};
  const [wikiResult, amendments] = await Promise.all([
    getWikiPage('constitution', constitution.id).then(wiki => ({ wiki, unavailable: false })).catch(() => ({ wiki: null, unavailable: true })),
    listAmendments(params.versionId).catch(() => []),
  ]);
  const { wiki, unavailable: wikiUnavailable } = wikiResult;
  for (const amendment of amendments ?? []) for (const change of amendment.changes) if (change.articleNumber && !changeByArticle[change.articleNumber]) changeByArticle[change.articleNumber] = change.changeType;
  const publications = line.map(item => ({ id: item.id, snapshotId: snapshotVersionId(item), versionLabel: item.versionLabel, effectiveDate: item.effectiveDate }));
  if (!publications.some(item => item.snapshotId === params.versionId)) publications.splice(Math.max(0, index), 0, { id: version.id, snapshotId: params.versionId, versionLabel: version.versionLabel + ' · ' + params.versionId.slice(0, 8), effectiveDate: version.effectiveDate });
  return <FullWidthPage template="reader"><ContentTranslationRegion sourceLanguage={snapshot.languageCode}>
    <VersionReader initialPassage={initialPassage} code={country.isoCode} versionId={params.versionId} articles={articles} outline={outline ?? constitution.contentOutline}
      language={snapshot.languageCode} changeByArticle={changeByArticle} unchangedSinceLabel={previous?.versionLabel}
      context={{ constitutionId: constitution.id, title: constitution.title, jurisdictionName: country.name, versionLabel: version.versionLabel,
        publications, overviewHref: `/countries/${country.isoCode}/constitutions/${constitution.id}`, comparisonHref: `/countries/${country.isoCode}/compare`,
        wikiState: wiki ? 'published' : wikiUnavailable ? 'unavailable' : 'empty', editWikiHref: canEdit ? `/editor/wiki/constitution/${constitution.id}?code=${country.isoCode}` : undefined }}
      breadcrumbs={<Breadcrumbs items={[{ href: '/', label: <T value={ui.nav.countries} /> }, { href: `/countries/${country.isoCode}`, label: country.name }, { label: constitution.title }]} />}
      wiki={wiki ? <ContentTranslationRegion sourceLanguage="auto" compact><WikiContent page={wiki} /></ContentTranslationRegion> : undefined}
      details={<ReaderDetails constitution={constitution} jurisdictionName={country.name} version={version} snapshot={snapshot} locale={locale} sourceEvidence={snapshot.sourceEvidence} canEditSource={canEdit && snapshotVersionId(version) === params.versionId}>
        <CountryNavigation code={country.isoCode} active="reading" /><p><a href={`/constitutions/${constitution.id}/amendments`}><T value={migrationUi.amendmentRegister} /></a></p>
        <VersionDocuments compact constitutionId={constitution.id} versionId={params.versionId} legalVersionId={snapshot.legalVersionId ?? snapshot.id} />
      </ReaderDetails>}
      editorial={canEdit ? <EditorEntry versions={constitution.versions} viewedVersionId={params.versionId} viewedVersionLabel={version.versionLabel}
        allowLegalStart={Boolean(version.latestPublished && snapshotVersionId(version) === params.versionId)} canReview={canReview} canPublish={canPublish} /> : undefined}
      notices={<><SnapshotNotice code={country.isoCode} viewedId={params.versionId} currentId={snapshotVersionId(version)} />{error === 'title' ? <Alert tone="error"><T value={ui.countries.code.versions.versionid.page.theSectionTitleCouldNotBeSaved} /></Alert> : null}</>}
      footer={<Pager previous={previous ? { href: `/countries/${country.isoCode}/versions/${snapshotVersionId(previous)}`, label: `← ${previous.versionLabel}` } : undefined}
        next={next ? { href: `/countries/${country.isoCode}/versions/${snapshotVersionId(next)}`, label: `${next.versionLabel} →` } : undefined} />}
    />
  </ContentTranslationRegion></FullWidthPage>;
}
