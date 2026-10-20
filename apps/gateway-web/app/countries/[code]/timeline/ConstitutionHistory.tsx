import { currentLocale } from '../../../../lib/server-locale';
import { lifecycleStatusMessage } from '../../../../lib/lifecycle-label';
import { T } from '../../../components/TranslationProvider';
import { message, ui, type UiMessage } from '../../../../lib/messages';
import {
  getConstitutionLifecycle,
  getProvisionLifecycle,
  resolveUnit,
  type CountryDetail,
  type ConstitutionLifecycleEvent,
  type ProvisionLifecycleEvent,
  type ResolvedUnit,
} from '../../../../lib/api';
import { publicVersions } from '../../../../lib/reading';
import { Disclosure } from '../../../components/Disclosure';

import type { HistoryMilestone } from '../../../components/HistoryTimeline';
import surfaceStyles from '../../../components/surfaces.module.css';
import fieldStyles from '../../../components/fields.module.css';

const labels: Record<ConstitutionLifecycleEvent['eventType'], UiMessage> = {
  adopted: ui.lifecycleEvents.adopted,
  commenced: ui.lifecycleEvents.commenced,
  suspended: ui.lifecycleEvents.suspended,
  restored: ui.lifecycleEvents.restored,
  repealed: ui.lifecycleEvents.repealed,
};

const provisionLabels: Record<ProvisionLifecycleEvent['eventType'], UiMessage> = {
  deferred: ui.lifecycleEvents.provisionDeferred,
  commenced: ui.lifecycleEvents.provisionCommenced,
  suspended: ui.lifecycleEvents.provisionSuspended,
  restored: ui.lifecycleEvents.provisionRestored,
};

