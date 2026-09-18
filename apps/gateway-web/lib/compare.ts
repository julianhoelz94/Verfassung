import type { Amendment, ArticleSummary, ConstitutionSummary, VersionSummary } from './api';

export type CompareKind = 'added' | 'removed' | 'changed' | 'same';

export const COMPARE_KIND_LABEL: Record<CompareKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  same: 'Unchanged',
};

export function orderVersions(versions: VersionSummary[]): VersionSummary[] {
  return [...versions].sort((a, b) => {
    const dateCmp = (a.effectiveDate ?? '').localeCompare(b.effectiveDate ?? '');
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return a.versionLabel.localeCompare(b.versionLabel, undefined, { numeric: true });
  });
}

export function amendmentsBetween(
  amendments: Amendment[],
  fromId: string,
  toId: string,
  versions: VersionSummary[],
): Amendment[] {
  const ordered = orderVersions(versions);
  const fromIndex = ordered.findIndex((version) => version.id === fromId);
  const toIndex = ordered.findIndex((version) => version.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) {
    return [];
  }
  return amendments
    .filter((amendment) => {
      if (!amendment.sourceVersionId || !amendment.targetVersionId) {
        return false;
      }
      if (amendment.status && amendment.status !== 'published') {
        return false;
      }
      const sourceIndex = ordered.findIndex((version) => version.id === amendment.sourceVersionId);
      const targetIndex = ordered.findIndex((version) => version.id === amendment.targetVersionId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return false;
      }
      return sourceIndex < targetIndex && fromIndex <= sourceIndex && targetIndex <= toIndex;
    })
    .sort((left, right) => {
      const leftSource = ordered.findIndex((version) => version.id === left.sourceVersionId);
      const rightSource = ordered.findIndex((version) => version.id === right.sourceVersionId);
      if (leftSource !== rightSource) {
        return leftSource - rightSource;
      }
      const leftTarget = ordered.findIndex((version) => version.id === left.targetVersionId);
      const rightTarget = ordered.findIndex((version) => version.id === right.targetVersionId);
      return leftTarget - rightTarget;
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

export function compareRequestError(
  constitutions: ConstitutionSummary[],
  fromId: string | undefined,
  toId: string | undefined,
): string | null {
  if (!fromId || !toId) {
    return 'Choose two versions to compare.';
  }
  if (fromId === toId) {
    return 'Choose two different versions along the published line.';
  }
  const fromConstitution = constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === fromId),
  );
  const toConstitution = constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === toId),
  );
  if (!fromConstitution || !toConstitution) {
    return 'Those versions are not a forward path on this constitution’s published line.';
  }
  if (fromConstitution.id !== toConstitution.id) {
    return 'Choose two versions of the same constitution.';
  }
  const publicLine = fromConstitution.versions.filter(
    (version) => version.listing !== 'staff' && version.hopKind !== 'editorial_correction',
  );
  if (!versionPath(publicLine, fromId, toId)) {
    return 'Those versions are not a forward path on this constitution’s published line.';
  }
  return null;
}

export function neighborCompareLinks(
  code: string,
  versions: VersionSummary[],
  currentId: string,
): { previous: { href: string; label: string } | null; next: { href: string; label: string } | null } {
  const line = orderVersions(versions);
  const index = line.findIndex((version) => version.id === currentId);
  if (index < 0) {
    return { previous: null, next: null };
  }
  const previous = line[index - 1];
  const next = line[index + 1];
  return {
    previous: previous
      ? {
          href: `/countries/${code}/compare?from=${encodeURIComponent(previous.id)}&to=${encodeURIComponent(currentId)}`,
          label: `Compare previous ${previous.versionLabel} → ${line[index].versionLabel}`,
        }
      : null,
    next: next
      ? {
          href: `/countries/${code}/compare?from=${encodeURIComponent(currentId)}&to=${encodeURIComponent(next.id)}`,
          label: `Compare ${line[index].versionLabel} → next ${next.versionLabel}`,
        }
      : null,
  };
}

export function netArticleKind(
  left: ArticleSummary | undefined,
  right: ArticleSummary | undefined,
  recordedTypes: string[],
): CompareKind {
  if (!left && right) {
    return 'added';
  }
  if (left && !right) {
    return 'removed';
  }
  if (!left && !right) {
    return 'same';
  }
  if ((left?.body ?? '') !== (right?.body ?? '')) {
    return 'changed';
  }
  if (recordedTypes.some((type) => type === 'added' || type === 'changed' || type === 'removed')) {
    return 'changed';
  }
  return 'same';
}

export function compareRowId(articleNumber: string): string {
  return `compare-article-${articleNumber}`;
}

export function compareArticleNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function canonicalCompareQuery(
  fromId: string | undefined,
  toId: string | undefined,
  versions: VersionSummary[],
): { from: string; to: string } | null {
  if (!fromId || !toId || fromId === toId) {
    return null;
  }
  const ordered = orderVersions(versions);
  const fromIndex = ordered.findIndex((version) => version.id === fromId);
  const toIndex = ordered.findIndex((version) => version.id === toId);
  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }
  const earlierIndex = Math.min(fromIndex, toIndex);
  const laterIndex = Math.max(fromIndex, toIndex);
  return {
    from: ordered[earlierIndex].id,
    to: ordered[laterIndex].id,
  };
}
