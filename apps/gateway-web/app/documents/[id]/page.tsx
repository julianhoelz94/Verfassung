import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/ui';
import { PageMain } from '../../components/PageMain';
import { getDocument } from '../../../lib/document-api';

export default async function PublicDocumentPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string }> }) {
  const { id } = await props.params;
  const query = await props.searchParams;
  const revisionNumber = query.revision ? Number(query.revision) : undefined;
  if (revisionNumber !== undefined && (!Number.isInteger(revisionNumber) || revisionNumber < 1)) notFound();
  const document = await getDocument(id, revisionNumber).catch(() => notFound());
  return <PageMain>
    <PageHeader title={document.revision.title} meta={`Document revision ${document.revision.revision}`} />
    {document.revision.description ? <p>{document.revision.description}</p> : null}
    {document.revision.sourceUrl ? <p><a href={document.revision.sourceUrl} rel="noreferrer">Original source</a></p> : null}
    {document.revision.fileName ? <p><a href={`/api/document/documents/${id}/revisions/${document.revision.revision}/file`}>Download {document.revision.fileName}</a></p> : null}
  </PageMain>;
}
