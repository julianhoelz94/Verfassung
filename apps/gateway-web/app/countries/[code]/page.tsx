import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCountry, getWikiPage } from '../../../lib/api';
import { countryOwner, groupConstitutions, jurisdictionHref, jurisdictionOwner, loadRegionalCollections } from '../../../lib/country-directory';
import { directoryUi } from '../../../lib/country-directory-messages';
import { migrationUi } from '../../../lib/migration-messages';
import { ui, message } from '../../../lib/messages';
import { atlasTitle, metaDescription, pageMetadata } from '../../../lib/page-meta';
import { currentLocale } from '../../../lib/server-locale';
import { currentUser } from '../../../lib/session';
import { canVisitEditor } from '../../../lib/nav';
import { publicVersions } from '../../../lib/reading';
import { FormattedDate } from '../../../lib/format-date';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { PageMain } from '../../components/PageMain';
import { CollectionPage } from '../../components/layout/templates';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { ConstitutionGroups } from '../../components/ConstitutionGroups';
import { CountryDirectoryTools } from '../../components/CountryDirectoryTools';
import { ContentTranslationRegion } from '../../components/ContentTranslationRegion';
import { WikiImages } from '../../components/WikiImages';
import { WikiBody } from '../../components/WikiBody';
import { WikiSources } from '../../components/WikiSources';
import { T } from '../../components/TranslationProvider';
import styles from '../../components/CountryDirectory.module.css';

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const country = await getCountry(code).catch(() => null);
  return country ? pageMetadata({ title: atlasTitle(country.name), description: metaDescription(`Browse constitutions and versions for ${country.name}.`), path: `/countries/${country.isoCode}` }) : { title: atlasTitle('Country') };
}

export default async function CountryPage({ params }: Props) {
  const { code } = await params;
  let country;
  try { country = await getCountry(code); } catch {
    return <CollectionPage width="content"><ServiceUnavailable service={ui.services.catalog} retryHref={`/countries/${code}`} /></CollectionPage>;
  }
  if (!country) notFound();
  const [wiki, collections, user, locale] = await Promise.all([
    getWikiPage('country', country.id).catch(() => null), loadRegionalCollections(country.id), currentUser(), currentLocale(),
  ]);
  const editorial = Boolean(user && canVisitEditor(user.roles));
  const publisher = Boolean(user?.roles.some(role => role === 'publisher' || role === 'admin'));
  const owner = countryOwner(country);
  const groups = groupConstitutions(country.constitutions);
  const nationalCount = groups.current.length + groups.historical.length;
  const allConstitutions = [...new Map([...country.constitutions, ...collections.regions.flatMap(region => region.detail.constitutions)].filter(constitution => publicVersions(constitution.versions).length > 0).map(constitution => [constitution.id, constitution])).values()];
  const versionCount = allConstitutions.reduce((sum, constitution) => sum + publicVersions(constitution.versions).length, 0);
  const background = wiki || editorial ? <>
    <h2><T value={ui.countries.code.page.about} /> {country.name}</h2>
    {wiki ? <><ContentTranslationRegion sourceLanguage="auto"><p data-translate-content>{wiki.summary}</p><WikiImages images={wiki.images.filter(image => image.placement === 'before_body')} /><WikiBody body={wiki.body} /></ContentTranslationRegion><WikiImages images={wiki.images.filter(image => image.placement !== 'before_body')} /><WikiSources sourceUrls={wiki.sourceUrls ?? []} /></> : null}
    {editorial ? <p><a href={`/editor/wiki/country/${country.id}?code=${country.isoCode}`}><T value={ui.countries.code.page.editCountryPage} /></a></p> : null}
  </> : undefined;
  return <PageMain width="content" className={styles.page} data-template="collection"><div className={styles.directory}>
    <div className={styles.breadcrumbs}><Breadcrumbs items={[{ href: '/', label: message(locale, ui.nav.countries) }, { label: country.name }]} /></div>
    <CountryDirectoryTools background={background} historyHref={`${owner.href}/timeline`} />
    <div className={styles.body}>
      <header className={styles.header}><p className={styles.eyebrow}><T value={directoryUi.country} /> · {country.isoCode}</p><h1>{country.name}</h1>
        <p className={styles.meta}><span>{allConstitutions.length} <T value={allConstitutions.length === 1 ? ui.remainingStatus.constitutionSingular : ui.remainingStatus.constitutionPlural} /></span><span>{versionCount} <T value={versionCount === 1 ? ui.remainingStatus.versionSingular : ui.remainingStatus.versionPlural} /></span><span>{collections.regions.length} <T value={collections.regions.length === 1 ? directoryUi.regionSingular : directoryUi.regionPlural} /></span></p>
        {wiki?.summary ? <p className={styles.summary}>{wiki.summary}</p> : null}
        <nav className={styles.index} aria-label={message(locale, directoryUi.onThisPage)}><a href="#national-constitutions"><T value={directoryUi.national} /></a>{groups.historical.length ? <a href="#historical-national"><T value={directoryUi.historicalNational} /></a> : null}<a href="#regional-constitutions"><T value={directoryUi.regional} /></a></nav>
      </header>
      <section className={styles.section} id="national-constitutions" aria-labelledby="national-title"><h2 className={styles.sectionTitle} id="national-title"><T value={directoryUi.national} /></h2>
        <ConstitutionGroups constitutions={country.constitutions} owner={owner} editorial={editorial} publisher={publisher} />
        {!nationalCount ? <p><T value={directoryUi.noNational} /></p> : null}
      </section>
      <section className={styles.section} id="regional-constitutions" aria-labelledby="regional-title"><h2 className={styles.sectionTitle} id="regional-title"><T value={directoryUi.regional} /></h2>
        {collections.unavailable ? <p role="status"><T value={directoryUi.regionalUnavailable} /> <a href={owner.href}><T value={directoryUi.retry} /></a></p> : null}
        {collections.regions.map(({ detail, ancestors }) => <section key={detail.jurisdiction.id} className={styles.region} aria-labelledby={`region-${detail.jurisdiction.id}`}>
          <header className={styles.regionHeading}><h3 id={`region-${detail.jurisdiction.id}`}><a href={jurisdictionOwner(detail.jurisdiction).href}>{detail.jurisdiction.name}</a></h3><div className={styles.regionPath}>{ancestors.map(ancestor => <span key={ancestor.id}><a href={jurisdictionHref(ancestor)}>{ancestor.name}</a> › </span>)}{detail.jurisdiction.historical ? <span><T value={migrationUi.historical} /></span> : null}{detail.jurisdiction.existedFrom || detail.jurisdiction.existedUntil ? <span><FormattedDate value={detail.jurisdiction.existedFrom} /> – <FormattedDate value={detail.jurisdiction.existedUntil} /></span> : null}</div></header>
          <ConstitutionGroups constitutions={detail.constitutions} owner={jurisdictionOwner(detail.jurisdiction)} regional editorial={editorial} publisher={publisher} />
          {!detail.constitutions.some(constitution => publicVersions(constitution.versions).length) ? <p><T value={migrationUi.noConstitutions} /></p> : null}
        </section>)}
        {!collections.regions.length && !collections.unavailable ? <p><T value={directoryUi.noRegional} /></p> : null}
      </section>
    </div>
  </div></PageMain>;
}
