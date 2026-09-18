import type { Amendment, ConstitutionSummary, CountryDetail, VersionSummary } from './api';
import { orderVersions } from './compare';

export function publicVersions(versions: VersionSummary[]): VersionSummary[] {
  const visible = versions.filter(
    (version) => version.listing !== 'staff' && version.hopKind !== 'editorial_correction',
  );
  const byLegalIdentity = new Map<string, VersionSummary>();
  for (const version of visible) {
    const identity = version.legalVersionId ?? version.id;
    const current = byLegalIdentity.get(identity);
    if (!current || version.id === version.currentVersionId || version.latestPublished) {
      byLegalIdentity.set(identity, version);
    }
  }
  return [...byLegalIdentity.values()];
}

export function chainTipId(constitution: ConstitutionSummary): string | undefined {
  if (constitution.latestVersionId) {
    return constitution.latestVersionId;
  }
  const latest = latestVersion(publicVersions(constitution.versions));
  return latest?.currentVersionId ?? latest?.id;
}

export function snapshotVersionId(version: VersionSummary): string {
  return version.currentVersionId ?? version.id;
}

export function latestVersion(versions: VersionSummary[]): VersionSummary | undefined {
  const ordered = orderVersions(versions);
  return ordered.find((version) => version.latestPublished) ?? ordered[ordered.length - 1];
}

export function previousVersion(versions: VersionSummary[]): VersionSummary | undefined {
  const ordered = orderVersions(versions);
  return ordered.length >= 2 ? ordered[ordered.length - 2] : undefined;
}

export type RecentChange = {
  countryName: string;
  isoCode: string;
  versionId: string;
  versionLabel: string;
  articleNumber: string | null;
  changeType: string;
  date: string | null;
};

export function recentChangesFromAmendments(
  country: CountryDetail,
  constitution: ConstitutionSummary,
  amendments: Amendment[],
): RecentChange[] {
  const versionsById = new Map(constitution.versions.map((version) => [version.id, version]));
  const rows: RecentChange[] = [];
  for (const amendment of amendments) {
    const target = amendment.targetVersionId
      ? versionsById.get(amendment.targetVersionId)
      : undefined;
    for (const change of amendment.changes) {
      rows.push({
        countryName: country.name,
        isoCode: country.isoCode,
        versionId: target?.id ?? amendment.targetVersionId ?? '',
        versionLabel: target?.versionLabel ?? '',
        articleNumber: change.articleNumber,
        changeType: change.changeType,
        date: change.changedOn ?? amendment.enactedOn,
      });
    }
  }
  return rows;
}

export function newestChanges(rows: RecentChange[], limit: number): RecentChange[] {
  return [...rows]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, limit);
}
