import { AmendmentApiError, type AmendmentChangeWrite, type AmendmentWriteBody } from './amendment-editor-api';

function optionalField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AmendmentApiError('invalid');
  return value as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new AmendmentApiError('invalid');
  return value.trim() || null;
}

function unitRef(value: unknown): AmendmentChangeWrite['beforeRef'] {
  if (value == null) return null;
  // Detailed unit identity and version validation belongs to amendment-service.
  return record(value);
}

function changes(value: unknown): AmendmentChangeWrite[] {
  if (!Array.isArray(value)) throw new AmendmentApiError('invalid');
  return value.map((value) => {
    const change = record(value);
    if (typeof change.changeType !== 'string') throw new AmendmentApiError('invalid');
    const afterRef = unitRef(change.afterRef);
    return {
      articleNumber: optionalText(change.articleNumber),
      changeType: change.changeType,
      note: optionalText(change.note),
      beforeRef: unitRef(change.beforeRef),
      afterRef,
      pendingAfterLogicalId: optionalText(change.pendingAfterLogicalId) ?? (afterRef?.versionId ? null : afterRef?.logicalId ?? null),
      linkReviewReason: optionalText(change.linkReviewReason),
    };
  });
}

function documents(value: unknown): AmendmentWriteBody['documents'] {
  if (!Array.isArray(value)) throw new AmendmentApiError('invalid');
  return value.map((value) => {
    const row = record(value);
    return { url: optionalText(row.url), fileId: optionalText(row.fileId), label: optionalText(row.label) };
  }).filter((row) => row.url || row.fileId || row.label);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch { throw new AmendmentApiError('invalid'); }
}

/** Restore the complete writable revision, including links to units still in a draft. */
export function readRevisionBody(raw: string): AmendmentWriteBody {
  const revision = record(parseJson(raw));
  const title = optionalText(revision.title);
  if (!title) throw new AmendmentApiError('title');
  return {
    title,
    summary: optionalText(revision.summary),
    enactedOn: optionalText(revision.enactedOn),
    effectiveOn: optionalText(revision.effectiveOn),
    sourceReference: optionalText(revision.sourceReference),
    sourceVersionId: optionalText(revision.sourceVersionId),
    targetVersionId: optionalText(revision.targetVersionId),
    comment: optionalText(revision.comment),
    documents: documents(revision.documents ?? []),
    changes: changes(revision.changes),
  };
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
    documents: documents(parseJson(String(formData.get('documentsJson') ?? '[]'))),
    enactedOn: optionalField(formData, 'enactedOn'),
    effectiveOn: optionalField(formData, 'effectiveOn'),
    sourceReference: optionalField(formData, 'sourceReference'),
    sourceVersionId: optionalField(formData, 'sourceVersionId'),
    targetVersionId: optionalField(formData, 'targetVersionId'),
    changes: changes(parseJson(String(formData.get('changesJson') ?? '[]'))),
  };
}
