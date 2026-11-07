import type { DocumentLink } from '../../../lib/document-api';
import { T } from '../TranslationProvider';

/** Public citations have no library browser or editing controls. */
export function DocumentReferences({ links }: { links: DocumentLink[] }) {
  if (!links.length) return null;
  return <ul className="link-list">{links.map(link => <li key={link.documentId}>
    <a href={`/documents/${link.documentId}?revision=${link.document.revision.revision}`}>{link.document.revision.title}</a>
    {' · '}<T value={{en:'Revision',de:'Revision'}} /> {link.document.revision.revision}
    {link.citationNote ? <p>{link.citationNote}</p> : null}
  </li>)}</ul>;
}
