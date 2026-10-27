import { listDocumentLinks, type DocumentLink } from '../../lib/document-api';
import { ui } from '../../lib/messages';
import { reviewUi } from '../../lib/ui-review-messages';
import { T } from './TranslationProvider';
import surfaceStyles from './surfaces.module.css';

export async function VersionDocuments({ constitutionId, versionId, legalVersionId }: { constitutionId: string; versionId: string; legalVersionId?: string }) {
  const links = (await Promise.all([
    listDocumentLinks('constitution', constitutionId).catch(() => []),
    ...[...new Set([versionId, legalVersionId].filter((id): id is string => Boolean(id)))].map(id => listDocumentLinks('version', id).catch(() => [])),
  ])).flat();
  const documents = new Map<string, DocumentLink>();
  for (const link of links) {
    const key = `${link.documentId}:${link.document.revision.id}`;
    if (!documents.has(key) || link.revisionId) documents.set(key, link);
  }
  if (!documents.size) return null;
  return <section className={['card', surfaceStyles.card].join(' ')}>
    <h2><T value={ui.countries.code.versions.versionid.page.constitutionDocuments} /></h2>
    <ul className="link-list">{[...documents].map(([key, link]) => <li key={key}>
      <a href={`/documents/${link.documentId}${link.revisionId ? `?revision=${link.document.revision.revision}` : ''}`}>{link.document.revision.title}</a>
      {link.revisionId ? <> · <T value={reviewUi.documentRevision} /> {link.document.revision.revision}</> : null}
    </li>)}</ul>
  </section>;
}
