import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import { currentUser } from '../../../../lib/session';
import { attachDocument, createLinkedDocument, detachDocument, listDocumentLinks } from '../../../../lib/document-api';

vi.mock('../../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: async () => 'Bearer session' }));
vi.mock('../../../../lib/document-api', () => ({ attachDocument: vi.fn(), createLinkedDocument: vi.fn(), detachDocument: vi.fn(), listDocumentLinks: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(currentUser).mockResolvedValue({ id: 'editor', email: 'editor@example.test', roles: ['editor'] }); });
function request(patch: Record<string, string> = {}, origin = 'http://localhost') {
  const data = new FormData();
  for (const [key,value] of Object.entries({ command:'create',targetType:'amendment',targetId:'law',scopeRevisionId:'draft',operationId:'operation',title:'New law',sourceUrl:'https://example.org/law',...patch })) data.set(key,value);
  return new NextRequest('http://localhost/editor/documents/command', { method:'POST',headers:{origin,host:'localhost'},body:data });
}
it('rejects cross-origin, anonymous, and read-only writes before contacting Document',async()=>{
  expect((await POST(request({},'https://other.example'))).status).toBe(403);
  vi.mocked(currentUser).mockResolvedValue(null);expect((await POST(request())).status).toBe(401);
  vi.mocked(currentUser).mockResolvedValue({id:'reviewer',email:'reviewer@example.test',roles:['reviewer']});expect((await POST(request())).status).toBe(403);
  expect(createLinkedDocument).not.toHaveBeenCalled();expect(attachDocument).not.toHaveBeenCalled();
});
it('forwards one create-and-link operation with the exact draft scope, without a second attach',async()=>{
  vi.mocked(createLinkedDocument).mockResolvedValue({id:'document'} as never);
  const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({document:{id:'document'}});
  expect(createLinkedDocument).toHaveBeenCalledWith('amendment','law',{operationId:'operation',title:'New law',description:'',sourceUrl:'https://example.org/law',scopeRevisionId:'draft'},null,'Bearer session');
  expect(attachDocument).not.toHaveBeenCalled();expect(detachDocument).not.toHaveBeenCalled();
});
it('returns attachment state in place and never changes a document revision',async()=>{
  vi.mocked(attachDocument).mockResolvedValue([]);vi.mocked(detachDocument).mockResolvedValue([]);
  expect((await POST(request({command:'attach',documentId:'document',revisionId:'revision'}))).status).toBe(200);
  expect(attachDocument).toHaveBeenCalledWith('amendment','law','document','revision','Bearer session','draft');
  expect((await POST(request({command:'detach',documentId:'document'}))).status).toBe(200);
  expect(detachDocument).toHaveBeenCalledWith('amendment','law','document','Bearer session','draft');
  expect(createLinkedDocument).not.toHaveBeenCalled();
});
it('keeps service errors explicit and inspection read-only',async()=>{
  vi.mocked(createLinkedDocument).mockRejectedValue(new Error('unavailable'));expect((await POST(request())).status).toBe(502);
  vi.mocked(listDocumentLinks).mockResolvedValue([]);
  expect((await GET(new NextRequest('http://localhost/editor/documents/command?targetType=amendment&targetId=law&scopeRevisionId=old'))).status).toBe(200);
  expect(listDocumentLinks).toHaveBeenCalledWith('amendment','law','old','Bearer session');
});
