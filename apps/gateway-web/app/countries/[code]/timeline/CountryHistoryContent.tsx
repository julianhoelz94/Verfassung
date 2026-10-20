import { cache } from 'react';
import { CountryNavigation } from '../../../components/CountryNavigation';
import { loadConstitutionHistory } from './ConstitutionHistory';
import { currentLocale } from '../../../../lib/server-locale';
import { usability } from '../../../../lib/usability-messages';
import { sortHistory, historyFilter } from '../../../../lib/history';
import { HistoryTimeline } from '../../../components/HistoryTimeline';
import { changeTypeMessage } from '../../../../lib/ui-labels';
import { T } from '../../../components/TranslationProvider';
import { message, ui } from '../../../../lib/messages';
import { notFound } from 'next/navigation';
import { CollectionPage } from '../../../components/layout/templates';
import { AmendmentUnitLinks } from '../../../components/AmendmentUnitLinks';
import { ContentTranslationRegion } from '../../../components/ContentTranslationRegion';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { Alert, Badge, PageHeader, type BadgeTone } from '../../../components/ui';
import {
  getVersion,
  getCountry,
  listConstitutionAmendments,
  type Amendment,
  type CountryDetail,
} from '../../../../lib/api';
import { FormattedDate } from '../../../../lib/format-date';
import { publicVersions, snapshotVersionId } from '../../../../lib/reading';
import { listDocumentLinks } from '../../../../lib/document-api';
import { Stack, Inline } from '../../../components/layout/Layout';
import surfaceStyles from '../../../components/surfaces.module.css';
import fieldStyles from '../../../components/fields.module.css';

function changeTone(changeType: string): BadgeTone {
  if (changeType === 'added') {
    return 'added';
  }
  if (changeType === 'removed') {
    return 'removed';
  }
  if (changeType === 'changed') {
    return 'changed';
  }
  return 'neutral';
}

