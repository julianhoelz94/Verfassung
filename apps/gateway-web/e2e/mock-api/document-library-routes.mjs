import { documentLibraryFixture } from '../fixtures/document-library.mjs';
import { json, mockState, readBody } from './state.mjs';

let fixture;
export function handleDocumentLibrary(context) {
  const { pathname, method, res } = context;
  if (pathname === '/__reset' && method === 'POST') { fixture = undefined; return false; }
  if (pathname === '/__document_library' && method === 'POST') { fixture = documentLibraryFixture(); json(res, 200, {}); return true; }
  if (!pathname.startsWith('/api/document/')) return false;
  return respond(context);
}

async function respond({ req, res, method, url, pathname, searchParams }) {
  if (fixture) {
    const response = await fixture(req, method, url);
    if (!response) return false;
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return true;
  }
  // Existing opt-in fixtures retain their document identities when using the new picker.
  if (method === 'GET' && pathname === '/api/document/library/documents') {
    let documents = [];
    if (mockState.editorDocumentScenario) {
      const response = await mockState.editorDocumentScenario(req, 'GET', new URL('/api/document/documents', url));
      if (response?.ok) documents = await response.json();
    } else if (mockState.uiReview) documents = await mockState.uiReview.response(req, 'GET', '/api/document/documents', readBody) ?? [];
    const q = searchParams.get('q')?.toLowerCase();
    if (q) documents = documents.filter(document => JSON.stringify(document).toLowerCase().includes(q));
    const offset = Number(searchParams.get('offset') ?? 0), limit = Number(searchParams.get('limit') ?? 30);
    json(res, 200, { items: documents.slice(offset, offset + limit), total: documents.length, offset, limit });
    return true;
  }
  if (method === 'GET' && ['/api/document/library/folders', '/api/document/library/tags'].includes(pathname)) { json(res, 200, []); return true; }
  if (method === 'GET' && pathname.endsWith('/usage') && pathname.startsWith('/api/document/library/documents/')) { json(res, 200, []); return true; }
  if (method === 'GET' && pathname === '/api/document/library/key-availability') { json(res, 200, { valid: true, available: true }); return true; }
  return false;
}
