import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { canManageDocuments, canReadDocuments } from '../../../lib/nav';
import { hasTrustedOrigin } from '../../../lib/request-origin';
import {
  DocumentApiError, addDocumentAttachment, archiveDocument, changeDocumentAttachment,
  changeDocumentTag, createDocument, deleteDocumentFolder, documentKeyAvailability,
  getDocument, importDocumentBibtex, listDocumentEvents, listDocumentFolders,
  listDocumentRevisions, listDocumentTags, listDocumentUsage, listLibraryDocuments,
  previewDocumentBibtex, readDocumentDownload, resolveDocumentKey, reviseDocument,
  saveDocumentFolder, saveDocumentTag,
  type BibtexImportRequest, type DocumentBibliography, type LibraryDocumentQuery, type SaveDocumentMetadata,
} from '../../../lib/document-api';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const readable = (value: unknown): string => typeof value === 'string' ? value : '';
const identifier = (value: unknown): string => {
  const id = readable(value);
  if (!id || id.length > 128) throw new TypeError('identifier');
  return id;
};
const revision = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError('revision');
  return number;
};

function failure(error: unknown): NextResponse {
  if (error instanceof DocumentApiError) return NextResponse.json({ error: error.status === 409 ? 'conflict' : 'document' }, { status: error.status, headers: privateHeaders });
  if (error instanceof TypeError && error.message === 'size') return NextResponse.json({ error: 'size' }, { status: 400, headers: privateHeaders });
  if (error instanceof TypeError || error instanceof SyntaxError) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: privateHeaders });
  return NextResponse.json({ error: 'document' }, { status: 502, headers: privateHeaders });
}

function libraryQuery(params: URLSearchParams): LibraryDocumentQuery {
  const status = params.get('status') ?? 'active', sort = params.get('sort') ?? 'created';
  if (!['active', 'archived', 'all'].includes(status) || !['title', 'key', 'year', 'created'].includes(sort)) throw new TypeError('query');
  const offset = Number(params.get('offset') ?? 0), limit = Number(params.get('limit') ?? 30);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('page');
  return { q: params.get('q') ?? undefined, folderId: params.get('folderId') ?? undefined, tagId: params.get('tagId') ?? undefined, status, sort, offset, limit } as LibraryDocumentQuery;
}

async function download(action: string, params: URLSearchParams, authorization: string): Promise<Response> {
  const response = await readDocumentDownload(action === 'file' ? {
    documentId: identifier(params.get('documentId')), revision: revision(params.get('revision')), attachmentId: params.get('attachmentId') ? identifier(params.get('attachmentId')) : undefined,
  } : { folderId: params.get('folderId') ?? undefined, documentIds: params.get('documentIds') ?? undefined, includeFiles: params.get('includeFiles') === 'true' }, authorization);
  if (!response.ok) return NextResponse.json({ error: 'document' }, { status: response.status, headers: privateHeaders });
  const headers = new Headers(privateHeaders);
  headers.set('Content-Type', response.headers.get('content-type') ?? 'application/octet-stream');
  headers.set('Content-Disposition', response.headers.get('content-disposition') ?? 'attachment');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { headers });
}

async function readAction(params: URLSearchParams, authorization: string): Promise<unknown> {
  switch (params.get('action')) {
    case 'list': return listLibraryDocuments(libraryQuery(params), authorization);
    case 'document': return getDocument(identifier(params.get('documentId')), params.has('revision') ? revision(params.get('revision')) : undefined, authorization);
    case 'organization': {
      const [folders, tags] = await Promise.all([listDocumentFolders(authorization), listDocumentTags(authorization)]);
      return { folders, tags };
    }
    case 'history': {
      const id = identifier(params.get('documentId'));
      const [revisions, events] = await Promise.all([listDocumentRevisions(id, authorization), listDocumentEvents(id, authorization)]);
      return { revisions, events };
    }
    case 'usage': return listDocumentUsage(identifier(params.get('documentId')), authorization);
    case 'key-availability': return documentKeyAvailability(readable(params.get('key')), params.get('documentId') ?? undefined, authorization);
    case 'key': return resolveDocumentKey(identifier(params.get('key')), authorization);
    default: throw new TypeError('action');
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'session' }, { status: 401, headers: privateHeaders });
  if (!canReadDocuments(user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: privateHeaders });
  try {
    const authorization = await requireSessionBearer();
    const params = request.nextUrl.searchParams;
    const action = params.get('action');
    if (action === 'export' || action === 'file') return await download(action, params, authorization);
    return NextResponse.json(await readAction(params, authorization), { headers: privateHeaders });
  } catch (error) { return failure(error); }
}

