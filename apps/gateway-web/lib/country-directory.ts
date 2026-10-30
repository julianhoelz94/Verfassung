import { getCountry, type ConstitutionSummary, type CountryDetail } from './api';
import { getJurisdiction, type Jurisdiction, type JurisdictionDetail } from './migration-api';
import { latestVersion, publicVersions, snapshotVersionId } from './reading';

export type ConstitutionOwner = { name: string; href: string; countryCode?: string; jurisdictionId?: string };
export type RegionalCollection = { detail: JurisdictionDetail; ancestors: Jurisdiction[] };

export function countryOwner(country: Pick<CountryDetail, 'isoCode' | 'name'>): ConstitutionOwner {
  return { name: country.name, href: `/countries/${encodeURIComponent(country.isoCode)}`, countryCode: country.isoCode };
}

export function jurisdictionOwner(jurisdiction: Jurisdiction): ConstitutionOwner {
  return { name: jurisdiction.name, href: `/jurisdictions/${encodeURIComponent(jurisdiction.id)}`, jurisdictionId: jurisdiction.id };
}

export function jurisdictionHref(jurisdiction: Jurisdiction): string {
  return jurisdiction.kind === 'country' && jurisdiction.code && /^[A-Z]{2}$/.test(jurisdiction.code) && !jurisdiction.historical
    ? `/countries/${encodeURIComponent(jurisdiction.code)}`
    : jurisdictionOwner(jurisdiction).href;
}

export function constitutionHref(owner: ConstitutionOwner, constitutionId: string): string {
  return `${owner.href}/constitutions/${encodeURIComponent(constitutionId)}`;
}

export async function loadConstitutionCollection(params: { code?: string; id?: string }): Promise<{ collection: CountryDetail; owner: ConstitutionOwner; ancestors: Jurisdiction[] } | null> {
  if (params.id) {
    const detail = await getJurisdiction(params.id);
    return detail?.jurisdiction.id === params.id ? { collection: { id: detail.jurisdiction.id, isoCode: detail.jurisdiction.id, name: detail.jurisdiction.name, constitutions: detail.constitutions }, owner: jurisdictionOwner(detail.jurisdiction), ancestors: detail.ancestors } : null;
  }
  if (!params.code) return null;
  const country = await getCountry(params.code);
  return country ? { collection: country, owner: countryOwner(country), ancestors: [] } : null;
}

export function constitutionReading(constitution: ConstitutionSummary) {
  const versions = publicVersions(constitution.versions);
  const latest = latestVersion(versions);
  return { versions, latest, latestSnapshotId: latest ? snapshotVersionId(latest) : undefined };
}

/** An unknown, suspended or future constitution must not be classified as repealed. */
export function groupConstitutions(constitutions: ConstitutionSummary[]) {
  const visible = constitutions.filter(item => publicVersions(item.versions).length > 0);
  return {
    current: visible.filter(item => item.lifecycleStatus !== 'repealed'),
    historical: visible.filter(item => item.lifecycleStatus === 'repealed'),
  };
}

/** Existing public Catalog reads only: each jurisdiction is fetched once, in bounded batches. */
export async function loadRegionalCollections(countryId: string): Promise<{ regions: RegionalCollection[]; unavailable: boolean }> {
  const regions: RegionalCollection[] = [];
  const visited = new Set([countryId]);
  const root = await getJurisdiction(countryId).catch(() => null);
  if (!root || root.jurisdiction.id !== countryId) return { regions, unavailable: true };
  let pending = root.children.map(jurisdiction => ({ jurisdiction, ancestors: [root.jurisdiction] }));
  let unavailable = false;
  while (pending.length) {
    const batch = pending.splice(0, 6).filter(({ jurisdiction }) => {
      if (visited.has(jurisdiction.id)) return false;
      visited.add(jurisdiction.id);
      return true;
    });
    const loaded = await Promise.all(batch.map(async ({ jurisdiction, ancestors }) => {
      const detail = await getJurisdiction(jurisdiction.id).catch(() => null);
      if (!detail || detail.jurisdiction.id !== jurisdiction.id || detail.jurisdiction.parentId !== ancestors[ancestors.length - 1].id) {
        unavailable = true;
        return;
      }
      regions.push({ detail, ancestors });
      return detail.children.map(child => ({ jurisdiction: child, ancestors: [...ancestors, detail.jurisdiction] }));
    }));
    pending = [...pending, ...loaded.flatMap(children => children ?? [])];
  }
  regions.sort((a, b) => [...a.ancestors.slice(1), a.detail.jurisdiction].map(item => item.name).join(' / ').localeCompare([...b.ancestors.slice(1), b.detail.jurisdiction].map(item => item.name).join(' / ')));
  return { regions, unavailable };
}
