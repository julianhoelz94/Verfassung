import { notFound, redirect } from 'next/navigation';
import { getConstitutionEvents, getConstitutionProvisionEvents, getExportedUnits, type ProvisionLifecycleEvent } from '../../../../lib/api';
import { loadConstitutionCollection } from '../../../../lib/country-directory';
import { flattenLifecycleUnits, type LifecycleUnit } from '../../../../lib/lifecycle-workspace';
import { publicVersions } from '../../../../lib/reading';
import { loginHref, safeReturnTo } from '../../../../lib/return-to';
import { currentLocale } from '../../../../lib/server-locale';
import { currentUser } from '../../../../lib/session';
import { FullWidthPage } from '../../../components/layout/PageChrome';
import { DocumentLinks } from '../../documents/DocumentLinks';
import { LifecycleWorkspace } from '../LifecycleWorkspace';

type Props = {
  params: Promise<{ constitutionId: string }>;
  searchParams: Promise<{ code?: string; jurisdictionId?: string; eventId?: string; returnTo?: string; versionId?: string; error?: string; saved?: string }>;
};

export default async function LifecycleEditor({ params, searchParams }: Props) {
  const { constitutionId } = await params, query = await searchParams;
  const code = query.code?.toUpperCase() ?? '', user = await currentUser();
  if (!user) redirect(loginHref(`/editor/lifecycle/${encodeURIComponent(constitutionId)}`, query));
  if (!user.roles.some(role => role === 'publisher' || role === 'admin')) notFound();
  const context = await loadConstitutionCollection(query.jurisdictionId ? { id: query.jurisdictionId } : { code });
  const constitution = context?.collection.constitutions.find(item => item.id === constitutionId);
  if (!context || !constitution) notFound();
  const locale = await currentLocale();
  const [events, provisions] = await Promise.all([getConstitutionEvents(constitutionId), getConstitutionProvisionEvents(constitutionId)]);
  const versions = publicVersions(constitution.versions);
  const selected = versions.find(version => version.id === query.versionId || version.currentVersionId === query.versionId) ?? versions.at(-1);
  const sourceVersionId = selected?.currentVersionId ?? selected?.id;
  const units = sourceVersionId ? flattenLifecycleUnits((await getExportedUnits(sourceVersionId).catch(() => null))?.roots ?? []) : [];
  const provisionContexts = await loadProvisionContexts(provisions ?? [], sourceVersionId, units, context.owner.href, versions.map(version => ({ id: version.currentVersionId ?? version.id, label: version.versionLabel })));
  const returnTo = `/editor/lifecycle/${constitutionId}?${new URLSearchParams({ code, ...(query.jurisdictionId ? { jurisdictionId: query.jurisdictionId } : {}), ...(sourceVersionId ? { versionId: sourceVersionId } : {}) })}`;
  const materials = Object.fromEntries([...(events ?? []), ...(provisions ?? [])].map(event => [event.id,
    <DocumentLinks key={event.id} targetType="lifecycle_material" targetId={constitutionId} scopeRevisionId={event.id} returnTo={returnTo} canEdit
      heading={locale === 'de' ? 'Quellen dieses Ereignisses' : 'Sources for this event'} headingLevel="h4" />,
  ]));
  return <FullWidthPage template="workspace"><LifecycleWorkspace constitutionId={constitutionId} code={code} jurisdictionId={query.jurisdictionId}
    canCreate={user.roles.includes('editor') || user.roles.includes('admin')} title={constitution.title} ownerName={context.owner.name} ownerHref={context.owner.href}
    events={events ?? []} provisions={provisions ?? []} versions={versions.map(version => ({ id: version.currentVersionId ?? version.id, label: version.versionLabel }))}
    sourceVersionId={sourceVersionId} units={units} provisionContexts={provisionContexts} materials={materials} asOf={new Date().toISOString().slice(0, 10)} returnTo={safeReturnTo(query.returnTo ?? '', returnTo)}
    backHref={query.returnTo ? safeReturnTo(query.returnTo, '/editor') : undefined} initialEventId={query.eventId} saved={!!query.saved} failed={!!query.error} />
  </FullWidthPage>;
}

/** Resolve labels from each event’s pinned snapshot, including retained older corrections. */
async function loadProvisionContexts(events: ProvisionLifecycleEvent[], selectedId: string | undefined, selectedUnits: LifecycleUnit[], ownerHref: string, versions: { id: string; label: string }[]) {
  const ids = [...new Set(events.map(event => event.sourceVersionId))];
  const snapshots = new Map<string, LifecycleUnit[]>(selectedId ? [[selectedId, selectedUnits]] : []);
  for (let start = 0; start < ids.length; start += 6) {
    await Promise.all(ids.slice(start, start + 6).filter(id => !snapshots.has(id)).map(async id => {
      snapshots.set(id, flattenLifecycleUnits((await getExportedUnits(id).catch(() => null))?.roots ?? []));
    }));
  }
  return Object.fromEntries(events.map(event => [event.id, {
    versionHref: `${ownerHref}/versions/${encodeURIComponent(event.sourceVersionId)}`,
    versionLabel: versions.find(version => version.id === event.sourceVersionId)?.label,
    units: (snapshots.get(event.sourceVersionId) ?? []).filter(unit => event.logicalUnitIds.includes(unit.id)).map(({ id, path }) => ({ id, path })),
  }]));
}
