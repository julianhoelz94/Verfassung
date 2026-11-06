import { NextRequest, NextResponse } from 'next/server';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import { attachDocument, createLinkedDocument, detachDocument, listDocumentLinks, listDocumentRevisions, listLibraryDocuments, type DocumentBibliography } from '../../../../lib/document-api';
import { canManageDocuments, canReadDocuments } from '../../../../lib/nav';
import { hasTrustedOrigin } from '../../../../lib/request-origin';
import { revalidatePath } from 'next/cache';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser();
  if (!user || !canReadDocuments(user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const command = request.nextUrl.searchParams.get('command');
  const headers = { 'Cache-Control': 'private, no-store' };
  if (command === 'search') {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
    if (q.length > 500 || !Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: 'search' }, { status: 400 });
    const folderId = request.nextUrl.searchParams.get('folderId');
    if (folderId && folderId.length > 100) return NextResponse.json({ error: 'folder' }, { status: 400 });
    try { return NextResponse.json(await listLibraryDocuments({ q, offset, limit: 30, status: 'active', sort: 'title', ...(folderId ? { folderId } : {}) }, await requireSessionBearer()), { headers }); }
    catch { return NextResponse.json({ error: 'document' }, { status: 502 }); }
  }
  if (command === 'revisions') {
    const documentId = request.nextUrl.searchParams.get('documentId');
    if (!documentId || documentId.length > 100) return NextResponse.json({ error: 'documentId' }, { status: 400 });
    try { return NextResponse.json({ revisions: await listDocumentRevisions(documentId, await requireSessionBearer()) }, { headers }); }
    catch { return NextResponse.json({ error: 'document' }, { status: 502 }); }
  }
  if (command) return NextResponse.json({ error: 'command' }, { status: 400 });
  const targetType = request.nextUrl.searchParams.get('targetType'), targetId = request.nextUrl.searchParams.get('targetId'), scope = request.nextUrl.searchParams.get('scopeRevisionId');
  if (targetType !== 'amendment' || !targetId || !scope) return NextResponse.json({ error: 'target' }, { status: 400 });
  try { return NextResponse.json({ links: await listDocumentLinks('amendment', targetId, scope, await requireSessionBearer()) },{headers:{'Cache-Control':'private, no-store'}}); }
  catch { return NextResponse.json({ error: 'document' }, { status: 502 }); }
}

function optionalMetadata(form: FormData): { citationKey?: string; bibliography?: DocumentBibliography } {
  const citationKey = String(form.get('citationKey') ?? '').trim();
  const content = form.get('bibliography');
  const bibliography: unknown = content ? JSON.parse(String(content)) : undefined;
  if (bibliography !== undefined && (!bibliography || typeof bibliography !== 'object' || Array.isArray(bibliography))) throw new TypeError('bibliography');
  return { ...(citationKey ? { citationKey } : {}), ...(bibliography ? { bibliography: bibliography as DocumentBibliography } : {}) };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'session' }, { status: 401 });
  if (!canManageDocuments(user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > 21 * 1024 * 1024) return NextResponse.json({ error: 'size' }, { status: 413 });
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? '');
    const targetType = value('targetType');
    const targetId = value('targetId');
    const scopeRevisionId = value('scopeRevisionId') || null;
    if (!['constitution', 'version', 'amendment'].includes(targetType) || !targetId || targetId.length > 100) return NextResponse.json({ error: 'target' }, { status: 400 });
    const type = targetType as 'constitution' | 'version' | 'amendment';
    const authorization = await requireSessionBearer();
    let result;
    if (value('command') === 'create') {
      const file = form.get('file');
      if (file instanceof File && (file.size === 0 || file.size > 20 * 1024 * 1024)) return NextResponse.json({ error: 'size' }, { status: 400 });
      result = { document: await createLinkedDocument(type, targetId, {
        operationId: value('operationId'), title: value('title'), description: value('description'), sourceUrl: value('sourceUrl'), scopeRevisionId, ...optionalMetadata(form),
      }, file instanceof File ? file : null, authorization) };
    } else if (value('command') === 'attach') {
      result = { links: await attachDocument(type, targetId, value('documentId'), value('revisionId') || null, authorization, scopeRevisionId) };
    } else if (value('command') === 'detach') {
      result = { links: await detachDocument(type, targetId, value('documentId'), authorization, scopeRevisionId) };
    } else return NextResponse.json({ error: 'command' }, { status: 400 });
    revalidatePath('/documents');
    revalidatePath('/editor/documents');
    if (type === 'amendment') revalidatePath(`/editor/amendments/${targetId}`);
    if (type === 'constitution') revalidatePath(`/admin/constitutions/${targetId}`);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return NextResponse.json({ error: 'metadata' }, { status: 400 });
    return NextResponse.json({ error: 'document' }, { status: 502 });
  }
}
