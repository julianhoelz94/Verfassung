import { StagedRecordForm } from '../StagedRecordForm';
import { StagedDocumentPicker } from '../../../components/documents/StagedDocumentPicker';
import { safeReturnTo } from '../../../../lib/return-to';
import { loadConstitutionCollection } from '../../../../lib/country-directory';
import { loginHref } from '../../../../lib/return-to';
import { reviewUi } from '../../../../lib/ui-review-messages';
import { T } from '../../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../../lib/messages';
import { notFound, redirect } from 'next/navigation';
import { WorkspacePage } from '../../../components/layout/templates';
import { PageHeader } from '../../../components/ui';
import { getConstitutionEvents, getExportedUnits, getConstitutionProvisionEvents, type ConstitutionLifecycleEvent, type ExportedUnit } from '../../../../lib/api';
import { publicVersions } from '../../../../lib/reading';
import { currentUser } from '../../../../lib/session';
import { reviseLifecycleEvidenceAction, appendLifecycleAction, appendProvisionAction } from '../actions';
import { Stack } from '../../../components/layout/Layout';
import surfaceStyles from '../../../components/surfaces.module.css';
import { DocumentLinks } from '../../documents/DocumentLinks';
import { currentLocale } from '../../../../lib/server-locale';

type Props = {
  params: Promise<{ constitutionId: string }>;
  searchParams: Promise<{ code?: string; jurisdictionId?: string; eventId?: string; returnTo?: string; versionId?: string; error?: string; saved?: string }>;
};

function flatten(roots: ExportedUnit[]): Array<{ id: string; label: string; depth: number }> {
  const rows: Array<{ id: string; label: string; depth: number }> = [];
  const visit = (node: ExportedUnit, depth: number) => {
    if (node.logicalId) rows.push({
      id: node.logicalId,
      label: [node.kind, node.label, node.title].filter(Boolean).join(' · ') || node.logicalId,
      depth,
    });
    node.content?.forEach((entry) => { if (entry.node) visit(entry.node, depth + 1); });
  };
  roots.forEach((root) => visit(root, 0));
  return rows;
}

const labels: Record<ConstitutionLifecycleEvent['eventType'], UiMessage> = {
  adopted: ui.lifecycleEvents.adopted,
  commenced: ui.lifecycleEvents.commenced,
  suspended: ui.lifecycleEvents.suspended,
  restored: ui.lifecycleEvents.restored,
  repealed: ui.lifecycleEvents.repealed,
};

