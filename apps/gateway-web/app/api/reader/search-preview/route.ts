import { NextRequest, NextResponse } from 'next/server';
import { getReaderOutline, getUnit, getVersion, listAllUnits } from '../../../../lib/api';
import { footnoteItems } from '../../../../lib/footnotes';
import { passageReaderHref, versionReaderHref } from '../../../../lib/reader-links';

/** The public preview never forwards staff credentials or follows a snapshot to its successor. */
export async function GET(request: NextRequest) {
  const versionId = request.nextUrl.searchParams.get('versionId'), articleId = request.nextUrl.searchParams.get('articleId');
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!versionId || !articleId || ![versionId, articleId].every(id => /^[a-zA-Z0-9-]{1,128}$/.test(id))) return NextResponse.json({ code: 'invalid_passage' }, { status: 400, headers });
  try {
    const version = await getVersion(versionId);
    const href = versionReaderHref(version, versionId);
    if (!version || version.id !== versionId || version.publicationStatus !== 'published' || !href) return NextResponse.json({ code: 'passage_not_found' }, { status: 404, headers });
    const [article, outline] = await Promise.all([getUnit(versionId, articleId), getReaderOutline(versionId)]);
    if (!article || article.versionId !== versionId || article.id !== articleId) return NextResponse.json({ code: 'passage_not_found' }, { status: 404, headers });
    let notes = footnoteItems(article.content ?? [], href);
    // Cross-root endnotes share the same published snapshot. Read their index once, not once per marker.
    const entries = article.content ?? [];
    const hasReferences = (items: typeof entries): boolean => items.some(entry => entry.references?.some(ref => ref.target.type === 'footnote' && !notes.some(note => note.logicalId === ref.target.footnoteId)) || (entry.node && hasReferences(entry.node.content)));
    if (hasReferences(entries)) notes = footnoteItems((await listAllUnits(versionId, true)).flatMap(unit => unit.content ?? []), href);
    return NextResponse.json({ article, outline, language: version.languageCode, versionId, versionLabel: version.versionLabel, readerHref: passageReaderHref(version, versionId, articleId), notes }, { headers });
  } catch { return NextResponse.json({ code: 'passage_unavailable' }, { status: 503, headers }); }
}