export async function loadConstitutionHistory(country: CountryDetail, onValue?: string, eventFilter = 'all') {
  const code = country.isoCode;
  const locale = await currentLocale();
  const [events, provisionEvents] = await Promise.all([
    getConstitutionLifecycle(code), getProvisionLifecycle(code),
  ]);
  const constitutionsById = new Map(country.constitutions.map((constitution) => [constitution.id, constitution]));
  const dated = [
    ...(events ?? []).map((event) => ({ ...event, scope: 'whole' as const })),
    ...(provisionEvents ?? []).map((event) => ({ ...event, scope: 'provisions' as const })),
  ].sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id),
  );
  const units = new Map<string, ResolvedUnit | null>(
    await Promise.all((provisionEvents ?? []).flatMap((event) =>
      event.logicalUnitIds.map(async (logicalId) => [
        `${event.sourceVersionId}:${logicalId}`,
        await resolveUnit(event.sourceVersionId, logicalId).catch(() => null),
      ] as const),
    )),
  );
  const undated = country.constitutions.filter(
    (constitution) => !dated.some((event) => event.constitutionId === constitution.id),
  );
  const today = new Date().toISOString().slice(0, 10);
  const on = onValue && /^\d{4}-\d{2}-\d{2}$/.test(onValue) ? onValue : today;
  const statusOn = country.constitutions.map((constitution) => {
    const last = (events ?? [])
      .filter((event) => event.constitutionId === constitution.id && event.eventDate <= on)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id))
      .at(-1);
    const status = last?.dateCertainty === 'approximate'
      ? 'uncertain_approximate'
      : last?.eventType === 'commenced' || last?.eventType === 'restored'
      ? 'in_force'
      : last?.eventType === 'adopted'
        ? 'awaiting_commencement'
        : last?.eventType === 'suspended'
          ? 'suspended'
          : last?.eventType === 'repealed'
            ? 'repealed'
            : 'not_recorded';
    return { constitution, status };
  });
  const inForce = statusOn.filter((row) => row.status === 'in_force');
  const provisionStatus = new Map<string, { event: ProvisionLifecycleEvent; state: string }>();
  (provisionEvents ?? []).filter((event) => event.eventDate <= on)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id))
    .forEach((event) => event.logicalUnitIds.forEach((id) => {
      provisionStatus.set(`${event.constitutionId}:${id}`, {
        event,
        state: event.eventType === 'deferred' ? 'awaiting_commencement' :
          event.eventType === 'suspended' ? 'suspended' : 'in_force',
      });
    }));
  const provisionsNotInForce = [...provisionStatus.entries()].filter(([, row]) => row.state !== 'in_force');

  const items: HistoryMilestone[] = dated.filter(event => constitutionsById.has(event.constitutionId)).map((event) => {
    const constitution = constitutionsById.get(event.constitutionId)!;
    const predecessor = constitution.predecessorConstitutionId
      ? constitutionsById.get(constitution.predecessorConstitutionId)
      : null;
    const versions = publicVersions(constitution.versions);
    return { kind: 'constitution' as const, id: event.id, date: event.eventDate, dateApproximate: event.scope === 'whole' && event.dateCertainty === 'approximate', title: `${message(locale, event.scope === 'whole' ? labels[event.eventType] : provisionLabels[event.eventType])} · ${constitution.title}`, content: (
      <article className={["card", surfaceStyles.card].join(' ')}>
        <p><time dateTime={event.eventDate}>{event.scope === 'whole' && event.dateCertainty === 'approximate' ? <T value={ui.remainingStatus.circa} /> : ''}{event.eventDate}</time> · {<T value={event.scope === 'whole' ? labels[event.eventType] : provisionLabels[event.eventType]} />}</p>
        <h2 className="card-title">
          <a href={`/countries/${country.isoCode}/constitutions/${constitution.id}`}>{constitution.title}</a>
          {constitution.interim ? ' (interim)' : ''}
        </h2>
        {event.scope === 'whole' && event.eventType === 'adopted' && predecessor ? (
          <p><T value={ui.countries.code.constitutionTimeline.page.replaces} />{" "}<a href={`/countries/${country.isoCode}/constitutions/${predecessor.id}`}>{predecessor.title}</a></p>
        ) : null}
        {event.note ? <p>{event.note}</p> : null}
        {versions.length > 0 ? (
          <p><T value={ui.countries.code.constitutionTimeline.page.publishedVersions} />{" "}{versions.map((version, index) => (
            <span key={version.id}>{index > 0 ? ' · ' : ''}<a href={`/countries/${country.isoCode}/versions/${version.currentVersionId ?? version.id}`}>{version.versionLabel}</a></span>
          ))}</p>
        ) : null}
        {event.scope === 'provisions' ? (
          <ul>
            {event.logicalUnitIds.map((logicalId) => {
              const resolved = units.get(`${event.sourceVersionId}:${logicalId}`);
              const label = resolved?.pathLabels.join(' → ') || <T value={ui.lifecycleEvents.unitNeedsReview} />;
              return (
                <li key={logicalId}>
                  {resolved ? <a href={resolved.deepLink}>{label}</a> : label}
                </li>
              );
            })}
          </ul>
        ) : null}
        {event.sourceUrl ? <p><a href={event.sourceUrl}><T value={ui.countries.code.constitutionTimeline.page.source} /></a></p> : null}
      </article>
    ) };
  });
  return { items, status: (<>
      <section className={["card history-status", surfaceStyles.card].join(' ')}>
        <h2><T value={ui.countries.code.constitutionTimeline.page.statusOnADate} /></h2>
        <form method="get" className="date-filter" action={`/countries/${country.isoCode}/timeline`}>
          <input type="hidden" name="events" value={eventFilter} />
          <label className={["field", fieldStyles.field].join(' ')} htmlFor="constitution-timeline-date"><T value={ui.countries.code.constitutionTimeline.page.date} />
            <input id="constitution-timeline-date" type="date" name="on" defaultValue={on} />
          </label>
          <button type="submit"><T value={ui.countries.code.constitutionTimeline.page.showStatus} /></button>
        </form>
        {inForce.length === 0 ? <p><T value={ui.countries.code.constitutionTimeline.page.noConstitutionIsRecordedAsInForce} />{" "}{on}.</p> : (
          <ul>{inForce.map(({ constitution }) => (
            <li key={constitution.id}><a href={`/countries/${country.isoCode}/constitutions/${constitution.id}`}>{constitution.title}</a> <T value={ui.countries.code.constitutionTimeline.page.isInForce} /></li>
          ))}</ul>
        )}
        <Disclosure summary={<T value={ui.countries.code.constitutionTimeline.page.allConstitutionStatuses} />}>
          <ul>{statusOn.map(({ constitution, status }) => (
            <li key={constitution.id}>{constitution.title}: <T value={status === 'uncertain_approximate' ? ui.lifecycleEvents.uncertainDate : lifecycleStatusMessage(status)} /></li>
          ))}</ul>
        </Disclosure>
        {provisionsNotInForce.length > 0 ? (
          <div>
            <h3><T value={ui.countries.code.constitutionTimeline.page.provisionsNotInForceOnThisDate} /></h3>
            <ul>
              {provisionsNotInForce.map(([key, row]) => {
                const logicalId = key.split(':')[1];
                const resolved = units.get(`${row.event.sourceVersionId}:${logicalId}`);
                const constitution = constitutionsById.get(row.event.constitutionId);
                return <li key={key}>{constitution?.title}: {resolved?.pathLabels.join(' → ') || <T value={ui.lifecycleEvents.unitNeedsReview} />} · {<T value={lifecycleStatusMessage(row.state)} />}</li>;
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {undated.length > 0 ? (
        <section>
          <h2><T value={ui.countries.code.constitutionTimeline.page.datesNotRecorded} /></h2>
          <ul>
            {undated.map((constitution) => (
              <li key={constitution.id}><a href={`/countries/${country.isoCode}/constitutions/${constitution.id}`}>{constitution.title}</a></li>
            ))}
          </ul>
        </section>
      ) : null}
  </>) };
}
