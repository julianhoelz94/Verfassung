import { notFound } from 'next/navigation';
import { getJurisdiction } from '../../../lib/migration-api';
import { groupConstitutions, jurisdictionHref, jurisdictionOwner } from '../../../lib/country-directory';
import { directoryUi } from '../../../lib/country-directory-messages';
import { migrationUi } from '../../../lib/migration-messages';
import { ui } from '../../../lib/messages';
import { FormattedDate } from '../../../lib/format-date';
import { PageMain } from '../../components/PageMain';
import { ReaderPage } from '../../components/layout/templates';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ConstitutionGroups } from '../../components/ConstitutionGroups';
import { T } from '../../components/TranslationProvider';
import styles from '../../components/CountryDirectory.module.css';

export default async function JurisdictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail;
  try { detail = await getJurisdiction(id); } catch { return <ReaderPage><ServiceUnavailable service={ui.services.catalog} retryHref={`/jurisdictions/${id}`} /></ReaderPage>; }
  if (!detail) notFound();
  const entity = detail.jurisdiction;
  const groups = groupConstitutions(detail.constitutions);
  return <PageMain width="content" className={styles.page} data-template="collection"><div className={styles.directory}>
    <div className={styles.breadcrumbs}><Breadcrumbs items={[{ href: '/jurisdictions', label: <T value={migrationUi.jurisdictions} /> }, ...detail.ancestors.map(ancestor => ({ href: jurisdictionHref(ancestor), label: ancestor.name })), { label: entity.name }]} /></div>
    <div className={styles.body}>
      <header className={styles.header}><p className={styles.eyebrow}><T value={migrationUi.jurisdiction} />{entity.code ? ` · ${entity.code}` : ''}</p><h1>{entity.name}</h1>
        <p className={styles.meta}>{entity.historical ? <span><T value={migrationUi.historical} /></span> : null}{entity.existedFrom || entity.existedUntil ? <span><FormattedDate value={entity.existedFrom} /> – <FormattedDate value={entity.existedUntil} /></span> : null}</p>
      </header>
      <section className={styles.section} aria-labelledby="jurisdiction-constitutions"><h2 id="jurisdiction-constitutions" className={styles.sectionTitle}><T value={migrationUi.constitutions} /></h2><ConstitutionGroups constitutions={detail.constitutions} owner={jurisdictionOwner(entity)} regional headingLevel={3} />{!groups.current.length && !groups.historical.length ? <p><T value={migrationUi.noConstitutions} /></p> : null}</section>
      {detail.children.length ? <section className={styles.section}><h2 className={styles.sectionTitle}><T value={directoryUi.regional} /></h2><ul>{detail.children.map(child => <li key={child.id}><a href={jurisdictionHref(child)}>{child.name}</a>{child.historical ? <> · <T value={migrationUi.historical} /></> : null}</li>)}</ul></section> : null}
    </div>
  </div></PageMain>;
}
