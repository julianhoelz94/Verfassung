import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getConstitutionLifecycle, getCountry, getVersion, getVersionSettings, listConstitutionVersions } from '../../../lib/api';
import { ConstitutionMetadataError, getConstitutionMetadata, saveConstitutionMetadata } from '../../../lib/constitution-metadata';
import { currentUser, requireSessionBearer } from '../../../lib/session';

const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { 'Cache-Control': 'no-store' };
const result = (key: string, status: number) => NextResponse.json({ error: key }, { status, headers: noStore });

async function access(write: boolean) {
  const user = await currentUser();
  if (!user) return result('sign_in', 401);
  if (!user.roles.some(role => (write ? ['admin', 'editor'] : ['admin', 'editor', 'reviewer', 'publisher']).includes(role))) return result('forbidden', 403);
  return await requireSessionBearer();
}

function trustedOrigin(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host') ?? request.nextUrl.host;
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? request.nextUrl.protocol.replace(':', '');
    return url.host === host && url.protocol === `${protocol}:`;
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  const authorization = await access(false);
  if (authorization instanceof NextResponse) return authorization;
  const id = request.nextUrl.searchParams.get('constitutionId') ?? '', versionId = request.nextUrl.searchParams.get('versionId') ?? '';
  const requestedCode = request.nextUrl.searchParams.get('code')?.toUpperCase();
  if (!identifier.test(id) || !identifier.test(versionId) || (requestedCode && !/^[A-Z]{2}$/.test(requestedCode))) return result('invalid', 400);
  try {
    const version = await getVersion(versionId, authorization);
    if (!version || version.constitutionId !== id) return result('not_found', 404);
    const code = version.countryCode?.toUpperCase() ?? requestedCode;
    if (requestedCode && version.countryCode && requestedCode !== version.countryCode.toUpperCase()) return result('not_found', 404);
    if (!version.countryCode && requestedCode) {
      const country = await getCountry(requestedCode, authorization);
      if (!country?.constitutions.some(constitution => constitution.id === id)) return result('not_found', 404);
    }
    const [metadata, versions, settings, events] = await Promise.all([
      getConstitutionMetadata(id, authorization), listConstitutionVersions(id, { listing: 'all', authorization }),
      getVersionSettings(versionId, authorization), code ? getConstitutionLifecycle(code) : Promise.resolve(null),
    ]);
    if (!metadata) return result('not_found', 404);
    return NextResponse.json({ metadata, version, versionFacts: versions?.find(item => item.id === versionId || item.currentVersionId === versionId) ?? null, outline: settings?.outline ?? null, events: (events ?? []).filter(event => event.constitutionId === id) }, { headers: noStore });
  } catch { return result('unavailable', 503); }
}

export async function PUT(request: NextRequest) {
  if (!trustedOrigin(request)) return result('forbidden', 403);
  const authorization = await access(true);
  if (authorization instanceof NextResponse) return authorization;
  const id = request.nextUrl.searchParams.get('constitutionId') ?? '';
  if (!identifier.test(id) || !request.headers.get('content-type')?.startsWith('application/json')) return result('invalid', 400);
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).some(key => !['expectedRevisionId', 'title', 'slug'].includes(key)) || typeof body.expectedRevisionId !== 'string' || !identifier.test(body.expectedRevisionId) || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200 || typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug.trim())) return result('invalid', 400);
  try {
    const saved = await saveConstitutionMetadata(id, { expectedRevisionId: body.expectedRevisionId, title: body.title.trim(), slug: body.slug.trim(), retainSlugAlias: true }, authorization);
    revalidatePath('/editor');
    revalidatePath('/countries', 'layout');
    return NextResponse.json(saved, { headers: noStore });
  } catch (error) {
    return error instanceof ConstitutionMetadataError ? result(error.key, error.status) : result('unavailable', 503);
  }
}
