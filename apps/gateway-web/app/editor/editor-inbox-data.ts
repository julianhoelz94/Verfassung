import { getCountry, getVersion, type CountryDetail, type VersionDetail } from '../../lib/api';
import { getJurisdiction, type JurisdictionDetail } from '../../lib/migration-api';
import { getConstitutionMetadata } from '../../lib/constitution-metadata';
import { listAllSessions, type EditSessionSummary } from '../../lib/editor-api';
import { listAllImportJobs, listMyImportJobs, type ImportJob } from '../../lib/ingestion-api';
import { requireSessionBearer } from '../../lib/session';
import { message, ui } from '../../lib/messages';
import type { Locale } from '../../lib/locale';
import { inboxQueues, type InboxQueue, type InboxRow } from '../../lib/editor-inbox';
import { versionReaderHref } from '../../lib/reader-links';

type QueueData = { sessions: EditSessionSummary[]; imports: ImportJob[]; sessionsUnavailable: boolean; importsUnavailable: boolean };
/** Bound optional Catalog fan-out, deduplicate identities and retain rows when metadata fails. */
async function loadMap<T>(ids: string[], read: (id: string) => Promise<T | null>): Promise<Map<string, T>> {
  const result = new Map<string, T>(), unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 6) {
    const items = await Promise.all(unique.slice(i, i + 6).map(async id => [id, await read(id).catch(() => null)] as const));
    for (const [id, value] of items) if (value) result.set(id, value);
  }
  return result;
}
async function loadQueue(queue: InboxQueue, userId: string, authorization: string, archived: boolean): Promise<QueueData> {
  const [sessions, imports] = await Promise.allSettled([
    listAllSessions(queue === 'mine' ? { openedBy: 'me', archived } : { status: queue }),
    queue === 'mine' ? listMyImportJobs(authorization, archived) : listAllImportJobs(authorization, queue === 'reviewing' ? 'pending_review' : 'approved'),
  ]);
  return {
    sessions: sessions.status === 'fulfilled' ? sessions.value.filter(session => queue === 'mine' ? session.openedBy === userId : session.status === queue) : [],
    imports: imports.status === 'fulfilled' ? imports.value.filter(job => queue === 'mine' ? job.submittedBy === userId : job.status === (queue === 'reviewing' ? 'pending_review' : 'approved')) : [],
    sessionsUnavailable: sessions.status === 'rejected', importsUnavailable: imports.status === 'rejected',
  };
}
type Metadata = { versions: Map<string, VersionDetail>; countries: Map<string, CountryDetail>; jurisdictions: Map<string, JurisdictionDetail>; titles: Map<string, { title: string }> };
async function loadMetadata(data: QueueData, authorization: string): Promise<Metadata> {
  const versions = await loadMap([...data.sessions.map(s => s.versionId), ...data.imports.flatMap(job => job.versionId ? [job.versionId] : [])], id => getVersion(id, authorization));
  const jurisdictions = await loadMap([...versions.values()].flatMap(v => !v.countryCode && v.jurisdictionId ? [v.jurisdictionId] : []), getJurisdiction);
  const countries = await loadMap([...versions.values()].flatMap(v => v.countryCode ? [v.countryCode] : []), code => getCountry(code, authorization));
  const known = [...countries.values()].flatMap(c => c.constitutions).concat([...jurisdictions.values()].flatMap(j => j.constitutions));
  const titles = await loadMap([...versions.values()].filter(v => !known.some(c => c.id === v.constitutionId)).map(v => v.constitutionId), id => getConstitutionMetadata(id, authorization));
  return { versions, countries, jurisdictions, titles };
}
function rowContext(versionId: string | null, fallback: Partial<InboxRow>, metadata: Metadata, locale: Locale): Pick<InboxRow, 'countryKey' | 'country' | 'constitutionKey' | 'constitution' | 'jurisdiction' | 'regional' | 'historical' | 'version' | 'publicHref'> {
  const version = versionId ? metadata.versions.get(versionId) : undefined;
  const region = version?.jurisdictionId ? metadata.jurisdictions.get(version.jurisdictionId) : undefined;
  const country = version?.countryCode ? metadata.countries.get(version.countryCode) : undefined;
  const countryAncestor = region?.jurisdiction.kind === 'country' ? region.jurisdiction : region?.ancestors.find(item => item.kind === 'country');
  const constitution = (region?.constitutions ?? country?.constitutions)?.find(item => item.id === version?.constitutionId);
  const countryKey = country?.isoCode ?? version?.countryCode ?? countryAncestor?.code ?? fallback.countryKey ?? 'unavailable';
  return {
    countryKey, country: country?.name ?? countryAncestor?.name ?? fallback.country ?? version?.countryCode ?? message(locale, ui.remainingStatus.countryUnavailable),
    constitutionKey: version?.constitutionId ?? fallback.constitutionKey ?? versionId ?? 'unavailable',
    constitution: constitution?.title ?? (version ? metadata.titles.get(version.constitutionId)?.title : undefined) ?? fallback.constitution ?? message(locale, ui.remainingStatus.constitutionUnavailable),
    version: fallback.version ?? version?.versionLabel ?? message(locale, ui.remainingStatus.versionUnavailable),
    jurisdiction: region?.jurisdiction.kind !== 'country' ? region?.jurisdiction.name : undefined,
    regional: Boolean(!version?.countryCode && version?.jurisdictionId && region?.jurisdiction.kind !== 'country'),
    historical: Boolean(region?.jurisdiction.historical || constitution?.lifecycleStatus === 'repealed'),
    publicHref: versionId ? versionReaderHref(version, versionId) : undefined,
  };
}
export async function loadEditorInbox({ userId, roles, queue, archived, locale }: { userId: string; roles: string[]; queue: InboxQueue; archived: boolean; locale: Locale }) {
  const authorization = await requireSessionBearer();
  const available = inboxQueues(roles);
  const loaded = await Promise.all(available.map(async q => [q, await loadQueue(q, userId, authorization, q === 'mine' && archived)] as const));
  const data = loaded.find(([q]) => q === queue)?.[1] ?? { sessions: [], imports: [], sessionsUnavailable: true, importsUnavailable: true };
  const counts = Object.fromEntries(loaded.map(([q, value]) => [q, value.sessionsUnavailable || value.importsUnavailable || (q === 'mine' && archived) ? null : value.sessions.length + value.imports.length]));
  const metadata = await loadMetadata(data, authorization);
  const rows: InboxRow[] = [
    ...data.sessions.map(session => ({
      id: session.id, kind: session.hopKind === 'legal' ? 'legal' as const : 'correction' as const,
      status: session.status, owned: session.openedBy === userId, updatedAt: session.updatedAt || null, changedArticleCount: session.changedArticleCount,
      workspaceHref: `/editor?sessionId=${encodeURIComponent(session.id)}&versionId=${encodeURIComponent(session.versionId)}`,
      ...rowContext(session.versionId, {}, metadata, locale),
    })),
    ...data.imports.map(job => ({
      id: job.id, kind: 'import' as const, status: job.status, owned: job.submittedBy === userId, updatedAt: null,
      workspaceHref: `/editor?importJobId=${encodeURIComponent(job.id)}`,
      ...rowContext(job.versionId, { countryKey: job.isoCode ?? undefined, country: job.countryName ?? job.isoCode ?? undefined, constitutionKey: job.versionId ? undefined : `import:${job.constitutionTitle ?? job.id}`, constitution: job.constitutionTitle ?? undefined, version: job.versionLabel ?? undefined }, metadata, locale),
    })),
  ];
  rows.sort((a, b) => a.country.localeCompare(b.country, locale) || a.constitution.localeCompare(b.constitution, locale) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id));
  return { rows, counts, sessionsUnavailable: data.sessionsUnavailable, importsUnavailable: data.importsUnavailable };
}
