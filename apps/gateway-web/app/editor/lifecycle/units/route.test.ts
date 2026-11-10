import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ user: vi.fn(), collection: vi.fn(), content: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ currentUser: mocks.user }));
vi.mock('../../../../lib/country-directory', () => ({ loadConstitutionCollection: mocks.collection }));
vi.mock('../../../../lib/api', () => ({ getExportedUnits: mocks.content }));
import { GET } from './route';
const constitutionId = '01900000-0000-4000-8000-000000000002', versionId = '01900000-0000-4000-8000-000000000004';
const request = () => new NextRequest(`http://localhost/editor/lifecycle/units?code=DE&constitutionId=${constitutionId}&versionId=${versionId}`);
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ roles: ['publisher'] }); mocks.collection.mockResolvedValue({ collection: { constitutions: [{ id: constitutionId, versions: [{ id: versionId, listing: 'public', latestPublished: true }] }] } }); mocks.content.mockResolvedValue({ roots: [] }); });
describe('provision version boundary', () => {
  it('rejects readers without fetching content', async () => { mocks.user.mockResolvedValue({ roles: ['reader'] }); expect((await GET(request())).status).toBe(403); expect(mocks.content).not.toHaveBeenCalled(); });
  it('rejects versions belonging to another constitution', async () => { mocks.collection.mockResolvedValue({ collection: { constitutions: [{ id: 'other', versions: [{ id: versionId }] }] } }); expect((await GET(request())).status).toBe(404); expect(mocks.content).not.toHaveBeenCalled(); });
  it('rejects an unpublished version', async () => { mocks.collection.mockResolvedValue({ collection: { constitutions: [{ id: constitutionId, versions: [{ id: versionId, listing: 'staff' }] }] } }); expect((await GET(request())).status).toBe(404); });
  it('returns published units without shared caching and reports service failure', async () => { const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(await response.json()).toEqual({ units: [] }); mocks.content.mockRejectedValue(new Error('unavailable')); expect((await GET(request())).status).toBe(502); });
});
