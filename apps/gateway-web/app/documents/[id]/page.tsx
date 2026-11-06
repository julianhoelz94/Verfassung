import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/ui';
import { ReaderPage } from '../../components/layout/templates';
import { type DocumentBibliography, getDocument } from '../../../lib/document-api';
import { Disclosure } from '../../components/Disclosure';
import { reviewUi } from '../../../lib/ui-review-messages';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { canReadDocuments } from '../../../lib/nav';

export default async function PublicDocumentPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string }> }) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const revisionNumber = query.revision ? Number(query.revision) : undefined;
  if (revisionNumber !== undefined && (!Number.isInteger(revisionNumber) || revisionNumber < 1)) notFound();
  const user = await currentUser();
  const authorization = user && canReadDocuments(user.roles) ? await requireSessionBearer() : undefined;
  const document = await getDocument(id, revisionNumber, authorization).catch(() => notFound());
  const bibliography = document.revision.bibliography;
  const attachments = document.revision.attachments ?? [];
  const primaryFileHref = authorization ? `/documents/command?action=file&documentId=${encodeURIComponent(id)}&revision=${document.revision.revision}` : `/api/document/documents/${encodeURIComponent(id)}/revisions/${document.revision.revision}/file`;
  const attachmentHref = (attachmentId: string) => authorization ? `${primaryFileHref}&attachmentId=${encodeURIComponent(attachmentId)}` : `/api/document/documents/${encodeURIComponent(id)}/revisions/${document.revision.revision}/attachments/${encodeURIComponent(attachmentId)}/file`;
  return <ReaderPage width="reading" header={<PageHeader title={document.revision.title} meta={query.revision ? <><T value={reviewUi.documentRevision} /> {document.revision.revision}</> : undefined}
      actions={document.revision.fileName ? <a className="btn btn-primary" href={primaryFileHref}><T value={ui.documents.id.page.download} /> {document.revision.fileName}</a> : null} />}>

    {document.revision.description ? <p>{document.revision.description}</p> : null}
    {bibliography ? <Bibliography bibliography={bibliography} /> : null}
    {bibliography?.abstract ? <p>{bibliography.abstract}</p> : null}
    {document.revision.sourceUrl ? <p><a href={document.revision.sourceUrl} rel="noreferrer"><T value={ui.documents.id.page.originalSource} /></a></p> : null}
    {attachments.length > 1 ? <section aria-labelledby="document-files"><h2 id="document-files"><T value={{ en: 'Files', de: 'Dateien' }} /></h2><ul>{attachments.map(file => <li key={file.id}><a href={attachmentHref(file.id)}>{file.fileName}</a>{file.primary ? <> · <T value={{ en: 'Primary file', de: 'Hauptdatei' }} /></> : null}</li>)}</ul></section> : null}
    <Disclosure summary={<T value={reviewUi.documentDetails} />}><p><T value={reviewUi.documentRevision} /> {document.revision.revision}</p>{document.revision.citationKey ? <p><T value={{ en: 'Citation key', de: 'Zitierschlüssel' }} />: {document.revision.citationKey}</p> : null}</Disclosure>
  </ReaderPage>;
}

function Bibliography({ bibliography }: { bibliography: DocumentBibliography }) {
  const creatorName = (creator: { literal?: string | null; family?: string | null; given?: string | null }) => creator.literal || [creator.given, creator.family].filter(Boolean).join(' ');
  return <dl>
      {bibliography.authors?.length ? <><dt><T value={{ en: 'Authors', de: 'Autoren' }} /></dt><dd>{bibliography.authors.map(creatorName).join('; ')}</dd></> : null}
      {bibliography.editors?.length ? <><dt><T value={{ en: 'Editors', de: 'Herausgeber' }} /></dt><dd>{bibliography.editors.map(creatorName).join('; ')}</dd></> : null}
      {bibliography.issued ? <><dt><T value={{ en: 'Date', de: 'Datum' }} /></dt><dd>{bibliography.issued}</dd></> : null}
      {bibliography.containerTitle ? <><dt><T value={{ en: 'Publication', de: 'Publikation' }} /></dt><dd>{bibliography.containerTitle}</dd></> : null}
      {bibliography.publisher ? <><dt><T value={{ en: 'Publisher', de: 'Verlag' }} /></dt><dd>{bibliography.publisher}</dd></> : null}
      {bibliography.volume ? <><dt><T value={{ en: 'Volume', de: 'Band' }} /></dt><dd>{bibliography.volume}</dd></> : null}
      {bibliography.issue ? <><dt><T value={{ en: 'Issue', de: 'Ausgabe' }} /></dt><dd>{bibliography.issue}</dd></> : null}
      {bibliography.pages ? <><dt><T value={{ en: 'Pages', de: 'Seiten' }} /></dt><dd>{bibliography.pages}</dd></> : null}
      {bibliography.doi ? <><dt>DOI</dt><dd>{bibliography.doi}</dd></> : null}
      {bibliography.isbn ? <><dt>ISBN</dt><dd>{bibliography.isbn}</dd></> : null}
      {bibliography.language ? <><dt><T value={{ en: 'Language', de: 'Sprache' }} /></dt><dd>{bibliography.language}</dd></> : null}
    </dl>;
}
