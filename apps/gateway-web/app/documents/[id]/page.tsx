import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { getDocument } from '../../../lib/document-api';
import { Disclosure } from '../../components/Disclosure';
import { reviewUi } from '../../../lib/ui-review-messages';

export default async function PublicDocumentPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string }> }) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const revisionNumber = query.revision ? Number(query.revision) : undefined;
  if (revisionNumber !== undefined && (!Number.isInteger(revisionNumber) || revisionNumber < 1)) notFound();
  const document = await getDocument(id, revisionNumber).catch(() => notFound());
  return <PageMain>
    <PageHeader title={document.revision.title} meta={query.revision ? <><T value={reviewUi.documentRevision} /> {document.revision.revision}</> : undefined}
      actions={document.revision.fileName ? <a className="btn btn-primary" href={`/api/document/documents/${id}/revisions/${document.revision.revision}/file`}><T value={ui.documents.id.page.download} /> {document.revision.fileName}</a> : null} />
    {document.revision.description ? <p>{document.revision.description}</p> : null}
    {document.revision.sourceUrl ? <p><a href={document.revision.sourceUrl} rel="noreferrer"><T value={ui.documents.id.page.originalSource} /></a></p> : null}
    <Disclosure summary={<T value={reviewUi.documentDetails} />}><p><T value={reviewUi.documentRevision} /> {document.revision.revision}</p></Disclosure>
  </PageMain>;
}
