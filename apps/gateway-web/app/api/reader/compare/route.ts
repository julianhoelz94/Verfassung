import { NextRequest, NextResponse } from 'next/server';
import { getVersion, listAllUnits } from '../../../../lib/api';
import { readerChanges } from '../../../../lib/reader';

/** Public comparisons require two published snapshots from the same constitution. */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from'), to = request.nextUrl.searchParams.get('to');
  const constitutionId = request.nextUrl.searchParams.get('constitutionId');
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!from || !to || !constitutionId || ![from, to, constitutionId].every(value => /^[a-zA-Z0-9-]{1,128}$/.test(value))) return NextResponse.json({ code: 'invalid_comparison' }, { status: 400, headers });
  try {
    const [left, right] = await Promise.all([getVersion(from), getVersion(to)]);
    if (!left || !right || left.publicationStatus !== 'published' || right.publicationStatus !== 'published' ||
      left.constitutionId !== constitutionId || right.constitutionId !== constitutionId) {
      return NextResponse.json({ code: 'comparison_not_found' }, { status: 404, headers });
    }
    if (from === to) return NextResponse.json({ from, to, changes: [] }, { headers });
    const [before, after] = await Promise.all([listAllUnits(from, true), listAllUnits(to, true)]);
    return NextResponse.json({ from, to, changes: readerChanges(before, after) }, { headers });
  } catch {
    return NextResponse.json({ code: 'comparison_unavailable' }, { status: 503, headers });
  }
}
