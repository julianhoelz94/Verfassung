import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { canManageDocuments, canReadDocuments } from '../../lib/nav';
import { getDocument, listDocumentFolders, listDocumentTags, listLibraryDocuments, type DocumentLibraryPage, type DocumentRecord, type DocumentFolder, type DocumentTag, type LibraryDocumentQuery } from '../../lib/document-api';
import { loginHref, safeReturnTo } from '../../lib/return-to';
import { DocumentLibrary } from './DocumentLibrary';

type Search = { q?: string; folderId?: string; tagId?: string; status?: string; offset?: string; sort?: string; documentId?: string; new?: string; returnTo?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect(loginHref('/documents', params));
  if (!canReadDocuments(user.roles)) redirect('/');
  const authorization = await requireSessionBearer();
  const status = ['active', 'archived', 'all'].includes(params.status ?? '') ? params.status as LibraryDocumentQuery['status'] : 'active';
  const sort = ['title', 'key', 'year', 'created'].includes(params.sort ?? '') ? params.sort as LibraryDocumentQuery['sort'] : 'created';
  const offsetValue = Number(params.offset ?? 0);
  const query: LibraryDocumentQuery = {
    q: params.q?.slice(0, 500), folderId: params.folderId, tagId: params.tagId, status, sort,
    offset: Number.isInteger(offsetValue) && offsetValue >= 0 ? offsetValue : 0, limit: 30,
  };
  let page: DocumentLibraryPage = { items: [], total: 0, offset: query.offset ?? 0, limit: 30 };
  let folders: DocumentFolder[] = [], tags: DocumentTag[] = [], document: DocumentRecord | null = null;
  let failed = false;
  const results = await Promise.allSettled([
    listLibraryDocuments(query, authorization), listDocumentFolders(authorization), listDocumentTags(authorization),
    params.documentId ? getDocument(params.documentId, undefined, authorization) : Promise.resolve(null),
  ]);
  if (results[0].status === 'fulfilled') page = results[0].value; else failed = true;
  if (results[1].status === 'fulfilled') folders = results[1].value; else failed = true;
  if (results[2].status === 'fulfilled') tags = results[2].value; else failed = true;
  if (results[3].status === 'fulfilled') document = results[3].value; else failed = true;
  const returnTo = params.returnTo ? safeReturnTo(params.returnTo, '/documents') : undefined;
  return <DocumentLibrary initialPage={page} initialFolders={folders} initialTags={tags} initialQuery={query}
    initialDocument={document} initialNew={params.new === '1'} writable={canManageDocuments(user.roles)} initialError={failed} returnTo={returnTo} />;
}
