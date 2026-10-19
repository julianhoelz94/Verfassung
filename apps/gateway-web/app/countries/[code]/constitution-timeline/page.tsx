import { T } from '../../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../../lib/messages';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageMain } from '../../../components/PageMain';
import { ServiceUnavailable } from '../../../components/StatusMessage';
import { PageHeader } from '../../../components/ui';
import {
  getConstitutionLifecycle,
  getCountry,
  getProvisionLifecycle,
  resolveUnit,
  type ConstitutionLifecycleEvent,
  type ProvisionLifecycleEvent,
  type ResolvedUnit,
} from '../../../../lib/api';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../lib/page-meta';
import { publicVersions } from '../../../../lib/reading';

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ on?: string }> };

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const country = await getCountry(code).catch(() => null);
  return country
    ? pageMetadata({
        title: atlasTitle('Constitution timeline', country.name),
        description: metaDescription(`Constitutional history of ${country.name}.`),
        path: `/countries/${country.isoCode}/constitution-timeline`,
      })
    : { title: atlasTitle('Constitution timeline') };
}

export default async function ConstitutionTimelinePage({ params, searchParams }: Props) {
  const { code } = await params;
  const query = await searchParams;
  let country;
  let events;
  let provisionEvents;
  try {
    [country, events, provisionEvents] = await Promise.all([
      getCountry(code),
      getConstitutionLifecycle(code),
      getProvisionLifecycle(code),
    ]);
  } catch {
    return (
      <PageMain className="wide">
        <ServiceUnavailable service="Catalog" retryHref={`/countries/${code}/constitution-timeline`} />
      </PageMain>
    );
  }
  if (!country) notFound();

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
  const on = query.on && /^\d{4}-\d{2}-\d{2}$/.test(query.on) ? query.on : today;
  const statusOn = country.constitutions.map((constitution) => {
    const last = (events ?? [])
      .filter((event) => event.constitutionId === constitution.id && event.eventDate <= on)
      .at(-1);
    const status = last?.dateCertainty === 'approximate'
      ? 'uncertain (last event date is approximate)'
      : last?.eventType === 'commenced' || last?.eventType === 'restored'
      ? 'in force'
      : last?.eventType === 'adopted'
        ? 'adopted, awaiting commencement'
        : last?.eventType === 'suspended'
          ? 'suspended'
          : last?.eventType === 'repealed'
            ? 'repealed'
            : 'not recorded';
    return { constitution, status };
  });
  const inForce = statusOn.filter((row) => row.status === 'in force');
  const provisionStatus = new Map<string, { event: ProvisionLifecycleEvent; state: string }>();
  (provisionEvents ?? []).filter((event) => event.eventDate <= on)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id))
    .forEach((event) => event.logicalUnitIds.forEach((id) => {
      provisionStatus.set(`${event.constitutionId}:${id}`, {
        event,
        state: event.eventType === 'deferred' ? 'not yet in force' :
          event.eventType === 'suspended' ? 'suspended' : 'in force',
      });
    }));
  const provisionsNotInForce = [...provisionStatus.entries()].filter(([, row]) => row.state !== 'in force');

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: <T value={ui.remainingStatus.constitutionTimeline} /> },
        ]}
        title={<T value={ui.attrs.countriesCodeConstitutionTimelinePagePageHeaderTitle} />}
        actions={<a className="btn btn-sm" href={`/countries/${country.isoCode}/timeline`}><T value={ui.countries.code.constitutionTimeline.page.amendmentTimeline} /></a>}
      />
      <p><T value={ui.countries.code.constitutionTimeline.page.adoptionSuspensionRestorationAndReplacementOfConstitutions} />{" "}{country.name}.</p>
      <section className="card">
        <h2><T value={ui.countries.code.constitutionTimeline.page.statusOnADate} /></h2>
        <form method="get">
          <label htmlFor="constitution-timeline-date"><T value={ui.countries.code.constitutionTimeline.page.date} /></label>
          <input id="constitution-timeline-date" type="date" name="on" defaultValue={on} />
          <button type="submit"><T value={ui.countries.code.constitutionTimeline.page.showStatus} /></button>
        </form>
        {inForce.length === 0 ? <p><T value={ui.countries.code.constitutionTimeline.page.noConstitutionIsRecordedAsInForce} />{" "}{on}.</p> : (
          <ul>{inForce.map(({ constitution }) => (
            <li key={constitution.id}><a href={`/countries/${country.isoCode}/constitutions/${constitution.id}`}>{constitution.title}</a> <T value={ui.countries.code.constitutionTimeline.page.isInForce} /></li>
          ))}</ul>
        )}
        <details>
          <summary><T value={ui.countries.code.constitutionTimeline.page.allConstitutionStatuses} /></summary>
          <ul>{statusOn.map(({ constitution, status }) => (
            <li key={constitution.id}>{constitution.title}: {status}</li>
          ))}</ul>
        </details>
        {provisionsNotInForce.length > 0 ? (
          <div>
            <h3><T value={ui.countries.code.constitutionTimeline.page.provisionsNotInForceOnThisDate} /></h3>
            <ul>
              {provisionsNotInForce.map(([key, row]) => {
                const logicalId = key.split(':')[1];
                const resolved = units.get(`${row.event.sourceVersionId}:${logicalId}`);
                const constitution = constitutionsById.get(row.event.constitutionId);
                return <li key={key}>{constitution?.title}: {resolved?.pathLabels.join(' → ') || 'Unit reference needs review'} · {row.state}</li>;
              })}
            </ul>
          </div>
        ) : null}
      </section>
      {dated.length === 0 ? <p><T value={ui.countries.code.constitutionTimeline.page.noDatedConstitutionEventsAreRecordedYet} /></p> : null}
      <ol>
        {dated.map((event) => {
          const constitution = constitutionsById.get(event.constitutionId);
          if (!constitution) return null;
          const predecessor = constitution.predecessorConstitutionId
            ? constitutionsById.get(constitution.predecessorConstitutionId)
            : null;
          const versions = publicVersions(constitution.versions);
          return (
            <li key={event.id} className="card">
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
                    const label = resolved?.pathLabels.join(' → ') || 'Unit reference needs review';
                    return (
                      <li key={logicalId}>
                        {resolved ? <a href={resolved.deepLink}>{label}</a> : label}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {event.sourceUrl ? <p><a href={event.sourceUrl}><T value={ui.countries.code.constitutionTimeline.page.source} /></a></p> : null}
            </li>
          );
        })}
      </ol>
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
    </PageMain>
  );
}
