import { NextRequest, NextResponse } from 'next/server';
import { getExportedUnits } from '../../../../lib/api';
import { loadConstitutionCollection } from '../../../../lib/country-directory';
import { flattenLifecycleUnits } from '../../../../lib/lifecycle-workspace';
import { publicVersions } from '../../../../lib/reading';
import { currentUser } from '../../../../lib/session';

/** Only published versions belonging to the selected constitution can supply provision IDs. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user?.roles.some(role => role === 'publisher' || role === 'admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const query = request.nextUrl.searchParams;
  const constitutionId = query.get('constitutionId') ?? '', versionId = query.get('versionId') ?? '';
  const jurisdictionId = query.get('jurisdictionId'), code = query.get('code')?.toUpperCase();
  if (![constitutionId, versionId].every(id => /^[0-9a-f-]{36}$/i.test(id)) || (jurisdictionId ? !/^[0-9a-f-]{36}$/i.test(jurisdictionId) : !/^[A-Z]{2}$/.test(code ?? ''))) return NextResponse.json({ error: 'parameters' }, { status: 400 });
  try {
    const context = await loadConstitutionCollection(jurisdictionId ? { id: jurisdictionId } : { code });
    const constitution = context?.collection.constitutions.find(item => item.id === constitutionId);
    const version = constitution && publicVersions(constitution.versions).find(item => (item.currentVersionId ?? item.id) === versionId);
    if (!version) return NextResponse.json({ error: 'version' }, { status: 404 });
    const content = await getExportedUnits(versionId);
    if (!content) return NextResponse.json({ error: 'unavailable' }, { status: 502 });
    return NextResponse.json({ units: flattenLifecycleUnits(content.roots) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'unavailable' }, { status: 502 }); }
}