export default async function LifecycleEditor({ params, searchParams }: Props) {
  const { constitutionId } = await params;
  const query = await searchParams;
  const code = query.code?.toUpperCase() ?? '';
  const user = await currentUser();
  const locale = await currentLocale();
  if (!user) redirect(loginHref(`/editor/lifecycle/${encodeURIComponent(constitutionId)}`, query));
  if (!user.roles.some((role) => role === 'publisher' || role === 'admin')) notFound();
  const context = await loadConstitutionCollection(query.jurisdictionId ? {id:query.jurisdictionId} : {code});
  const country=context?.collection;
  const constitution=country?.constitutions.find(item=>item.id===constitutionId);
  if(!country||!constitution)notFound();
  const events=(await getConstitutionEvents(constitutionId)??[]);
  const selectedEvent=events.find(event=>event.id===query.eventId);
  const provisionEvents = (await getConstitutionProvisionEvents(constitutionId) ?? []);
  const versions = publicVersions(constitution.versions);
  const selectedVersion = versions.find((version) => version.id === query.versionId || version.currentVersionId === query.versionId) ?? versions.at(-1);
  const sourceVersionId = selectedVersion?.currentVersionId ?? selectedVersion?.id;
  const units = sourceVersionId ? flatten((await getExportedUnits(sourceVersionId).catch(() => null))?.roots ?? []) : [];
  const last = events.at(-1);
  const allowed=nextEventTypes(last);
  return (
    <WorkspacePage width="content" header={<PageHeader
        title={<><T value={reviewUi.lifecycle} /> · {constitution.title}</>}
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: context?.owner.href??'/', label: country.name },
          { label: <T value={ui.remainingStatus.lifecycle} /> },
        ]}
      />}>

      {query.returnTo ? <p><a href={safeReturnTo(query.returnTo, '/editor')}><T value={{en:'Return to event',de:'Zurück zum Ereignis'}} /></a></p> : null}
      <LifecycleEvidenceForm event={selectedEvent} constitutionId={constitutionId} returnTo={query.returnTo} code={code}/>
      {query.saved ? <p role="status"><T value={ui.editor.lifecycle.constitutionid.page.lifecycleEventRecorded} /></p> : null}
      {query.error ? <p role="alert"><T value={ui.editor.lifecycle.constitutionid.page.theEventCouldNotBeRecordedCheck} /></p> : null}
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <time dateTime={event.eventDate}>{event.dateCertainty === 'approximate' ? <T value={ui.remainingStatus.circa} /> : ''}{event.eventDate}</time> · {<T value={labels[event.eventType]} />}
            {event.note ? ` · ${event.note}` : ''}
            <details><summary><T value={{en:'Sources and commentary',de:'Quellen und Kommentare'}} /></summary>
              <DocumentLinks targetType="lifecycle_material" targetId={constitutionId} scopeRevisionId={event.id}
                returnTo={`/editor/lifecycle/${constitutionId}?${new URLSearchParams({code, ...(query.jurisdictionId ? {jurisdictionId:query.jurisdictionId} : {})})}`}
                heading={locale === 'de' ? 'Quellen dieses Ereignisses' : 'Sources for this event'} headingLevel="h3" canEdit />
            </details>
          </li>
        ))}
      </ol>
      {provisionEvents.length > 0 ? (
        <section>
          <h2><T value={ui.editor.lifecycle.constitutionid.page.provisionEvents} /></h2>
          <ol>
            {provisionEvents.map((event) => (
              <li key={event.id}><time dateTime={event.eventDate}>{event.eventDate}</time> · {event.eventType} · {event.logicalUnitIds.length} <T value={ui.editor.lifecycle.constitutionid.page.unitS} />
                <details><summary><T value={{en:'Source documents',de:'Quelldokumente'}} /></summary>
                  <DocumentLinks targetType="lifecycle_material" targetId={constitutionId} scopeRevisionId={event.id}
                    returnTo={`/editor/lifecycle/${constitutionId}?${new URLSearchParams({code,versionId:event.sourceVersionId,...(query.jurisdictionId ? {jurisdictionId:query.jurisdictionId} : {})})}`}
                    heading={locale === 'de' ? 'Quellen dieses Artikelereignisses' : 'Sources for this provision event'} headingLevel="h3" canEdit />
                </details>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {allowed.length > 0 ? (
        <StagedRecordForm action={appendLifecycleAction} className={["card", surfaceStyles.card].join(' ')}>
          <input type="hidden" name="constitutionId" value={constitutionId} />
          <input type="hidden" name="code" value={code.toLowerCase()} /><input type="hidden" name="jurisdictionId" value={query.jurisdictionId??''} />
          <label htmlFor="event-type"><T value={ui.editor.lifecycle.constitutionid.page.event} /></label>
          <select id="event-type" name="eventType" required>
            {allowed.map((kind) => <option key={kind} value={kind}>{<T value={labels[kind]} />}</option>)}
          </select>
          <label htmlFor="event-date"><T value={ui.editor.lifecycle.constitutionid.page.effectiveDate} /></label>
          <input id="event-date" type="date" name="eventDate" min={last?.eventDate} required />
          <label htmlFor="event-certainty"><T value={ui.editor.lifecycle.constitutionid.page.dateCertainty} /></label>
          <select id="event-certainty" name="dateCertainty" defaultValue="exact">
            <option value="exact"><T value={ui.editor.lifecycle.constitutionid.page.exactDate} /></option>
            <option value="approximate"><T value={ui.editor.lifecycle.constitutionid.page.approximateDate} /></option>
          </select>
          <p><T value={ui.editor.lifecycle.constitutionid.page.ifTheDateIsUnknownLeaveThe} /></p>
          <label htmlFor="event-source"><T value={ui.editor.lifecycle.constitutionid.page.sourceUrl} /></label>
          <input id="event-source" type="url" name="sourceUrl" />
          <label htmlFor="event-note"><T value={ui.editor.lifecycle.constitutionid.page.note} /></label>
          <textarea id="event-note" name="note" rows={3} />
          <StagedDocumentPicker name="stagedDocuments" heading={locale === 'de' ? 'Dokumente zum Verfassungsereignis' : 'Constitution event documents'} canCreate={user.roles.includes("editor") || user.roles.includes("admin")} />
          <button className="btn" type="submit"><T value={ui.editor.lifecycle.constitutionid.page.recordEvent} /></button>
        </StagedRecordForm>
      ) : <p><T value={ui.editor.lifecycle.constitutionid.page.thisConstitutionHasBeenRepealed} /></p>}
      {sourceVersionId ? (
        <section className={["card", surfaceStyles.card].join(' ')}>
          <h2><T value={ui.editor.lifecycle.constitutionid.page.recordAProvisionEvent} /></h2>
          <Stack as="form" method="get" className="form-section">
            <input type="hidden" name="code" value={code} /><input type="hidden" name="jurisdictionId" value={query.jurisdictionId??''} />
            <label htmlFor="scope-version"><T value={ui.editor.lifecycle.constitutionid.page.sourceVersion} /></label>
            <select id="scope-version" name="versionId" defaultValue={sourceVersionId}>
              {versions.map((version) => (
                <option key={version.id} value={version.currentVersionId ?? version.id}>{version.versionLabel}</option>
              ))}
            </select>
            <button type="submit"><T value={ui.editor.lifecycle.constitutionid.page.chooseVersion} /></button>
          </Stack>
          <StagedRecordForm action={appendProvisionAction}>
            <input type="hidden" name="constitutionId" value={constitutionId} />
            <input type="hidden" name="code" value={code.toLowerCase()} /><input type="hidden" name="jurisdictionId" value={query.jurisdictionId??''} />
            <input type="hidden" name="sourceVersionId" value={sourceVersionId} />
            <label htmlFor="provision-event-type"><T value={ui.editor.lifecycle.constitutionid.page.event} /></label>
            <select id="provision-event-type" name="eventType" required>
              <option value="deferred"><T value={ui.editor.lifecycle.constitutionid.page.commencementDeferred} /></option>
              <option value="commenced"><T value={ui.editor.lifecycle.constitutionid.page.enteredIntoForce} /></option>
              <option value="suspended"><T value={ui.editor.lifecycle.constitutionid.page.suspended} /></option>
              <option value="restored"><T value={ui.editor.lifecycle.constitutionid.page.restored} /></option>
            </select>
            <label htmlFor="provision-event-date"><T value={ui.editor.lifecycle.constitutionid.page.effectiveDate} /></label>
            <input id="provision-event-date" type="date" name="eventDate" required />
            <fieldset>
              <legend><T value={ui.editor.lifecycle.constitutionid.page.affectedProvisions} /></legend>
              {units.map((unit) => (
                <label key={unit.id} style={{ display: 'block', paddingLeft: `${unit.depth}rem` }}>
                  <input type="checkbox" name="logicalUnitIds" value={unit.id} /> {unit.label}
                </label>
              ))}
            </fieldset>
            <label htmlFor="provision-event-source"><T value={ui.editor.lifecycle.constitutionid.page.sourceUrl} /></label>
            <input id="provision-event-source" type="url" name="sourceUrl" />
              <label htmlFor="provision-event-note"><T value={ui.editor.lifecycle.constitutionid.page.note} /></label>
            <textarea id="provision-event-note" name="note" rows={3} />
            <StagedDocumentPicker name="stagedDocuments" heading={locale === 'de' ? 'Dokumente zum Artikelereignis' : 'Provision event documents'} headingLevel="h3" canCreate={user.roles.includes("editor") || user.roles.includes("admin")} />
          <button className="btn" type="submit"><T value={ui.editor.lifecycle.constitutionid.page.recordProvisionEvent} /></button>
          </StagedRecordForm>
        </section>
      ) : null}
    </WorkspacePage>
  );
}

function LifecycleEvidenceForm({event:selectedEvent,constitutionId,returnTo,code}: {event:ConstitutionLifecycleEvent|undefined;constitutionId:string;returnTo?:string;code:string}) {
  if(!selectedEvent)return null;
  return <form action={reviseLifecycleEvidenceAction}>
        <h2><T value={{en:'Edit event evidence',de:'Ereignisbelege bearbeiten'}} /></h2>
        <p>{selectedEvent.eventDate} · <T value={labels[selectedEvent.eventType]} /></p>
        <input type="hidden" name="constitutionId" value={constitutionId}/><input type="hidden" name="eventId" value={selectedEvent.id}/><input type="hidden" name="expectedRevisionId" value={selectedEvent.evidenceRevisionId??''}/><input type="hidden" name="returnTo" value={safeReturnTo(returnTo??'',`/editor/lifecycle/${constitutionId}?code=${code}`)}/>
        <label><T value={{en:'Event note',de:'Ereignisnotiz'}} /><textarea name="note" maxLength={10000} defaultValue={selectedEvent.note??''}/></label>
        <label><T value={{en:'Source URL',de:'Quellen-URL'}} /><input name="sourceUrl" type="url" maxLength={2048} defaultValue={selectedEvent.sourceUrl??''}/></label>
        <p><T value={{en:'Save a new evidence revision. The event type and legal date remain fixed.',de:'Eine neue Belegrevision speichern. Ereignisart und rechtliches Datum bleiben fest.'}} /></p><button><T value={{en:'Save event evidence',de:'Ereignisbelege speichern'}} /></button>
      </form>;
}

function nextEventTypes(last:ConstitutionLifecycleEvent|undefined):ConstitutionLifecycleEvent['eventType'][] {
  if(!last)return ['adopted'];
  switch(last.eventType) {
    case 'adopted':return ['commenced','repealed'];
    case 'suspended':return ['restored','repealed'];
    case 'repealed':return [];
    default:return ['suspended','repealed'];
  }
}
