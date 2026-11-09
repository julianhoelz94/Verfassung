import { attachDocument, getDocument, type DocumentLink, type DocumentTarget } from './document-api';
import { readDocumentReferences } from './document-reference';

/** Resolve before saving the owner. Untrusted client labels and revision UUIDs are never used. */
export async function resolveDocumentReferences(value: unknown, authorization: string): Promise<DocumentLink[]> {
  return Promise.all(readDocumentReferences(value).map(async ref => {
    const document = await getDocument(ref.documentId, ref.revision, authorization);
    return { documentId: document.id, revisionId: document.revision.id, document, citationNote: ref.citationNote };
  }));
}
export async function pinDocumentReferences(links: DocumentLink[], target: DocumentTarget, id: string, authorization: string, scope?: string | null): Promise<void> {
  for (const link of links) await attachDocument(target, id, link.documentId, link.revisionId, authorization, scope, link.citationNote ?? undefined);
}
