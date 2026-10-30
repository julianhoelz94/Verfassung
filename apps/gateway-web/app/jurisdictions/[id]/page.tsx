import { notFound } from 'next/navigation';
import { getJurisdiction } from '../../../lib/migration-api';
import { groupConstitutions, jurisdictionHref, jurisdictionOwner } from '../../../lib/country-directory';
import { directoryUi } from '../../../lib/country-directory-messages';
import { migrationUi } from '../../../lib/migration-messages';
import { message, ui } from '../../../lib/messages';
import { currentLocale } from '../../../lib/server-locale';
import { publicVersions } from '../../../lib/reading';
import { FullWidthPage, PageBreadcrumbs, type PageContentsItem } from '../../components/layout/PageChrome';
import { ReaderPage } from '../../components/layout/templates';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ConstitutionGroups } from '../../components/ConstitutionGroups';
import { ConstitutionDirectoryFrame } from '../../components/ConstitutionDirectoryFrame';
import { JurisdictionDates } from '../../components/JurisdictionDates';
import { T } from '../../components/TranslationProvider';
import styles from '../../components/CountryDirectory.module.css';

export default async function JurisdictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail;
  try { detail = await getJurisdiction(id); } catch { return <ReaderPage><ServiceUnavailable service={ui.services.catalog} retryHref={`/jurisdictions/${id}`} /></ReaderPage>; }
  if (!detail || detail.jurisdiction.id !== id) notFound();
  const entity = detail.jurisdiction, locale = await currentLocale();
  const groups = groupConstitutions(detail.constitutions);
  const visible = [...groups.current, ...groups.historical];
  const versionCount = visible.reduce((sum, constitution) => sum + publicVersions(constitution.versions).length, 0);
  const entry = (constitution: typeof visible[number]) => ({ id: `constitution-${constitution.id}`, href: `#constitution-${constitution.id}`, label: constitution.title });
  const contents: PageContentsItem[] = [{
    id: 'jurisdiction-constitutions', href: '#jurisdiction-constitutions', label: message(locale, migrationUi.constitutions),
    children: [...groups.current.map(entry), ...(groups.historical.length ? [{ id: `historical-${id}`, href: `#historical-${id}`, label: message(locale, directoryUi.historicalRegional), children: groups.historical.map(entry) }] : [])],
  }, ...(detail.children.length ? [{ id: 'subregions', href: '#subregions', label: message(locale, directoryUi.regional) }] : [])];
  return <FullWidthPage template="collection"><div className={styles.directory}>
    <PageBreadcrumbs><Breadcrumbs items={[{ href: '/jurisdictions', label: <T value={migrationUi.jurisdictions} /> }, ...detail.ancestors.map(ancestor => ({ href: jurisdictionHref(ancestor), label: ancestor.name })), { label: entity.name }]} /></PageBreadcrumbs>
    <ConstitutionDirectoryFrame contents={contents} toolsLabel={directoryUi.regionalTools}>
      <header className={styles.header}><p className={styles.eyebrow}><T value={migrationUi.jurisdiction} />{entity.code ? ` · ${entity.code}` : ''}</p><h1>{entity.name}</h1>
        <p className={styles.meta}><span>{visible.length} <T value={visible.length === 1 ? ui.remainingStatus.constitutionSingular : ui.remainingStatus.constitutionPlural} /></span><span>{versionCount} <T value={versionCount === 1 ? ui.remainingStatus.versionSingular : ui.remainingStatus.versionPlural} /></span></p>
        {entity.historical || entity.existedFrom || entity.existedUntil ? <p className={styles.regionMeta}>{entity.historical ? <span><T value={migrationUi.historical} /></span> : null}{entity.historical && (entity.existedFrom || entity.existedUntil) ? ' · ' : null}<JurisdictionDates from={entity.existedFrom} until={entity.existedUntil} /></p> : null}
      </header>
      <section className={styles.section} id="jurisdiction-constitutions" aria-labelledby="jurisdiction-constitutions-title"><h2 id="jurisdiction-constitutions-title" className={styles.sectionTitle}><T value={migrationUi.constitutions} /></h2><ConstitutionGroups constitutions={detail.constitutions} owner={jurisdictionOwner(entity)} regional headingLevel={3} />{!visible.length ? <p><T value={migrationUi.noConstitutions} /></p> : null}</section>
      {detail.children.length ? <section className={styles.section} id="subregions" aria-labelledby="subregions-title"><h2 id="subregions-title" className={styles.sectionTitle}><T value={directoryUi.regional} /></h2><ul>{detail.children.map(child => <li key={child.id}><a href={jurisdictionHref(child)}>{child.name}</a>{child.historical ? <> · <T value={migrationUi.historical} /></> : null}</li>)}</ul></section> : null}
    </ConstitutionDirectoryFrame>
  </div></FullWidthPage>;
}
