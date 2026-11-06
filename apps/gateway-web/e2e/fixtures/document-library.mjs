import { randomUUID } from 'node:crypto';
import { bibliographyZip } from './document-export.mjs';

export const LIBRARY_DOCUMENT = '01900000-0000-4000-8000-000000000881';
export const LIBRARY_FOLDER = '01900000-0000-4000-8000-000000000882';
export const LIBRARY_TAG = '01900000-0000-4000-8000-000000000883';
const createdAt = '2026-01-01T00:00:00Z';
const createdBy = '01900000-0000-4000-8000-000000000410';

export function documentLibraryFixture() {
  const tag = { id: LIBRARY_TAG, name: 'Germany project' };
  const tags = [tag];
  const folders = [{ id: LIBRARY_FOLDER, name: tag.name, tagId: tag.id }];
  const documents = [{ id: LIBRARY_DOCUMENT, citationKey: 'Mueller2024', currentRevision: 1, status: 'active', createdAt, tags: [tag], revision: {
    id: randomUUID(), documentId: LIBRARY_DOCUMENT, revision: 1, citationKey: 'Mueller2024', title: 'Federalism and constitutions', description: 'Source material for the project.', sourceUrl: 'https://example.org/federalism', fileName: null, contentType: null, createdAt, createdBy,
    bibliography: { type: 'book', authors: [{ family: 'Müller', given: 'Anna' }], editors: [], issued: '2024', publisher: 'Example Press', extra: {} }, attachments: [],
  } }];
  const histories = new Map([[LIBRARY_DOCUMENT, [structuredClone(documents[0].revision)]]]);
  const receipts = new Map();
  const read = async req => JSON.parse(await new Promise(resolve => { let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => resolve(body || '{}')); }));
  const response = (value, status = 200) => Response.json(value, { status });
  const error = (message, status = 400) => response({ error: message }, status);
  function save(body, current) {
    const id = current?.id ?? randomUUID();
    const revision = (current?.currentRevision ?? 0) + 1;
    const key = body.citationKey || current?.citationKey || `doc-${id}`;
    if (documents.some(document => document.id !== id && document.citationKey.toLowerCase() === key.toLowerCase())) return null;
    const next = { ...(current ?? {}), id, citationKey: key, currentRevision: revision, status: current?.status ?? 'active', createdAt, tags: current?.tags ?? [], revision: {
      ...(current?.revision ?? {}), id: randomUUID(), documentId: id, revision, citationKey: key, title: body.title, description: body.description ?? null, sourceUrl: body.sourceUrl ?? null, fileName: current?.revision.fileName ?? null, contentType: current?.revision.contentType ?? null, createdAt, createdBy,
      bibliography: body.bibliography ?? current?.revision.bibliography ?? { type: 'misc', authors: [], editors: [], extra: {} }, attachments: current?.revision.attachments ?? [],
    } };
    if (current) documents.splice(documents.indexOf(current), 1, next); else documents.push(next);
    histories.set(id, [structuredClone(next.revision), ...(histories.get(id) ?? [])]);
    return next;
  }
  function matching(params) {
    let list = documents.filter(document => params.get('status') === 'all' || document.status === (params.get('status') ?? 'active'));
    const folder = folders.find(item => item.id === params.get('folderId'));
    const tagId = params.get('tagId') || folder?.tagId;
    if (tagId) list = list.filter(document => document.tags.some(item => item.id === tagId));
    const query = params.get('q')?.toLowerCase();
    if (query) list = list.filter(document => JSON.stringify(document).toLowerCase().includes(query));
    const sort = params.get('sort');
    list.sort((a, b) => (sort === 'key' ? a.citationKey.localeCompare(b.citationKey) : a.revision.title.localeCompare(b.revision.title)));
    return list;
  }
  async function listRoutes(req, method, path, params) {
    if (path === '/library/documents' && method === 'GET') {
      const items = matching(params), offset = Number(params.get('offset') ?? 0), limit = Number(params.get('limit') ?? 30);
      return response({ items: items.slice(offset, offset + limit), total: items.length, offset, limit });
    }
    return undefined;
  }
  async function organizationRoutes(req, method, path, params) {
    if (path === '/library/folders' && method === 'GET') return response(folders);
    if (path === '/library/tags' && method === 'GET') return response(tags);
    if ((path === '/library/folders' || path === '/library/tags') && method === 'POST') {
      const { name } = await read(req), tag = { id: randomUUID(), name };
      tags.push(tag);
      if (path === '/library/tags') return response(tag, 201);
      const folder = { id: randomUUID(), name, tagId: tag.id }; folders.push(folder); return response(folder, 201);
    }
    const nameMatch = path.match(/^\/library\/tags\/([^/]+)$/);
    if (nameMatch && method === 'PUT') {
      const tag = tags.find(item => item.id === nameMatch[1]);
      if (!tag) return error('Tag not found', 404);
      tag.name = (await read(req)).name;
      return response(tag);
    }
    const folderMatch = path.match(/^\/library\/folders\/([^/]+)$/);
    if (folderMatch) {
      const folder = folders.find(item => item.id === folderMatch[1]);
      if (!folder) return error('Folder not found', 404);
      if (method === 'DELETE') { folders.splice(folders.indexOf(folder), 1); return new Response(null, { status: 204 }); }
      if (method === 'PUT') { folder.name = (await read(req)).name; return response(folder); }
    }
    return undefined;
  }
  async function membershipRoutes(req, method, path, params) {
    const tagMatch = path.match(/^\/library\/documents\/([^/]+)\/tags\/([^/]+)$/);
    if (tagMatch) {
      const document = documents.find(item => item.id === tagMatch[1]), tag = tags.find(item => item.id === tagMatch[2]);
      if (!document || !tag) return error('Not found', 404);
      if (method === 'PUT' && !document.tags.some(item => item.id === tag.id)) document.tags.push(tag);
      if (method === 'DELETE') document.tags = document.tags.filter(item => item.id !== tag.id);
      return response(document);
    }
    if (path === '/library/key-availability') {
      const key = params.get('key') ?? '';
      return response({ valid: /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/.test(key), available: !documents.some(document => document.id !== params.get('documentId') && document.citationKey.toLowerCase() === key.toLowerCase()) });
    }
    if (/^\/library\/documents\/[^/]+\/usage$/.test(path)) return response([]);
    return undefined;
  }
  async function documentRoutes(req, method, path, params) {
    if (path === '/documents' && method === 'GET') return response(matching(params));
    if (path === '/documents' && method === 'POST') { const result = save(await read(req)); return result ? response(result, 201) : error('citation_key_conflict', 409); }
    return documentDetail(req, method, path);
    return undefined;
  }
  async function documentDetail(req, method, path) {
    const documentMatch = path.match(/^\/documents\/([^/]+)(?:\/(revisions|events|archive))?$/);
    if (documentMatch) {
      const current = documents.find(item => item.id === documentMatch[1]);
      if (!current) return error('Document not found', 404);
      if (documentMatch[2] === 'revisions') return response(histories.get(current.id));
      if (documentMatch[2] === 'events') return response([{ id: randomUUID(), eventType: 'created', occurredAt: createdAt }]);
      if (documentMatch[2] === 'archive') { current.status = 'archived'; return response(current); }
      if (method === 'GET') return response(current);
      if (method === 'PUT') {
        const body = await read(req); if (body.expectedRevision !== current.currentRevision) return error('Document changed', 409);
        const result = save(body, current); return result ? response(result) : error('citation_key_conflict', 409);
      }
    }
    return undefined;
  }
  async function previewRoute(req, method, path, params) {
    if (path === '/library/bibtex/preview' && method === 'POST') {
      const body = await read(req), key = body.content.match(/@\w+\s*\{\s*([^,]+)/)?.[1]?.trim() ?? 'Imported2025';
      const title = body.content.match(/title\s*=\s*\{([^}]+)\}/i)?.[1] ?? 'Imported project source';
      const conflict = documents.find(document => document.citationKey.toLowerCase() === key.toLowerCase());
      return response({ entries: [{ index: 0, citationKey: key, title, bibliography: { type: 'book', authors: [], editors: [], issued: '2025', extra: {} }, sourceUrl: null, description: null, conflictDocumentId: conflict?.id ?? null, duplicateCandidates: conflict ? [conflict] : [], warnings: [] }], warnings: [] });
    }
    return undefined;
  }
  function importDecision(body, decision) {
    let document = documents.find(item => item.id === decision.documentId);
    if (decision.action !== 'link') document = save({ citationKey: decision.citationKey || body.content.match(/@\w+\s*\{\s*([^,]+)/)?.[1]?.trim(), title: body.content.match(/title\s*=\s*\{([^}]+)\}/i)?.[1] ?? 'Imported project source' }, decision.action === 'update' ? document : null);
    if (!document) return null;
    const folder = folders.find(item => item.id === body.folderId), tag = tags.find(item => item.id === folder?.tagId);
    if (tag && !document.tags.some(item => item.id === tag.id)) document.tags.push(tag);
    return document;
  }
  async function importRoute(req, method, path, params) {
    if (path === '/library/bibtex/import' && method === 'POST') {
      const body = await read(req);
      if (receipts.has(body.operationId)) return response(receipts.get(body.operationId));
      const imported = [];
      let skipped = 0;
      for (const decision of body.decisions) {
        if (decision.action === 'skip') { skipped++; continue; }
        const document = importDecision(body, decision);
        if (!document) return error('citation_key_conflict', 409);
        imported.push(document);
      }
      const result = { documents: imported, skipped }; receipts.set(body.operationId, result); return response(result);
    }
    return undefined;
  }
  async function exportRoute(req, method, path, params) {
    if (path === '/library/bibtex/export') {
      let items = matching(new URLSearchParams({ status: params.has('documentIds') ? 'all' : 'active', ...(params.get('folderId') ? { folderId: params.get('folderId') } : {}) }));
      if (params.get('documentIds')) items = items.filter(document => params.get('documentIds').split(',').includes(document.id));
      const bibliography = items.map(document => `@${document.revision.bibliography.type}{${document.citationKey},\n  title = {${document.revision.title}}\n}\n`).join('\n');
      const withFiles = params.get('includeFiles') === 'true';
      return new Response(withFiles ? bibliographyZip(bibliography) : bibliography, { headers: { 'Content-Type': withFiles ? 'application/zip' : 'text/x-bibtex; charset=utf-8', 'Content-Disposition': `attachment; filename="documents.${withFiles ? 'zip' : 'bib'}"` } });
    }
    return undefined;
  }
  return async function handle(req, method, url) {
    const path = url.pathname.replace('/api/document', '');
    for (const handler of [listRoutes, organizationRoutes, membershipRoutes, documentRoutes, previewRoute, importRoute, exportRoute]) {
      const result = await handler(req, method, path, url.searchParams);
      if (result !== undefined) return result;
    }
    return undefined;
  };
}
