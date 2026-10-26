import { EditorApiError, type ChangeRecordChange } from './editor-api';

/** Preserve every submitted row or reject the save; never silently drop legal changes. */
export function readPublishChanges(raw: string): ChangeRecordChange[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new EditorApiError('invalid'); }
  if (!Array.isArray(parsed)) throw new EditorApiError('invalid');
  return parsed.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.articleId !== 'string' || !row.articleId || typeof row.articleNumber !== 'string') {
      throw new EditorApiError('invalid');
    }
    const before = typeof row.beforeRef?.logicalId === 'string' && Boolean(row.beforeRef.logicalId);
    const after = typeof row.afterRef?.logicalId === 'string' && Boolean(row.afterRef.logicalId);
    const pending = typeof row.pendingAfterLogicalId === 'string' && Boolean(row.pendingAfterLogicalId);
    const valid = row.changeType === 'added' ? !row.beforeRef && (after || pending)
      : row.changeType === 'removed' ? before && !row.afterRef && !row.pendingAfterLogicalId
        : row.changeType === 'changed' && before && (after || pending);
    if (!valid) throw new EditorApiError('invalid');
    return {
      ...row,
      afterRef: row.afterRef?.versionId ? row.afterRef : null,
      pendingAfterLogicalId: row.afterRef?.versionId ? null : row.afterRef?.logicalId ?? row.pendingAfterLogicalId ?? null,
    } as ChangeRecordChange;
  });
}
