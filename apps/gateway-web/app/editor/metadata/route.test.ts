// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { getConstitutionLifecycle, getCountry, getVersion, getVersionSettings, listConstitutionVersions } from '../../../lib/api';
import { ConstitutionMetadataError, getConstitutionMetadata, saveConstitutionMetadata } from '../../../lib/constitution-metadata';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { GET, PUT } from './route';
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: vi.fn() }));
vi.mock('../../../lib/api', () => ({ getConstitutionLifecycle: vi.fn(), getCountry: vi.fn(), getVersion: vi.fn(), getVersionSettings: vi.fn(), listConstitutionVersions: vi.fn() }));
vi.mock('../../../lib/constitution-metadata', async original => ({ ...await original<typeof import('../../../lib/constitution-metadata')>(), getConstitutionMetadata: vi.fn(), saveConstitutionMetadata: vi.fn() }));
const constitutionId = '11111111-1111-4111-8111-111111111111', versionId = '22222222-2222-4222-8222-222222222222', revisionId = '33333333-3333-4333-8333-333333333333';
const metadata = { revisionId, title: 'Constitution', slug: 'constitution', predecessorId: null };
const url = `https://atlas.example/editor/metadata?constitutionId=${constitutionId}&versionId=${versionId}&code=DE`;
const write = (body: unknown = { expectedRevisionId: revisionId, title: 'New title', slug: 'new-slug' }, origin = 'https://atlas.example') => new NextRequest(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue({ id: 'editor', email: 'editor@example.test', roles: ['editor'] } as Awaited<ReturnType<typeof currentUser>>);
  vi.mocked(requireSessionBearer).mockResolvedValue('Bearer editor');
  vi.mocked(getConstitutionMetadata).mockResolvedValue(metadata);
  vi.mocked(getVersion).mockResolvedValue({ id: versionId, constitutionId, countryCode: 'DE', versionLabel: '1949', effectiveDate: '1949-05-23', languageCode: 'de', publicationStatus: 'published' });
  vi.mocked(listConstitutionVersions).mockResolvedValue([]);
  vi.mocked(getVersionSettings).mockResolvedValue({ id: 'settings', predecessorId: null, outline: { kinds: [] } });
  vi.mocked(getConstitutionLifecycle).mockResolvedValue([{ id: 'event', constitutionId, eventType: 'commenced', eventDate: '1949-05-23', dateCertainty: 'exact', note: null, sourceUrl: null }, { id: 'other', constitutionId: 'other', eventType: 'adopted', eventDate: '1900-01-01', dateCertainty: 'exact', note: null, sourceUrl: null }]);
  vi.mocked(saveConstitutionMetadata).mockResolvedValue({ ...metadata, title: 'New title', slug: 'new-slug' });
});
it('loads real selected-version facts and filters lifecycle events to its constitution', async () => {
  const response = await GET(new NextRequest(url)); const body = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body.metadata).toEqual(metadata); expect(body.events.map((event: { id: string }) => event.id)).toEqual(['event']);
  expect(getVersion).toHaveBeenCalledWith(versionId, 'Bearer editor');
  expect(listConstitutionVersions).toHaveBeenCalledWith(constitutionId, { listing: 'all', authorization: 'Bearer editor' });
});
it('rejects a version or country that belongs to a different constitution', async () => {
  vi.mocked(getVersion).mockResolvedValueOnce({ id: versionId, constitutionId: 'other' } as Awaited<ReturnType<typeof getVersion>>);
  expect((await GET(new NextRequest(url))).status).toBe(404); expect(getConstitutionMetadata).not.toHaveBeenCalled();
  expect((await GET(new NextRequest(url.replace('code=DE', 'code=FR')))).status).toBe(404);
});
it('checks country membership when a historical version has no country code', async () => {
  vi.mocked(getVersion).mockResolvedValue({ id: versionId, constitutionId } as Awaited<ReturnType<typeof getVersion>>);
  vi.mocked(getCountry).mockResolvedValue(null);
  expect((await GET(new NextRequest(url))).status).toBe(404);
});
it('saves only mutable identity fields while retaining prior URLs', async () => {
  const response = await PUT(write()); expect(response.status).toBe(200);
  expect(saveConstitutionMetadata).toHaveBeenCalledWith(constitutionId, { expectedRevisionId: revisionId, title: 'New title', slug: 'new-slug', retainSlugAlias: true }, 'Bearer editor');
});
it.each([{ title: 'New title', slug: 'new-slug' }, { expectedRevisionId: revisionId, title: 'Title', slug: 'Bad Slug' }, { expectedRevisionId: revisionId, title: 'Title', slug: 'slug', interim: true }, null])('rejects invalid or creation-only metadata %s', async body => {
  expect((await PUT(write(body))).status).toBe(400); expect(saveConstitutionMetadata).not.toHaveBeenCalled();
});
it('preserves a revision conflict instead of silently retrying against a newer record', async () => {
  vi.mocked(saveConstitutionMetadata).mockRejectedValue(new ConstitutionMetadataError(409, 'stale_metadata'));
  const response = await PUT(write()); expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'stale_metadata' });
  expect(saveConstitutionMetadata).toHaveBeenCalledTimes(1);
});
it('blocks cross-site writes and non-editor writes', async () => {
  expect((await PUT(write(undefined, 'https://other.example'))).status).toBe(403);
  vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'] } as Awaited<ReturnType<typeof currentUser>>);
  expect((await PUT(write())).status).toBe(403); expect(saveConstitutionMetadata).not.toHaveBeenCalled();
});
it('requires an authenticated editorial role even for reading the details workspace', async () => {
  vi.mocked(currentUser).mockResolvedValueOnce(null); expect((await GET(new NextRequest(url))).status).toBe(401);
  vi.mocked(currentUser).mockResolvedValueOnce({ roles: ['reader'] } as Awaited<ReturnType<typeof currentUser>>); expect((await GET(new NextRequest(url))).status).toBe(403);
});
it('reports unavailable Catalog data without leaking partial facts', async () => {
  vi.mocked(getConstitutionMetadata).mockRejectedValue(new Error('database details'));
  const response = await GET(new NextRequest(url)); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'unavailable' });
});
