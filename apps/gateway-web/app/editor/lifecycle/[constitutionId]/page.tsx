import { reviewUi } from '../../../../lib/ui-review-messages';
import { T } from '../../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../../lib/messages';
import { notFound, redirect } from 'next/navigation';
import { WorkspacePage } from '../../../components/layout/templates';
import { PageHeader } from '../../../components/ui';
import { getConstitutionLifecycle, getCountry, getExportedUnits, getProvisionLifecycle, type ConstitutionLifecycleEvent, type ExportedUnit } from '../../../../lib/api';
import { publicVersions } from '../../../../lib/reading';
import { currentUser } from '../../../../lib/session';
import { appendLifecycleAction, appendProvisionAction } from '../actions';
import { Stack } from '../../../components/layout/Layout';
import surfaceStyles from '../../../components/surfaces.module.css';

type Props = {
  params: Promise<{ constitutionId: string }>;
  searchParams: Promise<{ code?: string; versionId?: string; error?: string; saved?: string }>;
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
  if (!user) redirect('/login');
  if (!user.roles.some((role) => role === 'publisher' || role === 'admin')) notFound();
  const country = await getCountry(code);
  const constitution = country?.constitutions.find((item) => item.id === constitutionId);
  if (!country || !constitution) notFound();
  const events = (await getConstitutionLifecycle(code) ?? []).filter((event) => event.constitutionId === constitutionId);
  const provisionEvents = (await getProvisionLifecycle(code) ?? []).filter((event) => event.constitutionId === constitutionId);
  const versions = publicVersions(constitution.versions);
  const selectedVersion = versions.find((version) => version.id === query.versionId || version.currentVersionId === query.versionId) ?? versions.at(-1);
  const sourceVersionId = selectedVersion?.currentVersionId ?? selectedVersion?.id;
  const units = sourceVersionId ? flatten((await getExportedUnits(sourceVersionId).catch(() => null))?.roots ?? []) : [];
  const last = events.at(-1);
  const allowed: ConstitutionLifecycleEvent['eventType'][] = !last
    ? ['adopted']
    : last.eventType === 'adopted'
      ? ['commenced', 'repealed']
      : last.eventType === 'suspended'
        ? ['restored', 'repealed']
        : last.eventType === 'repealed'
          ? []
          : ['suspended', 'repealed'];
  return (
    <WorkspacePage width="content" header={<PageHeader
        title={<><T value={reviewUi.lifecycle} /> · {constitution.title}</>}
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: `/countries/${code}`, label: country.name },
          { label: <T value={ui.remainingStatus.lifecycle} /> },
        ]}
      />}>

      {query.saved ? <p role="status"><T value={ui.editor.lifecycle.constitutionid.page.lifecycleEventRecorded} /></p> : null}
      {query.error ? <p role="alert"><T value={ui.editor.lifecycle.constitutionid.page.theEventCouldNotBeRecordedCheck} /></p> : null}
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <time dateTime={event.eventDate}>{event.dateCertainty === 'approximate' ? <T value={ui.remainingStatus.circa} /> : ''}{event.eventDate}</time> · {<T value={labels[event.eventType]} />}
            {event.note ? ` · ${event.note}` : ''}
          </li>
        ))}
      </ol>
      {provisionEvents.length > 0 ? (
        <section>
          <h2><T value={ui.editor.lifecycle.constitutionid.page.provisionEvents} /></h2>
          <ol>
            {provisionEvents.map((event) => (
              <li key={event.id}><time dateTime={event.eventDate}>{event.eventDate}</time> · {event.eventType} · {event.logicalUnitIds.length} <T value={ui.editor.lifecycle.constitutionid.page.unitS} /></li>
            ))}
          </ol>
        </section>
      ) : null}
      {allowed.length > 0 ? (
        <Stack as="form" action={appendLifecycleAction} className={["card", surfaceStyles.card].join(' ')}>
          <input type="hidden" name="constitutionId" value={constitutionId} />
          <input type="hidden" name="code" value={code.toLowerCase()} />
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
          <button className="btn" type="submit"><T value={ui.editor.lifecycle.constitutionid.page.recordEvent} /></button>
        </Stack>
      ) : <p><T value={ui.editor.lifecycle.constitutionid.page.thisConstitutionHasBeenRepealed} /></p>}
      {sourceVersionId ? (
        <section className={["card", surfaceStyles.card].join(' ')}>
          <h2><T value={ui.editor.lifecycle.constitutionid.page.recordAProvisionEvent} /></h2>
          <Stack as="form" method="get" className="form-section">
            <input type="hidden" name="code" value={code} />
            <label htmlFor="scope-version"><T value={ui.editor.lifecycle.constitutionid.page.sourceVersion} /></label>
            <select id="scope-version" name="versionId" defaultValue={sourceVersionId}>
              {versions.map((version) => (
                <option key={version.id} value={version.currentVersionId ?? version.id}>{version.versionLabel}</option>
              ))}
            </select>
            <button type="submit"><T value={ui.editor.lifecycle.constitutionid.page.chooseVersion} /></button>
          </Stack>
          <Stack as="form" action={appendProvisionAction}>
            <input type="hidden" name="constitutionId" value={constitutionId} />
            <input type="hidden" name="code" value={code.toLowerCase()} />
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
            <button className="btn" type="submit"><T value={ui.editor.lifecycle.constitutionid.page.recordProvisionEvent} /></button>
          </Stack>
        </section>
      ) : null}
    </WorkspacePage>
  );
}
