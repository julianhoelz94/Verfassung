import type { Amendment, ArticleSummary, ConstitutionSummary, VersionSummary } from './api';
import { ui, type UiMessage } from './messages';

import { orderedText } from './ordered-content';

export type CompareKind = 'added' | 'removed' | 'changed' | 'same';

export const COMPARE_KIND_LABEL: Record<CompareKind, UiMessage> = {
  added: ui.remainingStatus.added,
  removed: ui.remainingStatus.removed,
  changed: ui.remainingStatus.changed,
  same: ui.readerDynamic.unchanged,
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
  const positions = new Map(ordered.map((version, index) => [version.id, index]));
  const positionOf = (id: string | null | undefined): number => id == null ? -1 : (positions.get(id) ?? -1);
  const fromIndex = positionOf(fromId);
  const toIndex = positionOf(toId);
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
      const sourceIndex = positionOf(amendment.sourceVersionId);
      const targetIndex = positionOf(amendment.targetVersionId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return false;
      }
      return sourceIndex < targetIndex && fromIndex <= sourceIndex && targetIndex <= toIndex;
    })
    .sort((left, right) => {
      const leftSource = positionOf(left.sourceVersionId);
      const rightSource = positionOf(right.sourceVersionId);
      if (leftSource !== rightSource) {
        return leftSource - rightSource;
      }
      const leftTarget = positionOf(left.targetVersionId);
      const rightTarget = positionOf(right.targetVersionId);
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
  locale: import('./locale').Locale = 'en',
): string | null {
  if (!fromId || !toId) {
    return ui.remainingStatus.compareChooseTwo[locale];
  }
  if (fromId === toId) {
    return ui.remainingStatus.compareDifferentVersions[locale];
  }
  const fromConstitution = constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === fromId),
  );
  const toConstitution = constitutions.find((constitution) =>
    constitution.versions.some((version) => version.id === toId),
  );
  if (!fromConstitution || !toConstitution) {
    return ui.remainingStatus.compareNoForwardPath[locale];
  }
  if (fromConstitution.id !== toConstitution.id) {
    return ui.remainingStatus.compareSameConstitution[locale];
  }
  const publicLine = fromConstitution.versions.filter(
    (version) => version.listing !== 'staff' && version.hopKind !== 'editorial_correction',
  );
  if (!versionPath(publicLine, fromId, toId)) {
    return ui.remainingStatus.compareNoForwardPath[locale];
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
  if (left?.logicalId && left.logicalId === right?.logicalId && left.revisionId && left.revisionId === right.revisionId) return 'same';
  if (left?.logicalId && left.logicalId === right?.logicalId && left.revisionId && right.revisionId && left.revisionId !== right.revisionId) return 'changed';
  if ((left?.content ? orderedText(left.content) : left?.body ?? '') !== (right?.content ? orderedText(right.content) : right?.body ?? '') || left?.title !== right?.title) {
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

/** Pair stable logical units; labels remain display text and need not be unique. */
export function alignArticles(left: ArticleSummary[], right: ArticleSummary[]) {
  const unmatched = new Set(left);
  const identities = new Map<ArticleSummary, ArticleSummary>();
  for (const target of right) {
    const source = left.find((candidate) => unmatched.has(candidate) && (
      target.logicalId ? target.logicalId === (candidate.logicalId ?? candidate.id) : candidate.logicalId ? candidate.logicalId === target.id : candidate.articleNumber === target.articleNumber
    ));
    if (source) { identities.set(target, source); unmatched.delete(source); }
  }
  const pairs = right.map((target) => {
    const source = identities.get(target) ?? left.find((candidate) => unmatched.has(candidate) && target.legacyIdentity && candidate.legacyIdentity && candidate.articleNumber === target.articleNumber);
    if (source) unmatched.delete(source);
    return { key: target.logicalId ?? target.id, left: source, right: target as ArticleSummary | undefined };
  });
  for (const source of unmatched) pairs.push({ key: source.logicalId ?? source.id, left: source, right: undefined });
  return pairs;
}
