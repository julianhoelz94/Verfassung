import { AmendmentApiError, type AmendmentChangeWrite, type AmendmentWriteBody } from './amendment-editor-api';

function optionalField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function parseChanges(formData: FormData): AmendmentChangeWrite[] {
  const raw = String(formData.get('changesJson') ?? '[]');
  try {
    const parsed = JSON.parse(raw) as AmendmentChangeWrite[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((change) => ({
      articleNumber: change.articleNumber?.trim() || null,
      changeType: change.changeType,
      note: change.note?.trim() || null,
      beforeRef: change.beforeRef ?? null,
      afterRef: change.afterRef ?? null,
      pendingAfterLogicalId: change.pendingAfterLogicalId ?? (change.afterRef?.versionId ? null : change.afterRef?.logicalId ?? null),
      linkReviewReason: change.linkReviewReason?.trim() || null,
    }));
  } catch {
    return [];
  }
}

function parseDocuments(formData: FormData): { url?: string | null; fileId?: string | null; label?: string | null }[] {
  try {
    const rows = JSON.parse(String(formData.get('documentsJson') ?? '[]')) as { url?: string; fileId?: string; label?: string }[];
    return rows.map((row) => ({ url: row.url?.trim() || null, fileId: row.fileId?.trim() || null, label: row.label?.trim() || null })).filter((row) => row.url || row.fileId || row.label);
  } catch { return []; }
}

export function readWriteBody(formData: FormData): AmendmentWriteBody {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) {
    throw new AmendmentApiError('title');
  }
  return {
    title,
    summary: optionalField(formData, 'summary'),
    comment: optionalField(formData, 'comment'),
    documents: parseDocuments(formData),
    enactedOn: optionalField(formData, 'enactedOn'),
    effectiveOn: optionalField(formData, 'effectiveOn'),
    sourceReference: optionalField(formData, 'sourceReference'),
    sourceVersionId: optionalField(formData, 'sourceVersionId'),
    targetVersionId: optionalField(formData, 'targetVersionId'),
    changes: parseChanges(formData),
  };
}
