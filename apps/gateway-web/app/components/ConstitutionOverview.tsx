import { notFound } from 'next/navigation';
import { getConstitutionEvents, getWikiPage } from '../../lib/api';
import { loadConstitutionCollection, jurisdictionHref, constitutionHref } from '../../lib/country-directory';
import { directoryUi } from '../../lib/country-directory-messages';
import { listDocumentLinks } from '../../lib/document-api';
import { ui, message } from '../../lib/messages';
import { currentLocale } from '../../lib/server-locale';
import { currentUser } from '../../lib/session';
import { canVisitEditor } from '../../lib/nav';
import { FormattedDate } from '../../lib/format-date';
import { ReaderPage } from './layout/templates';
import { ServiceUnavailable } from './StatusMessage';
import { PageMain } from './PageMain';
import { Breadcrumbs } from './Breadcrumbs';
import { ConstitutionEntry } from './ConstitutionEntry';
import { ContentTranslationRegion } from './ContentTranslationRegion';
import { WikiBody } from './WikiBody';
import { WikiImages } from './WikiImages';
import { WikiSources } from './WikiSources';
import { T } from './TranslationProvider';
import styles from './CountryDirectory.module.css';

export type ConstitutionOverviewProps = { params: Promise<{ code?: string; id?: string; constitutionId: string }> };

export async function ConstitutionOverview({ params }: ConstitutionOverviewProps) {
  const values = await params;
  let context;
  try { context = await loadConstitutionCollection(values); } catch {
    return <ReaderPage><ServiceUnavailable service={ui.services.catalog} retryHref={values.id ? `/jurisdictions/${values.id}/constitutions/${values.constitutionId}` : `/countries/${values.code}/constitutions/${values.constitutionId}`} /></ReaderPage>;
  }
  if (!context) notFound();
  const { collection, owner, ancestors } = context;
  const constitution = collection.constitutions.find(item => item.id === values.constitutionId);
  if (!constitution) notFound();
  const predecessor = collection.constitutions.find(item => item.id === constitution.predecessorConstitutionId);
  const successors = collection.constitutions.filter(item => item.predecessorConstitutionId === constitution.id);
  const [wiki, events, documents, locale, user] = await Promise.all([
    getWikiPage('constitution', constitution.id).catch(() => null), getConstitutionEvents(constitution.id).catch(() => []),
    listDocumentLinks('constitution', constitution.id).catch(() => []), currentLocale(), currentUser(),
  ]);
  return <PageMain width="content" className={styles.page} data-template="reader"><div className={styles.directory}>
    <div className={styles.breadcrumbs}><Breadcrumbs items={[{ href: '/', label: message(locale, ui.nav.countries) }, ...ancestors.map(ancestor => ({ href: jurisdictionHref(ancestor), label: ancestor.name })), { href: owner.href, label: owner.name }, { label: constitution.title }]} /></div>
    <div className={`${styles.body} ${styles.overview}`}>
      <header className={styles.header}><p className={styles.eyebrow}><T value={directoryUi.about} /></p><h1>{constitution.title}</h1><nav className={styles.index}><a href={owner.href}>← {owner.name}</a>{owner.countryCode ? <a href={`${owner.href}/timeline`}><T value={directoryUi.history} /></a> : null}</nav></header>
      {wiki ? <section aria-labelledby="constitution-background"><h2 id="constitution-background"><T value={directoryUi.about} /></h2><ContentTranslationRegion sourceLanguage="auto"><p data-translate-content>{wiki.summary}</p><WikiImages images={wiki.images.filter(image => image.placement === 'before_body')} /><WikiBody body={wiki.body} /></ContentTranslationRegion><WikiImages images={wiki.images.filter(image => image.placement !== 'before_body')} /><WikiSources sourceUrls={wiki.sourceUrls ?? []} /></section> : null}
      {events?.length ? <section><h2><T value={directoryUi.lifecycle} /></h2><ul>{events.map(event => <li key={event.id}>{event.dateCertainty === 'approximate' ? <><T value={ui.lifecycle.circa} /> </> : null}<FormattedDate value={event.eventDate} /> · {<T value={ui.lifecycleEvents[event.eventType]} />}{event.note ? ` · ${event.note}` : ''}{event.sourceUrl ? <> · <a href={event.sourceUrl}><T value={directoryUi.source} /></a></> : null}</li>)}</ul></section> : null}
      <section aria-labelledby="constitution-texts"><h2 id="constitution-texts"><T value={directoryUi.availableVersions} /></h2><ConstitutionEntry constitution={constitution} owner={owner} editorial={Boolean(user && canVisitEditor(user.roles))} publisher={Boolean(user?.roles.some(role => role === 'publisher' || role === 'admin'))} /></section>
      {predecessor || successors.length ? <section><h2><T value={directoryUi.related} /></h2><ul>{predecessor ? <li><T value={directoryUi.predecessor} />: <a href={constitutionHref(owner, predecessor.id)}>{predecessor.title}</a></li> : null}{successors.map(successor => <li key={successor.id}><T value={directoryUi.successor} />: <a href={constitutionHref(owner, successor.id)}>{successor.title}</a></li>)}</ul></section> : null}
      {documents?.length ? <section><h2><T value={ui.countries.code.page.documents} /></h2><ul>{documents.map(link => <li key={link.documentId}><a href={`/documents/${link.documentId}${link.revisionId ? `?revision=${link.document.revision.revision}` : ''}`}>{link.document.revision.title}</a></li>)}</ul></section> : null}
    </div>
  </div></PageMain>;
}
