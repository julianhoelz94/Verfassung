import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCountry, getWikiPage, type ConstitutionSummary, type CountryDetail } from '../../../lib/api';
import { countryOwner, groupConstitutions, jurisdictionHref, jurisdictionOwner, loadRegionalCollections } from '../../../lib/country-directory';
import { directoryUi } from '../../../lib/country-directory-messages';
import { migrationUi } from '../../../lib/migration-messages';
import { ui, message } from '../../../lib/messages';
import { atlasTitle, metaDescription, pageMetadata } from '../../../lib/page-meta';
import { currentLocale } from '../../../lib/server-locale';
import { currentUser } from '../../../lib/session';
import { canVisitEditor } from '../../../lib/nav';
import { publicVersions } from '../../../lib/reading';
import { JurisdictionDates } from '../../components/JurisdictionDates';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { FullWidthPage, PageBreadcrumbs } from '../../components/layout/PageChrome';
import { CollectionPage } from '../../components/layout/templates';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { ConstitutionGroups } from '../../components/ConstitutionGroups';
import { ConstitutionDirectoryFrame } from '../../components/ConstitutionDirectoryFrame';
import type { PageContentsItem } from '../../components/layout/PageChrome';
import { T } from '../../components/TranslationProvider';
import { DirectoryWiki } from '../../components/DirectoryWiki';
import styles from '../../components/CountryDirectory.module.css';

