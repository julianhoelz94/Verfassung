import { requireSessionBearer } from '../../../../../../../lib/session';

export async function GET(_: Request, context: { params: Promise<{ id: string; revision: string }> }) {
  const { id, revision } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(revision)) return new Response(null, { status: 404 });
  const authorization = await requireSessionBearer();
  const base = process.env.DOCUMENT_API_URL ?? 'http://localhost/api/document';
  const upstream = await fetch(`${base}/documents/${id}/revisions/${revision}/file`, {
    headers: { Authorization: authorization }, cache: 'no-store',
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('Content-Disposition') ?? 'attachment',
    },
  });
}
