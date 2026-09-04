import type { VersionSummary } from './api';

export function orderVersions(versions: VersionSummary[]): VersionSummary[] {
  return [...versions].sort((a, b) => {
    const dateCmp = (a.effectiveDate ?? '').localeCompare(b.effectiveDate ?? '');
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return a.versionLabel.localeCompare(b.versionLabel, undefined, { numeric: true });
  });
}

export function versionPath(
  versions: VersionSummary[],
  fromId: string,
  toId: string,
): VersionSummary[] | null {
  const ordered = orderVersions(versions);
  const fromIndex = ordered.findIndex((version) => version.id === fromId);
  const toIndex = ordered.findIndex((version) => version.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) {
    return null;
  }
  return ordered.slice(fromIndex, toIndex + 1);
}

export function compareArticleNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
