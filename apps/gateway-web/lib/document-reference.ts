/** A host-owned citation always points at an immutable document snapshot. */
export type DocumentReference = { documentId: string; revision: number; citationNote?: string };
export function readDocumentReferences(value: unknown): DocumentReference[] {
  const refs: unknown = typeof value === 'string' ? JSON.parse(value || '[]') : value;
  if (!Array.isArray(refs) || refs.length > 100) throw new TypeError('document references');
  const result = refs.map((ref: DocumentReference) => {
    if (!ref || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.documentId) || !Number.isSafeInteger(ref.revision) || ref.revision < 1 || (ref.citationNote !== undefined && (typeof ref.citationNote !== 'string' || ref.citationNote.length > 4000))) throw new TypeError('document reference');
    return { documentId: ref.documentId, revision: ref.revision, ...(ref.citationNote?.trim() ? { citationNote: ref.citationNote.trim() } : {}) };
  });
  if (new Set(result.map(ref => ref.documentId)).size !== result.length) throw new TypeError('duplicate document');
  return result;
}
