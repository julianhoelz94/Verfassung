import { CollectionPage } from '../../../components/layout/templates';
import { PageHeader, Pager } from '../../../components/ui';
import { T } from '../../../components/TranslationProvider';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { getAmendmentRegister } from '../../../../lib/migration-api';
import { type AmendmentUnitRef } from '../../../../lib/api';
import { listDocumentLinks } from '../../../../lib/document-api';
import { migrationUi } from '../../../../lib/migration-messages';
import { ui } from '../../../../lib/messages';
import { FormattedDate } from '../../../../lib/format-date';

function passageHref(ref: AmendmentUnitRef | null | undefined) {
  return ref?.versionId && ref.rootOccurrenceId ? `/versions/${ref.versionId}/units/${ref.rootOccurrenceId}${ref.occurrenceId ? `?occurrenceId=${ref.occurrenceId}` : ''}` : null;
}
export default async function AmendmentRegister({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; unit?: string; from?: string; until?: string; dateKind?: string; offset?: string }> }) {
  const { id } = await params;
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['q', 'unit', 'from', 'until', 'dateKind'] as const) if (values[key]) query.set(key, values[key]!);
  const offset = Math.max(0, Number.parseInt(values.offset ?? '0', 10) || 0);
  query.set('offset', String(offset)); query.set('limit', '20');
  const page = await getAmendmentRegister(id, query).catch(() => null);
  const documents = await Promise.all((page?.items ?? []).map(record => listDocumentLinks('amendment', record.id, record.publishedRevisionId).catch(() => [])));
  const href = (next: number) => { const params = new URLSearchParams(query); params.set('offset', String(next)); return `/constitutions/${id}/amendments?${params}`; };
  return <CollectionPage width="content" header={<PageHeader title={<T value={migrationUi.amendmentRegister} />} />}>
    <form action={`/constitutions/${id}/amendments`}>
      <label htmlFor="register-q"><T value={migrationUi.instrumentOrCitation} /></label><input id="register-q" name="q" type="search" defaultValue={values.q} />
      <label htmlFor="register-unit"><T value={migrationUi.unit} /></label><input id="register-unit" name="unit" defaultValue={values.unit} />
      <label htmlFor="register-date-kind"><T value={migrationUi.dateType} /></label><select id="register-date-kind" name="dateKind" defaultValue={values.dateKind ?? 'instrument'}><option value="instrument"><T value={migrationUi.instrumentDate} /></option><option value="effective"><T value={migrationUi.effectiveDate} /></option></select>
      <label htmlFor="register-from"><T value={migrationUi.from} /></label><input id="register-from" name="from" type="date" defaultValue={values.from} />
      <label htmlFor="register-until"><T value={migrationUi.until} /></label><input id="register-until" name="until" type="date" defaultValue={values.until} />
      <button type="submit"><T value={migrationUi.filter} /></button>
    </form>
    {!page ? <ServiceUnavailable service={ui.services.amendment} retryHref={href(offset)} /> : !page.items.length ? <p><T value={migrationUi.noAmendments} /></p> : <ul>{page.items.map((record, index) => <li key={record.id}>
      <article><h2>{record.title}</h2><p><T value={migrationUi.instrumentDate} />: <FormattedDate value={record.enactedOn} /> · <T value={migrationUi.effectiveDate} />: <FormattedDate value={record.effectiveOn} /></p>
        {record.comment ? <p>{record.comment}</p> : null}
        <ul>{record.changes.map(change => <li key={change.id}>{change.articleNumber || change.beforeRef?.label || change.afterRef?.label} {change.amendingLawCitation ? <> · {change.amendingLawCitation}</> : null}
          {passageHref(change.beforeRef) ? <> · <a href={passageHref(change.beforeRef)!}><T value={migrationUi.beforeText} /></a></> : null}
          {passageHref(change.afterRef) ? <> · <a href={passageHref(change.afterRef)!}><T value={migrationUi.afterText} /></a></> : null}
          {change.legacyLinkUnresolved || change.linkReviewReason ? <> · <T value={migrationUi.unresolvedLink} /></> : null}
        </li>)}</ul>
        <ul>{documents[index]?.map(link => <li key={link.documentId}><a href={`/documents/${link.documentId}?revision=${link.document.revision.revision}`}>{link.document.revision.title}</a></li>)}{record.documents?.filter(document => document.url?.startsWith('https://')).map((document, sourceIndex) => <li key={`source-${sourceIndex}`}><a href={document.url!}>{document.label || document.url}</a></li>)}</ul>
      </article>
    </li>)}</ul>}
    {page ? <Pager previous={offset > 0 ? { href: href(Math.max(0, offset - page.limit)), label: <T value={migrationUi.previous} /> } : undefined} next={offset + page.limit < page.total ? { href: href(offset + page.limit), label: <T value={migrationUi.next} /> } : undefined} /> : null}
  </CollectionPage>;
}
