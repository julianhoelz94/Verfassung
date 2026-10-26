import { NextRequest, NextResponse } from 'next/server';
import { EditorApiError, getStructuredDraft } from '../../../lib/editor-api';
import type { DraftNode } from '../../../lib/structured-editor';
import { getVersionSettings } from '../../../lib/api';

/** Fetch unselected trees only when an editor asks to navigate the broader outline. */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'session_id' }, { status: 400 });
  try {
    const preview = await getStructuredDraft(sessionId);
    if (!preview) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const rootId = request.nextUrl.searchParams.get('rootId');
    if (rootId && !preview.roots.some(root => root.logicalId === rootId)) return NextResponse.json({ error: 'root_not_found' }, { status: 404 });
    const scope = request.nextUrl.searchParams.get('scope');
    const settings = await getVersionSettings(preview.sourceVersionId);
    if (!settings) return NextResponse.json({ error: 'settings_unavailable' }, { status: 503 });
    const stop = scope === 'constitution' ? 0 : settings.outline.kinds.findIndex(kind => kind.kindCode === scope);
    if (!rootId && stop < 0) return NextResponse.json({ error: 'invalid_scope' }, { status: 400 });
    function project(node: DraftNode, depth: number): DraftNode {
      return { ...node, content: depth >= stop ? [] : node.content.flatMap(entry => entry.node ? [{ ...entry, node: project(entry.node, depth + 1) }] : []) };
    }
    const select = (roots: DraftNode[]) => roots.map(root => rootId ? root.logicalId === rootId ? root : { ...root, content: [] } : project(root, 0));
    return NextResponse.json({ ...preview, roots: select(preview.roots), sourceRoots: select(preview.sourceRoots) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof EditorApiError) return NextResponse.json({ error: error.key }, { status: error.key === 'sign_in' ? 401 : 403 });
    throw error;
  }
}
