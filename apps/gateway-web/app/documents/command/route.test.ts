import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { currentUser } from '../../../lib/session';
import * as api from '../../../lib/document-api';

vi.mock('../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: async () => 'Bearer private-session' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../lib/document-api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../lib/document-api')>();
  return { ...actual, createDocument: vi.fn(), reviseDocument: vi.fn(), changeDocumentTag: vi.fn(), importDocumentBibtex: vi.fn(), previewDocumentBibtex: vi.fn(), readDocumentDownload: vi.fn(), listLibraryDocuments: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue({ id: 'editor', email: 'editor@example.test', roles: ['editor'] });
});
function post(body: Record<string, unknown>, origin = 'http://localhost') {
  return new NextRequest('http://localhost/documents/command', { method: 'POST', headers: { origin, host: 'localhost', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

it('denies anonymous, viewer, publisher-only and untrusted writes before owner calls', async () => {
  expect((await POST(post({ command: 'create' }, 'https://outside.example'))).status).toBe(403);
  vi.mocked(currentUser).mockResolvedValue(null);
  expect((await POST(post({ command: 'create' }))).status).toBe(401);
  for (const role of ['viewer', 'reviewer', 'publisher']) {
    vi.mocked(currentUser).mockResolvedValue({ id: role, email: `${role}@example.test`, roles: [role] });
    expect((await POST(post({ command: 'create' }))).status).toBe(403);
  }
  expect(api.createDocument).not.toHaveBeenCalled();
});

it('allows folder-scoped export to read-only staff and preserves the download without pagination', async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] });
  vi.mocked(api.readDocumentDownload).mockResolvedValue(new Response('@book{Law,title={Law}}', { headers: { 'Content-Type': 'text/x-bibtex; charset=utf-8', 'Content-Disposition': 'attachment; filename="project.bib"' } }));
  const response = await GET(new NextRequest('http://localhost/documents/command?action=export&folderId=project&offset=30&limit=30&q=ignored'));
  expect(response.status).toBe(200);
  expect(api.readDocumentDownload).toHaveBeenCalledWith({ folderId: 'project', documentIds: undefined, includeFiles: false }, 'Bearer private-session');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Content-Disposition')).toContain('project.bib');
  expect(await response.text()).toContain('@book{Law');
});

it('passes explicit folder import decisions and operation identity unchanged', async () => {
  vi.mocked(api.importDocumentBibtex).mockResolvedValue({ documents: [], skipped: 1 });
  const body = { command: 'bibtex-import', operationId: 'retry-123', folderId: 'project', content: '@book{Law,title={Law}}', decisions: [{ index: 0, action: 'link', documentId: 'existing' }] };
  expect((await POST(post(body))).status).toBe(200);
  expect(api.importDocumentBibtex).toHaveBeenCalledWith({ operationId: 'retry-123', folderId: 'project', content: body.content, decisions: body.decisions }, 'Bearer private-session');
  expect(api.createDocument).not.toHaveBeenCalled();
});

it('keeps key/revision conflicts distinct and supplies expected revision on metadata writes', async () => {
  vi.mocked(api.reviseDocument).mockRejectedValue(new api.DocumentApiError(409, 'key_conflict'));
  const response = await POST(post({ command: 'revise', documentId: 'law', title: 'Law', citationKey: 'Law1949', expectedRevision: 3 }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'conflict' });
  expect(api.reviseDocument).toHaveBeenCalledWith('law', expect.objectContaining({ expectedRevision: 3, citationKey: 'Law1949' }), 'Bearer private-session');
});

it('validates pagination and file pins instead of exposing an arbitrary download proxy', async () => {
  expect((await GET(new NextRequest('http://localhost/documents/command?action=list&limit=500'))).status).toBe(400);
  expect((await GET(new NextRequest('http://localhost/documents/command?action=file&documentId=law&revision=-1'))).status).toBe(400);
  expect((await GET(new NextRequest('http://localhost/documents/command?action=https://outside.example'))).status).toBe(400);
  expect(api.readDocumentDownload).not.toHaveBeenCalled();
  expect(api.listLibraryDocuments).not.toHaveBeenCalled();
});

it('streams selected folder ZIP exports with the file option and download headers', async () => {
  const bytes = new Uint8Array([80, 75, 3, 4]);
  vi.mocked(api.readDocumentDownload).mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="project.zip"' } }));
  const response = await GET(new NextRequest('http://localhost/documents/command?action=export&folderId=project&documentIds=a,b&includeFiles=true'));
  expect(api.readDocumentDownload).toHaveBeenCalledWith({ folderId: 'project', documentIds: 'a,b', includeFiles: true }, 'Bearer private-session');
  expect(response.headers.get('Content-Type')).toBe('application/zip');
  expect(response.headers.get('Content-Disposition')).toContain('project.zip');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});
