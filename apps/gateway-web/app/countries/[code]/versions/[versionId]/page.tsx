import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CountryNavigation } from '../../../../components/CountryNavigation';
import { SnapshotNotice } from '../../../../components/SnapshotNotice';
import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { currentLocale } from '../../../../../lib/server-locale';
import { PageMain } from '../../../../components/PageMain';
import { ReaderPage } from '../../../../components/layout/templates';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { Alert, Pager } from '../../../../components/ui';
import { VersionReader } from '../../../../components/VersionReader';
import { ReaderDetails } from '../../../../components/ReaderDetails';
import { ContentTranslationRegion } from '../../../../components/ContentTranslationRegion';
import { WikiBody } from '../../../../components/WikiBody';
import { WikiImages } from '../../../../components/WikiImages';
import { WikiSources } from '../../../../components/WikiSources';
import { listAllUnits, listAmendments, getCountry, getReaderOutline, getVersion, getWikiPage } from '../../../../../lib/api';
import { orderVersions } from '../../../../../lib/compare';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../../lib/page-meta';
import { publicSnapshotContext, snapshotVersionId, publicVersions } from '../../../../../lib/reading';
import { VersionDocuments } from '../../../../components/VersionDocuments';
import { currentUser } from '../../../../../lib/session';
import { EditorEntry } from './EditorEntry';
import { migrationUi } from '../../../../../lib/migration-messages';
import styles from '../../../../components/VersionReader.module.css';

type VersionPageProps = { params: Promise<{ code: string; versionId: string }>; searchParams: Promise<{ error?: string }> };

export async function generateMetadata(props: VersionPageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const [country, snapshot] = await Promise.all([getCountry(params.code), getVersion(params.versionId)]);
    const version = publicSnapshotContext(country, snapshot);
    if (!country || !version) return { title: atlasTitle('Version') };
    return pageMetadata({ title: atlasTitle(version.version.versionLabel, version.constitution.title, country.name),
      description: metaDescription(`Read ${version.constitution.title} version ${version.version.versionLabel} for ${country.name}.`),
      path: `/countries/${country.isoCode}/versions/${params.versionId}` });
  } catch { return { title: atlasTitle('Version') }; }
}

export default async function VersionPage(props: VersionPageProps) {
  const locale = await currentLocale(), params = await props.params, query = await props.searchParams;
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
  return <PageMain width="content" className={styles.page} data-template="reader"><ContentTranslationRegion sourceLanguage={snapshot.languageCode}>
    <VersionReader code={country.isoCode} versionId={params.versionId} articles={articles} outline={outline ?? constitution.contentOutline}
      language={snapshot.languageCode} changeByArticle={changeByArticle} unchangedSinceLabel={previous?.versionLabel}
      context={{ constitutionId: constitution.id, title: constitution.title, jurisdictionName: country.name, versionLabel: version.versionLabel,
        publications, overviewHref: `/countries/${country.isoCode}/constitutions/${constitution.id}`, comparisonHref: `/countries/${country.isoCode}/compare`,
        wikiState: wiki ? 'published' : wikiUnavailable ? 'unavailable' : 'empty', editWikiHref: canEdit ? `/editor/wiki/constitution/${constitution.id}?code=${country.isoCode}` : undefined }}
      breadcrumbs={<Breadcrumbs items={[{ href: '/', label: <T value={ui.nav.countries} /> }, { href: `/countries/${country.isoCode}`, label: country.name }, { label: constitution.title }]} />}
      wiki={wiki ? <ContentTranslationRegion sourceLanguage="auto"><p data-translate-content>{wiki.summary}</p><WikiImages images={wiki.images.filter(image => image.placement === 'before_body')} /><WikiBody body={wiki.body} /><WikiImages images={wiki.images.filter(image => image.placement !== 'before_body')} /><WikiSources sourceUrls={wiki.sourceUrls ?? []} /></ContentTranslationRegion> : undefined}
      details={<ReaderDetails constitution={constitution} jurisdictionName={country.name} version={version} snapshot={snapshot} locale={locale} sourceEvidence={snapshot.sourceEvidence} canEditSource={canEdit && snapshotVersionId(version) === params.versionId}>
        <CountryNavigation code={country.isoCode} active="reading" /><p><a href={`/constitutions/${constitution.id}/amendments`}><T value={migrationUi.amendmentRegister} /></a></p>
        <VersionDocuments compact constitutionId={constitution.id} versionId={params.versionId} legalVersionId={snapshot.legalVersionId ?? snapshot.id} />
      </ReaderDetails>}
      editorial={canEdit ? <EditorEntry versions={constitution.versions} viewedVersionId={params.versionId} viewedVersionLabel={version.versionLabel}
        allowLegalStart={Boolean(version.latestPublished && snapshotVersionId(version) === params.versionId)} canReview={canReview} canPublish={canPublish} /> : undefined}
      notices={<><SnapshotNotice code={country.isoCode} viewedId={params.versionId} currentId={snapshotVersionId(version)} />{query.error === 'title' ? <Alert tone="error"><T value={ui.countries.code.versions.versionid.page.theSectionTitleCouldNotBeSaved} /></Alert> : null}</>}
      footer={<Pager previous={previous ? { href: `/countries/${country.isoCode}/versions/${snapshotVersionId(previous)}`, label: `← ${previous.versionLabel}` } : undefined}
        next={next ? { href: `/countries/${country.isoCode}/versions/${snapshotVersionId(next)}`, label: `${next.versionLabel} →` } : undefined} />}
    />
  </ContentTranslationRegion></PageMain>;
}
