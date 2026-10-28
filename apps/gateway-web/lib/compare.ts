import type { Amendment, ArticleSummary, ConstitutionSummary, OrderedEntry, VersionSummary } from './api';
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

/** Compare authored structure, excluding storage identity and revision provenance. */
function comparableEntries(entries: OrderedEntry[]): unknown[] {
  return entries.map((entry) => entry.type === 'child' && entry.node ? {
    type: 'child',
    kind: entry.node.kind,
    label: entry.node.label ?? '',
    title: entry.node.title ?? '',
    content: comparableEntries(entry.node.content),
  } : {
    type: entry.type,
    text: entry.text ?? entry.table?.rows.map((row) => row.cells.map((cell) => cell.text).join(' ')).join('\n') ?? '',
    format: entry.format ?? 'plain',
    marks: [...(entry.marks ?? [])].sort((left, right) => left.start - right.start || left.end - right.end || left.type.localeCompare(right.type)),
    table: entry.table ? {
      caption: entry.table.caption ?? '',
      rows: entry.table.rows.map((row) => row.cells.map((cell) => ({
        text: cell.text,
        header: cell.header ?? false,
        rowSpan: cell.rowSpan ?? 1,
        colSpan: cell.colSpan ?? 1,
        // Target identities carry meaning even though a cell's own ID does not.
        headers: cell.headers ?? [],
      }))),
    } : null,
    footnoteLabel: entry.footnoteLabel ?? null,
    annotation: entry.annotation ? {
      kind: entry.annotation.kind,
      attribution: entry.annotation.attribution ?? null,
      sourceUrl: entry.annotation.sourceUrl ?? null,
      anchorLogicalIds: [...(entry.annotation.anchorLogicalIds ?? [])].sort(),
    } : null,
    references: [...(entry.references ?? [])].sort((left, right) => left.start - right.start || left.end - right.end).map((reference) => ({
      start: reference.start,
      end: reference.end,
      target: {
        type: reference.target.type,
        logicalId: reference.target.logicalId ?? null,
        url: reference.target.url ?? null,
        footnoteId: reference.target.footnoteId ?? null,
      },
    })),
  });
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
  if ((left?.kind ?? 'article') !== (right?.kind ?? 'article') || left?.articleNumber !== right?.articleNumber || left?.title !== right?.title) {
    return 'changed';
  }
  if (left?.content != null && right?.content != null) {
    // Complete endpoint snapshots determine the net difference, even after a
    // recorded amendment was reverted or an unchanged unit was republished.
    return JSON.stringify(comparableEntries(left.content)) === JSON.stringify(comparableEntries(right.content)) ? 'same' : 'changed';
  }
  if (left?.logicalId && left.logicalId === right?.logicalId && left.revisionId && left.revisionId === right.revisionId) return 'same';
  if ((left?.content ? orderedText(left.content) : left?.body ?? '') !== (right?.content ? orderedText(right.content) : right?.body ?? '')) {
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
