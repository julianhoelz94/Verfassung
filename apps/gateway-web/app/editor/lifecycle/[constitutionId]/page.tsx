import { notFound, redirect } from 'next/navigation';
import { PageMain } from '../../../components/PageMain';
import { PageHeader } from '../../../components/ui';
import { getConstitutionLifecycle, getCountry, getExportedUnits, getProvisionLifecycle, type ConstitutionLifecycleEvent, type ExportedUnit } from '../../../../lib/api';
import { publicVersions } from '../../../../lib/reading';
import { currentUser } from '../../../../lib/session';
import { appendLifecycleAction, appendProvisionAction } from '../actions';

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

const labels: Record<ConstitutionLifecycleEvent['eventType'], string> = {
  adopted: 'Adopted',
  commenced: 'Entered into force',
  suspended: 'Suspended',
  restored: 'Restored',
  repealed: 'Repealed',
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
    <PageMain className="wide">
      <PageHeader
        title={`Lifecycle · ${constitution.title}`}
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${code}`, label: country.name },
          { label: 'Lifecycle' },
        ]}
      />
      {query.saved ? <p role="status">Lifecycle event recorded.</p> : null}
      {query.error ? <p role="alert">The event could not be recorded. Check the date and transition.</p> : null}
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <time dateTime={event.eventDate}>{event.eventDate}</time> · {labels[event.eventType]}
            {event.note ? ` · ${event.note}` : ''}
          </li>
        ))}
      </ol>
      {provisionEvents.length > 0 ? (
        <section>
          <h2>Provision events</h2>
          <ol>
            {provisionEvents.map((event) => (
              <li key={event.id}><time dateTime={event.eventDate}>{event.eventDate}</time> · {event.eventType} · {event.logicalUnitIds.length} unit(s)</li>
            ))}
          </ol>
        </section>
      ) : null}
      {allowed.length > 0 ? (
        <form action={appendLifecycleAction} className="card">
          <input type="hidden" name="constitutionId" value={constitutionId} />
          <input type="hidden" name="code" value={code.toLowerCase()} />
          <label htmlFor="event-type">Event</label>
          <select id="event-type" name="eventType" required>
            {allowed.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
          </select>
          <label htmlFor="event-date">Effective date</label>
          <input id="event-date" type="date" name="eventDate" min={last?.eventDate} required />
          <label htmlFor="event-source">Source URL</label>
          <input id="event-source" type="url" name="sourceUrl" />
          <label htmlFor="event-note">Note</label>
          <textarea id="event-note" name="note" rows={3} />
          <button className="btn" type="submit">Record event</button>
        </form>
      ) : <p>This constitution has been repealed.</p>}
      {sourceVersionId ? (
        <section className="card">
          <h2>Record a provision event</h2>
          <form method="get">
            <input type="hidden" name="code" value={code} />
            <label htmlFor="scope-version">Source version</label>
            <select id="scope-version" name="versionId" defaultValue={sourceVersionId}>
              {versions.map((version) => (
                <option key={version.id} value={version.currentVersionId ?? version.id}>{version.versionLabel}</option>
              ))}
            </select>
            <button type="submit">Choose version</button>
          </form>
          <form action={appendProvisionAction}>
            <input type="hidden" name="constitutionId" value={constitutionId} />
            <input type="hidden" name="code" value={code.toLowerCase()} />
            <input type="hidden" name="sourceVersionId" value={sourceVersionId} />
            <label htmlFor="provision-event-type">Event</label>
            <select id="provision-event-type" name="eventType" required>
              <option value="deferred">Commencement deferred</option>
              <option value="commenced">Entered into force</option>
              <option value="suspended">Suspended</option>
              <option value="restored">Restored</option>
            </select>
            <label htmlFor="provision-event-date">Effective date</label>
            <input id="provision-event-date" type="date" name="eventDate" required />
            <fieldset>
              <legend>Affected provisions</legend>
              {units.map((unit) => (
                <label key={unit.id} style={{ display: 'block', paddingLeft: `${unit.depth}rem` }}>
                  <input type="checkbox" name="logicalUnitIds" value={unit.id} /> {unit.label}
                </label>
              ))}
            </fieldset>
            <label htmlFor="provision-event-source">Source URL</label>
            <input id="provision-event-source" type="url" name="sourceUrl" />
            <label htmlFor="provision-event-note">Note</label>
            <textarea id="provision-event-note" name="note" rows={3} />
            <button className="btn" type="submit">Record provision event</button>
          </form>
        </section>
      ) : null}
    </PageMain>
  );
}