function metadata(body: Record<string, unknown>): SaveDocumentMetadata {
  return {
    title: readable(body.title), description: readable(body.description), sourceUrl: readable(body.sourceUrl),
    ...(body.citationKey !== undefined ? { citationKey: readable(body.citationKey) } : {}),
    ...(body.bibliography && typeof body.bibliography === 'object' ? { bibliography: body.bibliography as DocumentBibliography } : {}),
  };
}

async function mutationBody(request: NextRequest): Promise<{ body: Record<string, unknown>; file: File | null }> {
  let body: Record<string, unknown>, file: File | null = null;
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData(); body = Object.fromEntries(form);
    const upload = form.get('file'); file = upload instanceof File ? upload : null;
  } else body = await request.json() as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('body');
  return { body, file };
}

async function mutate(command: string, body: Record<string, unknown>, file: File | null, authorization: string): Promise<unknown> {
  switch (command) {
    case 'create': return { document: await createDocument(metadata(body), authorization) };
    case 'revise': return { document: await reviseDocument(identifier(body.documentId), { ...metadata(body), expectedRevision: revision(body.expectedRevision) }, authorization) };
    case 'archive': return { document: await archiveDocument(identifier(body.documentId), authorization) };
    case 'folder-create': case 'folder-rename': return { folder: await saveDocumentFolder(readable(body.name), authorization, command === 'folder-rename' ? identifier(body.folderId) : undefined) };
    case 'folder-delete': await deleteDocumentFolder(identifier(body.folderId), authorization); return { deleted: true };
    case 'tag-create': case 'tag-rename': return { tag: await saveDocumentTag(readable(body.name), authorization, command === 'tag-rename' ? identifier(body.tagId) : undefined) };
    case 'tag-add': case 'tag-remove': return { document: await changeDocumentTag(identifier(body.documentId), identifier(body.tagId), command === 'tag-add', authorization) };
    case 'attachment-add': {
      if (!file || file.size < 1 || file.size > 20 * 1024 * 1024) throw new TypeError('size');
      return { document: await addDocumentAttachment(identifier(body.documentId), revision(body.expectedRevision), file, authorization) };
    }
    case 'attachment-primary': case 'attachment-remove': return { document: await changeDocumentAttachment(identifier(body.documentId), identifier(body.attachmentId), revision(body.expectedRevision), command === 'attachment-primary', authorization) };
    case 'bibtex-preview': return previewDocumentBibtex(readable(body.content), body.folderId ? identifier(body.folderId) : undefined, authorization);
    case 'bibtex-import': {
      if (!Array.isArray(body.decisions)) throw new TypeError('decisions');
      return importDocumentBibtex({ operationId: identifier(body.operationId), content: readable(body.content), folderId: body.folderId ? identifier(body.folderId) : undefined, decisions: body.decisions } as BibtexImportRequest, authorization);
    }
    default: throw new TypeError('command');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'session' }, { status: 401 });
  if (!canManageDocuments(user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > 21 * 1024 * 1024) return NextResponse.json({ error: 'size' }, { status: 413 });
  try {
    const authorization = await requireSessionBearer();
    const { body, file } = await mutationBody(request);
    const command = readable(body.command);
    const value = await mutate(command, body, file, authorization);
    if (command !== 'bibtex-preview') revalidatePath('/documents');
    return NextResponse.json(value, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