export const renderCountryHistory = cache(async (code: string, on?: string, events?: string) => {
  const query = { on, events };
  const locale = await currentLocale();
  const eventFilter = historyFilter(query.events);
  let country: CountryDetail | null;
  try { country = await getCountry(code); }
  catch {
    return <CollectionPage width="content" className="country-history"><ServiceUnavailable service={ui.services.catalog} retryHref={`/countries/${code}/timeline`} /></CollectionPage>;
  }
  if (!country) notFound();
  const [lifecycle, amendmentGroups] = await Promise.all([
    loadConstitutionHistory(country, query.on, eventFilter).then(value => ({ value, failed: false })).catch(() => ({ value: null, failed: true })),
    Promise.allSettled(country.constitutions.map(constitution => listConstitutionAmendments(constitution.id))),
  ]);
  const amendments: Amendment[] = amendmentGroups.flatMap(group => group.status === 'fulfilled' ? group.value ?? [] : []);
  const amendmentsUnavailable = amendmentGroups.some(group => group.status === 'rejected');

  const versionsById = new Map(
    country.constitutions.flatMap((constitution) =>
      constitution.versions.map((version) => [version.id, version]),
    ),
  );
  const pinnedIds = [...new Set(amendments.flatMap((amendment) => [amendment.sourceVersionId, amendment.targetVersionId]).filter((id): id is string => Boolean(id)))];
  const pinnedVersions = await Promise.all(pinnedIds.map((id) => getVersion(id).catch(() => null)));
  const pinnedById = new Map(pinnedVersions.filter((version) => version != null).map((version) => [version!.id, version!]));
  const publicByLegalId = new Map(
    country.constitutions.flatMap((constitution) =>
      publicVersions(constitution.versions).map((version) => [version.legalVersionId ?? version.id, version]),
    ),
  );
  const versionForPin = (id: string | null | undefined) =>
    id ? (
      versionsById.get(id) ??
      publicByLegalId.get(pinnedById.get(id)?.legalVersionId ?? '') ??
      publicByLegalId.get(id) ??
      [...versionsById.values()].find((version) => version.currentVersionId === id)
    ) : undefined;
  const managedDocuments = new Map(await Promise.all(amendments.map(async (amendment) =>
    [amendment.id, amendment.publishedRevisionId ? await listDocumentLinks('amendment', amendment.id, amendment.publishedRevisionId).catch(() => []) : []] as const,
  )));

  const amendmentItems = amendments.map((amendment) => {
    const source = versionForPin(amendment.sourceVersionId);
    const target = versionForPin(amendment.targetVersionId);
    return { kind: 'amendment' as const, id: amendment.id, date: amendment.enactedOn, title: amendment.title, content: (<>
        <FormattedDate className="timeline-date" value={amendment.enactedOn} fallback={<T value={ui.remainingStatus.dateUnknown} />} />
        <article className={["card", surfaceStyles.card].join(' ')}>
          <ContentTranslationRegion sourceLanguage={target?.languageCode ?? source?.languageCode ?? 'en'}>
          <h2 className="card-title" data-translate-content>{amendment.title}</h2>
          <p className="muted">
            <T value={ui.remainingStatus.version} /> {target?.versionLabel}
            {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
          </p>
          {amendment.comment || amendment.summary ? <p data-translate-content>{amendment.comment ?? amendment.summary}</p> : null}
          </ContentTranslationRegion>
          {amendment.documents?.length ? (
            <ul className="link-list">
              {amendment.documents.map((document, index) => (
                <li key={`${document.url ?? document.fileId ?? document.label ?? 'document'}-${index}`}>
                  {document.url ? <a href={document.url} rel="noreferrer">{document.label ?? document.url}</a> : document.label ?? <T value={ui.remainingStatus.archivedDocument} />}
                </li>
              ))}
            </ul>
          ) : null}
          {(managedDocuments.get(amendment.id) ?? []).length ? <ul className="link-list">
            {(managedDocuments.get(amendment.id) ?? []).map((link) => <li key={link.documentId}>
              <a href={`/documents/${link.documentId}${link.revisionId ? `?revision=${link.document.revision.revision}` : ''}`}>{link.document.revision.title}</a>
              {link.revisionId ? ` · revision ${link.document.revision.revision}` : null}
            </li>)}
          </ul> : null}
          <div className="chip-row">
            {amendment.changes.map((change) => (
              <Stack  key={change.id}>
                <Badge tone={changeTone(change.changeType)}>
                  {<T value={changeTypeMessage(change.changeType)} />}
                  {change.articleNumber ? ` Art. ${change.articleNumber}` : ''}
                </Badge>
                <AmendmentUnitLinks change={change} />
              </Stack>
            ))}
          </div>
          {amendment.sourceVersionId && amendment.targetVersionId ? (
            <Inline className="card-actions">
              <a
                className="btn btn-sm"
                href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(source?.id ?? amendment.sourceVersionId)}&to=${encodeURIComponent(target?.id ?? amendment.targetVersionId)}`}
              >
                <T value={ui.countries.code.timeline.page.compareWithPrevious} />{" "}{source && target ? ` (${source.versionLabel} → ${target.versionLabel})` : ''}
              </a>
              {target ? (
                <a className="btn btn-sm btn-ghost" href={`/countries/${country.isoCode}/versions/${snapshotVersionId(target)}`}>
                  <T value={ui.countries.code.timeline.page.read} />{" "}</a>
              ) : null}
            </Inline>
          ) : null}
        </article>
      </>) };
  });
  const allItems = sortHistory([...(lifecycle.value?.items ?? []), ...amendmentItems]);
  const items = allItems.filter(item => eventFilter === 'all' || item.kind === eventFilter);

  return (
    <CollectionPage width="content" className="country-history" header={<PageHeader
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: <T value={usability.history} /> },
        ]}
        title={<T value={usability.history} />}
      />}>

      <CountryNavigation code={country.isoCode} active="history" />
      <p className="lede"><T value={usability.combinedHistory} /></p>
      {lifecycle.failed ? <Alert tone="error"><T value={usability.constitutionsUnavailable} /></Alert> : null}
      {amendmentsUnavailable ? <Alert tone="error"><T value={usability.amendmentsUnavailable} /></Alert> : null}
      <form method="get" className="history-event-filter" action={`/countries/${country.isoCode}/timeline`}>
        {query.on ? <input type="hidden" name="on" value={query.on} /> : null}
        <div className={["field", fieldStyles.field].join(' ')}><label htmlFor="history-event-type"><T value={usability.showEvents} /></label>
          <select id="history-event-type" name="events" defaultValue={eventFilter}>
            <option value="all">{message(locale, usability.allEvents)}</option>
            <option value="constitution">{message(locale, usability.constitutionEvents)}</option>
            <option value="amendment">{message(locale, usability.amendments)}</option>
          </select>
        </div>
        <button type="submit" className="btn btn-sm"><T value={usability.applyEvents} /></button>
      </form>
      {items.length ? <HistoryTimeline key={eventFilter} items={items} /> : <p><T value={usability.noEvents} /></p>}
      {lifecycle.value?.status}
    </CollectionPage>
  );
});
