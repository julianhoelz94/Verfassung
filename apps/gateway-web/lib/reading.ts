import type { Amendment, CountryDetail, VersionSummary } from './api';
import { orderVersions } from './compare';

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
  version: VersionSummary,
  amendments: Amendment[],
): RecentChange[] {
  const rows: RecentChange[] = [];
  for (const amendment of amendments) {
    for (const change of amendment.changes) {
      rows.push({
        countryName: country.name,
        isoCode: country.isoCode,
        versionId: version.id,
        versionLabel: version.versionLabel,
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
