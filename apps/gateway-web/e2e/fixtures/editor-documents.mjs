import { randomUUID } from 'node:crypto';

// Focused browser fixture. Persistence and rollback contracts are tested against PostgreSQL in DocumentApiTest.
export function editorDocuments() {
  const documents = new Map(), attachments = new Map(), receipts = new Map();
  return async function response(req, method, url) {
    const path = url.pathname;
    const link = path.match(/^\/api\/document\/links\/(constitution|version|amendment|amendment_material|change_material|lifecycle_material|import_job|setup_proposal|migration_run)\/([^/]+)(?:\/(documents|events|[^/]+))?$/);
    if (path === '/api/document/library/documents' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const items = [...documents.values()].filter(document => JSON.stringify(document).toLowerCase().includes(q));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return Response.json({items:items.slice(offset,offset+30),total:items.length,offset,limit:30});
    }
    if (path === '/api/document/documents' && method === 'GET') return Response.json([...documents.values()]);
    const revision = path.match(/^\/api\/document\/documents\/([^/]+)\/(revisions|events)$/);
    if (revision && method === 'GET') return Response.json(revision[2] === 'revisions' ? [documents.get(revision[1])?.revision].filter(Boolean) : []);
    if (!link) return;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    let scope = url.searchParams.get('scopeRevisionId') ?? '';
    let body;
    if (method === 'POST' && link[3] === 'documents') {
      const form = await new Response(bytes, { headers: { 'content-type': req.headers['content-type'] } }).formData();
      body = JSON.parse(await form.get('metadata').text()); scope = body.scopeRevisionId ?? '';
      const key = `${link[1]}:${link[2]}:${scope}`;
      if (receipts.has(body.operationId)) return Response.json(receipts.get(body.operationId), { status:201 });
      const id = randomUUID(), now = new Date().toISOString(), file = form.get('file');
      const document = { id, citationKey:body.citationKey??`doc-${id}`, tags:[], status:'active',currentRevision:1,createdAt:now,revision:{id:randomUUID(),documentId:id,revision:1,title:body.title,bibliography:body.bibliography??{type:'misc',authors:[],editors:[],extra:{}},description:body.description,sourceUrl:body.sourceUrl,fileName:file?.name??null,contentType:file?.type??null,createdAt:now,createdBy:'editor'} };
      documents.set(id,document); receipts.set(body.operationId,document);
      attachments.set(key,[...(attachments.get(key)??[]),{documentId:id,revisionId:document.revision.id,document,citationNote:body.citationNote??null}]);
      return Response.json(document,{status:201});
    }
    if (method === 'POST') { body=JSON.parse(bytes.toString());scope=body.scopeRevisionId??''; }
    const key = `${link[1]}:${link[2]}:${scope}`;
    if (method === 'GET') return Response.json(link[3]==='events'?[]:attachments.get(key)??[]);
    if (method === 'POST') {
      const document=documents.get(body.documentId);
      attachments.set(key,[...(attachments.get(key)??[]),{documentId:document.id,revisionId:body.revisionId,document,citationNote:body.citationNote??null}]);
    }
    if (method === 'DELETE') attachments.set(key,(attachments.get(key)??[]).filter(item=>item.documentId!==link[3]));
    return Response.json(attachments.get(key)??[]);
  };
}