type Props = { params: Promise<{ code: string }>; searchParams?: Promise<{ wiki?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const country = await getCountry(code).catch(() => null);
  return country ? pageMetadata({ title: atlasTitle(country.name), description: metaDescription(`Browse constitutions and versions for ${country.name}.`), path: `/countries/${country.isoCode}` }) : { title: atlasTitle('Country') };
}

export default async function CountryPage({ params, searchParams }: Props) {
  const { code } = await params;
  let country: CountryDetail | null;
  try { country = await getCountry(code); } catch {
    return <CollectionPage width="content"><ServiceUnavailable service={ui.services.catalog} retryHref={`/countries/${code}`} /></CollectionPage>;
  }
  if (!country) notFound();
  const [wikiResult, collections, user, locale] = await Promise.all([
    getWikiPage('country', country.id).then(page => ({ page, unavailable: false })).catch(() => ({ page: null, unavailable: true })), loadRegionalCollections(country.id), currentUser(), currentLocale(),
  ]);
  const wiki = wikiResult.page;
  const query = await searchParams;
  const editorial = Boolean(user && canVisitEditor(user.roles));
  const publisher = Boolean(user?.roles.some(role => role === 'publisher' || role === 'admin'));
  const owner = countryOwner(country);
  const groups = groupConstitutions(country.constitutions);
  const nationalCount = groups.current.length + groups.historical.length;
  const allConstitutions = [...new Map([...country.constitutions, ...collections.regions.flatMap(region => region.detail.constitutions)].filter(constitution => publicVersions(constitution.versions).length > 0).map(constitution => [constitution.id, constitution])).values()];
  const versionCount = allConstitutions.reduce((sum, constitution) => sum + publicVersions(constitution.versions).length, 0);
  function constitutionItems(constitutions: ConstitutionSummary[], historicalId: string, regional = false): PageContentsItem[] {
    const grouped = groupConstitutions(constitutions);
    const entry = (constitution: typeof constitutions[number]) => ({ id: `constitution-${constitution.id}`, href: `#constitution-${constitution.id}`, label: constitution.title });
    return [...grouped.current.map(entry), ...(grouped.historical.length ? [{ id: historicalId, href: `#${historicalId}`, label: message(locale, regional ? directoryUi.historicalRegional : directoryUi.historicalNational), children: grouped.historical.map(entry) }] : [])];
  }
  const contents: PageContentsItem[] = [
    { id: 'national-constitutions', href: '#national-constitutions', label: message(locale, directoryUi.national), children: constitutionItems(country.constitutions, 'historical-national') },
    { id: 'regional-constitutions', href: '#regional-constitutions', label: message(locale, directoryUi.regional), children: collections.regions.map(({ detail }) => ({ id: `region-${detail.jurisdiction.id}`, href: `#region-${detail.jurisdiction.id}`, label: detail.jurisdiction.name, children: constitutionItems(detail.constitutions, `historical-${detail.jurisdiction.id}`, true) })) },
  ];
  const background = <DirectoryWiki targetType="country" targetId={country.id} name={country.name} code={country.isoCode} page={wiki} unavailable={wikiResult.unavailable} canEdit={user?.roles.some(role => role === 'editor' || role === 'admin')} canReview={user?.roles.some(role => role === 'publisher' || role === 'reviewer')} />;
  return <FullWidthPage template="collection"><div className={styles.directory}>
    <PageBreadcrumbs><Breadcrumbs items={[{ href: '/', label: message(locale, ui.nav.countries) }, { label: country.name }]} /></PageBreadcrumbs>
    <ConstitutionDirectoryFrame background={background} contents={contents} wikiOpen={query?.wiki === '1'}>
      <header className={styles.header}><p className={styles.eyebrow}><T value={directoryUi.country} /> · {country.isoCode}</p><h1>{country.name}</h1>
        <p className={styles.meta}><span>{allConstitutions.length} <T value={allConstitutions.length === 1 ? ui.remainingStatus.constitutionSingular : ui.remainingStatus.constitutionPlural} /></span><span>{versionCount} <T value={versionCount === 1 ? ui.remainingStatus.versionSingular : ui.remainingStatus.versionPlural} /></span><span>{collections.regions.length} <T value={collections.regions.length === 1 ? directoryUi.regionSingular : directoryUi.regionPlural} /></span></p>
        {wiki?.summary ? <p className={styles.summary}>{wiki.summary}</p> : null}
      </header>
      <section className={styles.section} id="national-constitutions" aria-labelledby="national-title"><div className={styles.sectionHeader}><h2 className={styles.sectionTitle} id="national-title"><T value={directoryUi.national} /></h2><a href={`${owner.href}/timeline`}><T value={directoryUi.nationalHistory} /></a></div>
        <ConstitutionGroups constitutions={country.constitutions} owner={owner} editorial={editorial} publisher={publisher} />
        {!nationalCount ? <p><T value={directoryUi.noNational} /></p> : null}
      </section>
      <section className={styles.section} id="regional-constitutions" aria-labelledby="regional-title"><h2 className={styles.sectionTitle} id="regional-title"><T value={directoryUi.regional} /></h2>
        {collections.unavailable ? <p role="status"><T value={directoryUi.regionalUnavailable} /> <a href={owner.href}><T value={directoryUi.retry} /></a></p> : null}
        {collections.regions.map(({ detail, ancestors }) => <section key={detail.jurisdiction.id} className={styles.region} aria-labelledby={`region-${detail.jurisdiction.id}`}>
          <header className={styles.regionHeading}><h3 id={`region-${detail.jurisdiction.id}`}><a href={jurisdictionOwner(detail.jurisdiction).href}>{detail.jurisdiction.name}</a></h3><a className={styles.regionPage} href={jurisdictionOwner(detail.jurisdiction).href}><T value={directoryUi.regionPage} /> <span aria-hidden="true">→</span></a></header>
          <p className={styles.regionPath}>{ancestors.map((ancestor, index) => <span key={ancestor.id}>{index ? ' › ' : ''}<a href={jurisdictionHref(ancestor)}>{ancestor.name}</a></span>)}</p>
          {detail.jurisdiction.historical || detail.jurisdiction.existedFrom || detail.jurisdiction.existedUntil ? <p className={styles.regionMeta}>{detail.jurisdiction.historical ? <span><T value={migrationUi.historical} /></span> : null}{detail.jurisdiction.historical && (detail.jurisdiction.existedFrom || detail.jurisdiction.existedUntil) ? ' · ' : null}<JurisdictionDates from={detail.jurisdiction.existedFrom} until={detail.jurisdiction.existedUntil} /></p> : null}
          <ConstitutionGroups constitutions={detail.constitutions} owner={jurisdictionOwner(detail.jurisdiction)} regional editorial={editorial} publisher={publisher} />
          {!detail.constitutions.some(constitution => publicVersions(constitution.versions).length) ? <p><T value={migrationUi.noConstitutions} /></p> : null}
        </section>)}
        {!collections.regions.length && !collections.unavailable ? <p><T value={directoryUi.noRegional} /></p> : null}
      </section>
    </ConstitutionDirectoryFrame>
  </div></FullWidthPage>;
}
